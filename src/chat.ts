import axios, { AxiosRequestConfig } from 'axios';
import cheerio from 'cheerio';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import qs from 'qs';
import { Observable } from 'rxjs';
import url from 'url';

import iconv from 'iconv-lite';
import { range, sortBy, sum, uniq, values } from 'lodash';
import moment from 'moment';
import { v4 } from 'uuid';
import QcMappings from './data/qcmappings.json';
import { IServerModel, redisClient, redisSubClient, Server } from './db';
import Events, { IEventChatMessage, IEventReceivedMessage, IEventSay, IPlayerCountChange, selfEventId } from './events';
import { IChatMessage, IPlayerCountChangeMessage } from './types';

const axiosInstance = axios.create({
  timeout: 1000,
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
  // responseEncoding: 'iso-8859-1',
  responseType: 'arraybuffer',
});

import 'rxjs/operator/debounceTime';
import { CronJob } from 'cron';

const chatCache: Record<string, IChatMessage[]> = {};
const activeChatRequests: Record<string, Promise<IChatMessage[]>> = {};

function createRedisBucket(date: Date | moment.Moment) {
  return moment(date).format('YYYY-MM-DDTHH');
}

export async function loadChatCacheFromRedis() {
  console.info('Loading chat cache from redis');
  const buckets = uniq(range(0, 180).map((m) => createRedisBucket(moment().subtract(180 - m, 'minutes'))));

  for (const bucket of uniq(buckets)) {
    console.debug('Reading message cache from redis bucket', bucket);
    const data = await redisClient!.LRANGE(bucket, 0, 1000);

    for (const item of data) {
      const message: IChatMessage = JSON.parse(item);

      if (message.id && message.when) {
        Events.next({ type: 'received-message', data: { ...message, when: new Date(message.when) } });
      }
    }
  }

  console.info('Bootstrapped chat cache with', sum(values(chatCache).map((x) => x.length)), 'messages');
}

