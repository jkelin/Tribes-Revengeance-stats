import { Server } from 'http';
import SocketIO from 'socket.io';
import Events from './events';
import { getServerPlayerCount } from './servers';
import { emptyDir } from 'fs-extra';
import { IPlayerCountChangeMessage } from './types';

export function initSocketIO(server: Server) {
  const io = SocketIO(server, { origins: '*:*' });

  io.on('connection', async (socket) => {
    socket.on('say', (data) => {
      const nameRegex = /^[A-Za-z0-9\| \-_\?\!\*\/:\.]{3,29}$/;
      const messageRegex = /^[A-Za-z0-9\| \-_\?\!\*\/:\.]{1,196}$/;
      if (nameRegex.test(data.usr) && messageRegex.test(data.message)) {
        Events.next({ type: 'say', data: { server: data.server, usr: data.usr, message: data.message } });
      }
    });

    socket.on('get-player-count', async () => {
      const players = await getServerPlayerCount();
      socket.emit('full-player-count', players);
    });
  });

  Events.filter((x) => x.type === 'chat-message').subscribe((e) => io.emit(e.type, e.data));
  Events.filter((x) => x.type === 'player-count-change').subscribe(async (e) => {
    const data = e.data as IPlayerCountChangeMessage;
    io.emit(e.type, { ...data, players: data.players.length });

    const dbPlayers = await getServerPlayerCount();
    dbPlayers.forEach((x) => {
      if (x.id === data.server) {
        x.players = data.players;
      }
    });
    io.emit('full-player-count', dbPlayers);
  });

  Events.subscribe((e) => console.info('EVENT:', e));
}
