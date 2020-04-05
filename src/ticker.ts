import { EventEmitter } from 'events';
import express from 'express';
import { Request } from 'express';
import { IServerModel } from './db';
import { IUploadedPlayer } from './types';

export let router = express.Router();
export let emitter = new EventEmitter();

router.get('/ticker', (req, res) => {
  res.render('ticker');
});

export function handleWs(ws: any, req: Request) {
  function listen(type: string, data: { server: IServerModel; player: IUploadedPlayer }) {
    const wsData = {
      type,
      server: data.server._id,
      serverName: data.server.name,
      player: data.player.player,
    };

    if (ws && !ws.closed) {
      ws.send(JSON.stringify(wsData));
    }
  }

  function ping() {
    if (ws && !ws.closed) {
      ws.send('PING');
    }
  }

  emitter.addListener('join', listen.bind(null, 'join'));
  emitter.addListener('left', listen.bind(null, 'left'));
  const interval = setInterval(ping, 30 * 1000);

  ws.on('error', () => {
    ws.closed = true;
    emitter.removeListener('join', listen);
    clearInterval(interval);
  });

  ws.on('close', () => {
    ws.closed = true;
    emitter.removeListener('join', listen);
    clearInterval(interval);
  });

  ping();
}
