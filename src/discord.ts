import * as Discord from 'discord.js';
import * as winston from 'winston';
import Events, { IEventChatMessage } from './events';

const webhookId = process.env.DISCORD_WEBHOOK_ID;
const webhookToken = process.env.DISCORD_WEBHOOK_TOKEN;

const token = process.env.DISCORD_TOKEN;

const channelId = process.env.DISCORD_CHANNEL_ID || '375031503710846976';
const serverId = process.env.DISCORD_SERVER_ID || '45.32.157.166:8777';

const RUN_DISCORD = process.env.RUN_DISCORD === 'true';

if (RUN_DISCORD && webhookId && webhookToken) {
  const hook = new Discord.WebhookClient(webhookId, webhookToken);

  // Send a message using the webhook
  setTimeout(() => {
    Events.filter(x => x.type === 'chat-message').subscribe((e: IEventChatMessage) => {
      winston.debug('chat-message', e);
      if (e.data && e.data.user && e.data.messageFriendly) {
        hook.send(e.data.messageFriendly, { username: e.data.user });
      }
    });
  }, 10 * 1000);
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
