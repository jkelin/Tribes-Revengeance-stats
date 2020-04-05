import { Server } from 'http';
import SocketIO from 'socket.io';
import Events from './events';

export function initSocketIO(server: Server) {
  const io = SocketIO(server, { origins: '*:*' });

  io.on('connection', (socket) => {
    socket.on('say', (data) => {
      const nameRegex = /^[A-Za-z0-9\| \-_\?\!\*\/:\.]{3,29}$/;
      const messageRegex = /^[A-Za-z0-9\| \-_\?\!\*\/:\.]{1,196}$/;
      if (nameRegex.test(data.usr) && messageRegex.test(data.message)) {
        Events.next({ type: 'say', data: { server: data.server, usr: data.usr, message: data.message } });
      }
    });
  });

  Events.filter((x) => x.type === 'chat-message').subscribe((e) => io.emit(e.type, e.data));
  Events.filter((x) => x.type === 'player-count-change').subscribe((e) => io.emit(e.type, e.data));

  Events.subscribe((e) => console.info('EVENT:', e));
}
