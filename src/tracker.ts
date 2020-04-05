import * as atob from 'atob';
import * as express from 'express';
import * as geoip from 'geoip-lite';

import { max, mean, min } from 'lodash';
import { promisify } from 'util';
import { isValid } from './anticheat';
import { influx, IPlayer, IPlayerModel, IServer, IServerModel, Match, Player, Server } from './db';
import Events, { selfEventId } from './events';
import { cleanPlayerName, getClientIp, getFullMapName } from './helpers';
import { emitter } from './ticker';
import { IFullReport, ITribesServerQueryResponse, IUploadedData, IUploadedPlayer } from './types';

import * as asyncHandler from 'express-async-handler';

export const router = express.Router();

const persistentPlayerCounts: Record<string, number> = {};

export async function handleTribesServerData(data: ITribesServerQueryResponse) {
  // console.log(data);
  if (!data.ip && !data.hostport) {
    return console.error('[handleTribesServerData] Server does not have an id', data);
  }

  const serverAddress = data.ip + ':' + data.hostport;

  console.debug('Handling server data from', serverAddress);

  const server = await findOrCreateServer(serverAddress);

  const minutesSinceLastTiming = (Date.now() - server.lastTiming.getTime()) / (60 * 1000);

  server.name = data.hostname;
  server.adminname = data.adminname;
  server.adminemail = data.adminemail;
  server.ip = data.ip;
  server.port = data.hostport;
  server.maxplayers = data.maxplayers;
  server.lastseen = new Date();
  server.minutesonline = (server.minutesonline || 0) + minutesSinceLastTiming;

  if (!server.country) {
    const location = geoip.lookup(server.ip);
    server.country = location.country.toLowerCase();
  }

  server.lastdata = data;

  if (server.lastdata.mapname) {
    server.lastdata.mapnamefull = getFullMapName(server.lastdata.mapname);
  }

  if (data.players.length !== persistentPlayerCounts[`${server.ip}:${server.port}`]) {
    Events.next({
      type: 'player-count-change',
      data: {
        server: `${server.ip}:${server.port}`,
        players: data.players.length,
        origin: selfEventId,
      },
    });

    persistentPlayerCounts[`${server.ip}:${server.port}`] = data.players.length;
  }

  const promises = [pushPlayersTrackings(serverAddress, data), ...data.players.map(timePlayer)];

  await Promise.all(promises);
  await server.save();

  console.debug('Saved server', serverAddress);
}

const lastTrackings: Record<string, number> = {};

async function findOrCreateServer(id: string): Promise<IServerModel> {
  let server: IServerModel = await Server.where('_id')
    .equals(id)
    .findOne()
    .exec();

  if (server === null) {
    server = new Server({
      _id: id,
      minutesonline: 0,
      lastTiming: new Date(),
    } as IServer);
  }

  return server;
}

export async function pushPlayersTrackings(serverIdIn: string, data: ITribesServerQueryResponse) {
  if (!lastTrackings[serverIdIn]) {
    lastTrackings[serverIdIn] = 0;
  }

  await influx.writePoints(
    [
      {
        measurement: 'population',
        fields: {
          players: data.numplayers,
        },
        tags: {
          server: serverIdIn,
        },
      },
    ],
    {
      database: 'tribes',
    }
  );

  if (lastTrackings[serverIdIn] + 60 * 1000 >= Date.now()) {
    return;
  }
  lastTrackings[serverIdIn] = Date.now();
}

export async function timePlayer(player: IUploadedPlayer) {
  if (!player.player) {
    return console.error('[timePlayer] Player does not have a name', player);
  }

  const pl = await findOrCreatePlayer(player.name);

  const minutesSinceLastTiming = (Date.now() - pl.lastTiming.getTime()) / (60 * 1000);
  pl.normalizedName = cleanPlayerName(player.player + '');
  pl.minutesonline = (pl.minutesonline || 0) + minutesSinceLastTiming;
  pl.lastTiming = new Date();
  pl.lastseen = new Date();

  await pl.save();

  console.debug('Timed player', player.player);
}

async function findOrCreatePlayer(player: string): Promise<IPlayerModel> {
  let pl = await findPlayerById(player);

  if (!pl) {
    pl = createPlayer(player);
  }

  return pl;
}

function createPlayer(player: string): IPlayerModel {
  return new Player({
    _id: player,
    normalizedName: cleanPlayerName(player + ''),
    stats: {},
    score: 0,
    kills: 0,
    deaths: 0,
    offense: 0,
    defense: 0,
    style: 0,
    minutesonline: 0,
    lastTiming: new Date(),
  } as IPlayer);
}

async function findPlayerById(player: string): Promise<IPlayerModel> {
  return await Player.where('_id')
    .equals(player)
    .findOne()
    .exec();
}

