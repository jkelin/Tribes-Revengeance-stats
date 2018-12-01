import * as express from "express";
import { Request } from 'express';
import * as Events from "events";
import { IServerModel } from "./db";
import { IUploadedPlayer } from "./types";

export let router = express.Router();
export let emitter = new Events();

router.get('/ticker', function (req, res) {
  res.render('ticker');
});

export function handleWs(ws: any, req: Request) {
  function listen(type: string, data: { server: IServerModel, player: IUploadedPlayer }) {
    var wsData = {
      type: type,
      server: data.server._id,
      serverName: data.server.name,
      player: data.player.player
    };

    if (ws && !ws.closed) ws.send(JSON.stringify(wsData));
  }

  function ping() {
    if (ws && !ws.closed) ws.send("PING");
  }

  emitter.addListener("join", listen.bind(null, "join"));
  emitter.addListener("left", listen.bind(null, "left"));
  var interval = setInterval(ping, 30 * 1000);

  ws.on('error', function () {
    ws.closed = true;
    emitter.removeListener("join", listen);
    clearInterval(interval);
  });

  ws.on('close', function () {
    ws.closed = true;
    emitter.removeListener("join", listen);
    clearInterval(interval);
  });

  ping();
}