function arraysMatch<T>(a: T[], b: T[]) {
  if (a.length !== b.length) {
    return false;
  }

  for (const i in a) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

function findMaxMachingArrLen<T>(a: T[], b: T[]) {
  let maxLen = 0;

  for (let i = 0; i < b.length; i++) {
    const len = i + 1;
    const sliceA = a.slice(-len);
    const sliceB = b.slice(0, len);

    if (arraysMatch(sliceA, sliceB)) {
      maxLen = len;
    }
  }

  return maxLen;
}

function newItems<T>(oldArr: T[], newArr: T[], hasherOld: (x: T) => string, hasherNew: (x: T) => string) {
  const a = oldArr.map(hasherOld);
  const b = newArr.map(hasherNew);
  const len = findMaxMachingArrLen(a, b);
  return newArr.slice(len);
}

function hashStringIntoNumber(str: string) {
  const buf = crypto.createHash('md5').update(str).digest();

  // return buf.readInt32LE(0);
  return buf.toString('hex').slice(0, 6);
}

function makeMessageFromRaw(message: string) {
  const matches = /\((QuickChat|TeamQuickChat)\) ([A-Za-z_0-9]+)\?/g.exec(message);

  if (matches && matches.length > 2) {
    if (matches[2] in QcMappings) {
      return `(${matches[1]}) ${QcMappings[matches[2]]}`;
    }

    return message;
  } else {
    return message;
  }
}

function getServerChat(serverId: string, server: string, username: string, password: string) {
  const u = url.parse(server, true);
  u.auth = username + ':' + password;
  u.pathname = '/ServerAdmin/current_console_log';

  return axiosInstance
    .get((u as any).format())
    .then((resp) => cheerio.load(iconv.decode(resp.data, 'iso-8859-1')))
    .then(($) => {
      const contents = $('table tr:nth-child(2) td:nth-child(2)').contents();

      const messages: { user: string; message: string }[] = [];

      // tslint:disable-next-line:prefer-for-of
      for (let i = 0; i < contents.length; i++) {
        const x = contents[i];

        if (x.type !== 'text' || !x.data || !x.data.trim()) {
          continue;
        }

        const groups = /^>( ([^:]{1,29}):)?(.*)$/.exec(x.data.trim());

        if (!groups || groups.length < 4) {
          continue;
        }

        messages.push({
          user: (groups[2] || '').trim() || 'WebAdmin',
          message: (groups[3] || '').trim(),
        });
      }

      return messages;
    })
    .then((m) => {
      let cache = chatCache[serverId];
      if (!cache) {
        cache = chatCache[serverId] = [];
      }

      const hash = (x: { user: string; message: string }) => hashStringIntoNumber(x.user + x.message);

      const newMessages = newItems(cache, m, hash, hash);

      for (const newMsg of newMessages) {
        const msg: IChatMessage = {
          when: new Date(),
          id: v4(),
          user: newMsg.user,
          message: newMsg.message,
          messageFriendly: makeMessageFromRaw(newMsg.message),
          server: serverId,
          origin: selfEventId,
        };

        cache.push(msg);
        Events.next({ type: 'chat-message', data: msg });
      }

      return cache;
    });
}

async function queryServersForChat() {
  const servers: IServerModel[] = await Server.where('chat', { $exists: true })
    .where('chat.enabled')
    .equals(true)
    .find()
    .exec();

  async function serverChatPromise(server: IServerModel) {
    try {
      const chat = await getServerChat(server._id, server.chat.server, server.chat.username, server.chat.password);

      console.debug('Got server chat from', { id: server._id });

      server.chat.ok = true;
      await server.save();
      delete activeChatRequests[server._id];

      return chat;
    } catch (ex) {
      console.info('Error getting chat from ' + server._id, ex.message);

      server.chat.ok = false;
      await server.save();
      delete activeChatRequests[server._id];

      return [];
    }
  }

  const promises: Promise<unknown>[] = servers
    .filter((server) => !activeChatRequests[server._id])
    .map((server) => (activeChatRequests[server._id] = serverChatPromise(server)));

  return Promise.all(promises);
}

export function startQueryingServersForChat() {
  return new CronJob({
    cronTime: '* * * * * *',
    onTick: queryServersForChat,
    start: true,
    runOnInit: true,
  });
}

export function getChatFor(server: string) {
  return (chatCache[server] || []).filter((x) => x.when.getTime() > Date.now() - 2 * 60 * 60 * 1000);
}

function serverFromId(id: string) {
  return Observable.fromPromise<IServerModel | null>(Server.findById(id).exec());
}

Events.filter((x) => x.type === 'received-message').subscribe((newMessage: IEventReceivedMessage) => {
  let oldCache = chatCache[newMessage.data.server];

  if (!oldCache) {
    oldCache = [];
  }

  if (!oldCache.find((x) => x.id === newMessage.data.id)) {
    oldCache = oldCache.concat([newMessage.data]);
  }

  oldCache = sortBy(oldCache, (x: IChatMessage) => x.when);
  const newCache: IChatMessage[] = [];

  let lastUnique: IChatMessage | undefined;
  for (const item of oldCache) {
    if (
      lastUnique &&
      lastUnique.message === item.message &&
      lastUnique.when > new Date(item.when.getTime() - 1000 * 60 * 15)
    ) {
      continue;
    }

    lastUnique = item;
    newCache.push(lastUnique);
  }

  // console.warn("old:", oldCache, "\nnew:", newCache);
  chatCache[newMessage.data.server] = newCache;

  if (newCache.find((x) => x.id === newMessage.data.id)) {
    Events.next({ type: 'chat-message', data: newMessage.data });
  }
});

const sayMessages$ = Events.filter((x) => x.type === 'say')
  .flatMap((m: IEventSay) =>
    serverFromId(m.data.server)
      .filter((x) => !!x)
      .map((s) => ({
        user: m.data.usr,
        message: m.data.message,
        server: s!.chat.server,
        username: s!.chat.username,
        password: s!.chat.password,
      }))
  )
  .publish()
  .refCount();

sayMessages$
  .debounce(() => Observable.interval(500))
  .flatMap(({ user, message, server, username, password }) => {
    const u = url.parse(server, true);
    u.auth = username + ':' + password;
    u.pathname = '/ServerAdmin/current_console';

    // let options = {
    //     uri: u.format(),
    //     method: "POST",
    //     form: {
    //         SendText: `say ${user}: ${message}`,
    //         Send: "Send"
    //     }
    // };

    const post = axiosInstance.post(
      (u as any).format(),
      qs.stringify({
        SendText: `say ${user}: ${message}`,
        Send: 'Send',
      })
    );

    return Observable.fromPromise(post.then((x) => x.data));
  })
  .subscribe();

export function publishMessagesToRedis() {
  async function handleMsg(msg: IEventChatMessage) {
    const now = moment();
    const bucket = createRedisBucket(now);
    const data = JSON.stringify(msg.data);

    await redisClient!.lpush(bucket, data);
    await redisClient!.expireat(bucket, moment(bucket).add(2, 'hours').unix());
    await redisClient!.publish('chat-message', data);
  }

  const sub1 = Events.filter((x) => x.type === 'chat-message' && x.data.origin === selfEventId).subscribe(handleMsg);

  const sub2 = Events.filter(
    (x) => x.type === 'player-count-change' && x.data.origin === selfEventId
  ).subscribe((msg: IPlayerCountChange) => redisClient!.publish('player-count-change', JSON.stringify(msg.data)));

  return [sub1, sub2];
}

export function subscribeToMessagesFromRedis() {
  redisSubClient!.subscribe('chat-message');
  redisSubClient!.subscribe('player-count-change');

  redisSubClient!.on('message', (channel, data) => {
    const message = JSON.parse(data);

    if (message.origin === selfEventId) {
      return;
    }

    if (channel === 'chat-message') {
      Events.next({ type: 'received-message', data: { ...message, when: new Date(message.when) } });
    }

    if (channel === 'player-count-change') {
      Events.next({ type: 'player-count-change', data: message });
    }
  });

  return () => {
    redisSubClient?.UNSUBSCRIBE('chat-message', 'player-count-change');
  };
}