function updatePlayerStatsFromInput(player: IPlayerModel, input: IUploadedPlayer) {
  if (player.offense === undefined) {
    player.offense = 0;
  }

  player.normalizedName = cleanPlayerName(input.name);
  player.ip = input.ip;

  if (!player.score) {
    player.score = 0;
  }
  player.score += input.score;

  if (!player.kills) {
    player.kills = 0;
  }
  player.kills += input.kills;

  if (!player.deaths) {
    player.deaths = 0;
  }
  player.deaths += input.deaths;

  if (!player.offense) {
    player.offense = 0;
  }
  player.offense += input.offense;

  if (!player.defense) {
    player.defense = 0;
  }
  player.defense += input.defense;

  if (!player.style) {
    player.style = 0;
  }
  player.style += input.style;

  player.lastseen = new Date();

  if (!player.stats) {
    player.stats = {};
  }

  if (!player.stats.StatHighestSpeed) {
    player.stats.StatHighestSpeed = 0;
  }

  const highestSpeed = !input['StatClasses.StatHighestSpeed']
    ? 0
    : parseInt(input['StatClasses.StatHighestSpeed'] + '', 10);

  if (highestSpeed > player.stats.StatHighestSpeed) {
    player.stats.StatHighestSpeed = highestSpeed;
    player.markModified('stats');
  }

  // tslint:disable-next-line:forin
  for (const statFullName in input) {
    const statValue = input[statFullName];
    if (typeof statValue !== 'number') {
      continue;
    }

    console.debug('Handle player stat', { statName: statFullName, statValue });
    if (statFullName === 'StatClasses.StatHighestSpeed') {
      continue;
    }

    if (statFullName.includes('.')) {
      const statName = statFullName.split('.')[1];

      if (!player.stats[statName]) {
        player.stats[statName] = 0;
      }

      player.stats[statName] += statValue;
      // console.log("addded",name,value);
      player.markModified('stats');
    }
  }
}

export async function handlePlayer(input: IUploadedPlayer, serverIp: string, serverPort: number) {
  console.debug('Handling player input', input);

  if (!input.name) {
    return console.error('Player does not have a name');
  }

  const player = await findOrCreatePlayer(input.name);

  player.lastserver = serverIp + ':' + serverPort;

  updatePlayerStatsFromInput(player, input);

  await player.save();
  console.debug('Updated stats for', input.name);
}

export async function addServerLastFullReport(ip: string, port: number) {
  const id = ip + ':' + port;
  const server = await Server.where('_id')
    .equals(id)
    .findOne()
    .exec();

  if (server == null) {
    console.warn('server null, _id:', id);
    return;
  }
  server.lastfullreport = new Date();
  await server.save();
}

export function removeDotStatNamesFromFullReport(fullReport: IUploadedData) {
  return {
    ...fullReport,
    players: fullReport.players.map(p => {
      const player = { ...p };
      // tslint:disable-next-line:forin
      for (const i in player) {
        const value = player[i];
        if (i.indexOf('.') !== -1) {
          const name = i.split('.')[1];
          delete player[i];
          player[name] = value;
        }
      }
      return player;
    }),
  };
}

export async function saveMatchResult(ip: string, port: number, fullReport: IUploadedData) {
  const id = ip + ':' + port;

  // Server.where({ _id: '45.32.157.166:8777' })
  const server: IServerModel = await Server.where('_id')
    .equals(id)
    .findOne()
    .exec();

  const match = new Match({
    server: id,
    when: new Date(),
    fullReport: removeDotStatNamesFromFullReport(fullReport),
    numplayers: parseInt(server.lastdata.numplayers + '', 10),
    basicReport: server.lastdata,
  });

  await match.save();
}

// This is needed for /upload
router.use('/upload', (req, res, next) => {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', chunk => {
    data += chunk;
  });

  req.on('end', () => {
    req.body = data;
    next();
  });
});

router.post(
  '/upload',
  asyncHandler(async (req, res) => {
    const ip = getClientIp(req);

    if (!ip) {
      console.info('Upload without an ip attempted?!');
      return;
    }

    res.send('Hello World!');
    console.info('Received /upload request from', { ip });
    console.debug('received upload request', { ip, data: req.body });
    const decoded = (atob as any)(req.body);
    const object: IUploadedData = JSON.parse(decoded); // TODO actually verify this

    object.players.forEach(p => (p.isUntracked = !isValid(p, object)));

    await Promise.all(object.players.filter(p => !p.isUntracked).map(player => handlePlayer(player, ip!, object.port)));

    await addServerLastFullReport(ip, object.port);

    await saveMatchResult(ip, object.port, object);
  })
);
