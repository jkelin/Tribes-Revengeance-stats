import Axios from 'axios';
import * as Discord from 'discord.js';
import * as https from 'https';
import * as winston from 'winston';
import Events, { IEventChatMessage, selfEventId } from './events';

const webhookId = process.env.DISCORD_WEBHOOK_ID;
const webhookToken = process.env.DISCORD_WEBHOOK_TOKEN;

const token = process.env.DISCORD_TOKEN;

const channelId = process.env.DISCORD_CHANNEL_ID || '375031503710846976';
const serverId = process.env.DISCORD_SERVER_ID || '45.32.157.166:8777';

const RUN_DISCORD = process.env.RUN_DISCORD === 'true';

if (RUN_DISCORD && webhookId && webhookToken) {
  const client = Axios.create({
    httpsAgent: new https.Agent({ keepAlive: true }),
  });

  Events.filter(x => x.type === 'chat-message' && x.data.origin === selfEventId).subscribe((e: IEventChatMessage) => {
    winston.debug('Posting chat-message to discord', e);
    if (e.data && e.data.user && e.data.messageFriendly) {
      client.post(`https://discordapp.com/api/webhooks/${webhookId}/${webhookToken}`, {
        content: e.data.messageFriendly,
        username: e.data.user,
      });
    }
  });
}

if (RUN_DISCORD && token) {
  const client = new Discord.Client();
  client.listenerCount = () => 0;
  client.login(token);

  client.on('message', message => {
    if (message.channel.id === channelId && !message.author.bot) {
      Events.next({
        type: 'say',
        data: {
          server: serverId,
          usr: message.author.username,
          message: message.content,
        },
      });
    }
  });
}
