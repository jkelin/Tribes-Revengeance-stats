import winston from "winston";
import * as geoip from "geoip-lite";
import * as express from "express";
import atob from "atob";

import { Player, Server, Match, influx, IPlayerModel, IServerModel, IServer, IPlayer } from "./db";
import { emitter } from "./ticker";
import { getClientIp, getFullMapName } from "./helpers";
import { mean, min, max } from "lodash";
import { IUploadedData, IUploadedPlayer, IFullReport, ITribesServerQueryResponse } from "./types";
import { isValid } from "./anticheat";
import { promisify } from "util";
import Events from "./events";

export let router = express.Router();

const persistentPlayerCounts: Record<string, number> = {};

export async function handleTribesServerData(data: ITribesServerQueryResponse) {
  //console.log(data);
  if (!data.ip && !data.hostport) {
    return winston.error('[handleTribesServerData] Server does not have an id', data);
  }

  var id = data.ip + ':' + data.hostport;

  winston.debug("Handling data from", id);

  let server: IServerModel = await Server
    .where('_id').equals(id)
    .findOne()
    .exec();

  if (server === null) {
    server = new Server(<IServer>{
      _id: id,
      minutesonline: 0,
      lastTiming: new Date(),
    });
  }

  server.name = data.hostname;
  server.adminname = data.adminname;
  server.adminemail = data.adminemail;
  server.ip = data.ip;
  server.port = data.hostport;
  server.maxplayers = data.maxplayers;
  server.lastseen = new Date();

  if (Date.now() >= server.lastTiming.getTime() + 60 * 1000) {
    server.minutesonline++;
    server.lastTiming = new Date();
    winston.debug("Timing server", id);
  } else {
    winston.debug(
      "Could not time server because lastTiming is",
      server.lastTiming,
      "and now is",
      new Date(),
      "while needed is",
      new Date(Date.now() - 60 * 1000),
      "diff:",
      server.lastTiming.getTime() - new Date(Date.now() - 60 * 1000).getTime()
    );
  }

  await server.save();

  if (data.players.length !== persistentPlayerCounts[`${server.ip}:${server.port}`]) {
    Events.next({ type: "player-count-change", data: { server: `${server.ip}:${server.port}`, players: data.players.length } });
  }

  persistentPlayerCounts[`${server.ip}:${server.port}`] = data.players.length;
  server.lastdata = data;

  if (server.lastdata.mapname) {
    server.lastdata.mapnamefull = getFullMapName(server.lastdata.mapname);
  }

  pushPlayersTrackings(id, data);

  data.players.forEach(timePlayer);

  if (!server.country) {
    const location = geoip.lookup(server.ip);
    server.country = location.country.toLowerCase();
  }

  await server.save()
  winston.debug("Saved server", id);
}

var lastTrackings: Record<string, number> = {};
export function pushPlayersTrackings(serverIdIn: string, data: ITribesServerQueryResponse) {
  if (!lastTrackings[serverIdIn]) lastTrackings[serverIdIn] = 0;

  influx.writePoints(
    [
      {
        measurement: 'population',
        fields: {
          players: data.numplayers
        },
        tags: {
          server: serverIdIn,
        }
      }
    ],
    {
      database: 'tribes'
    }
  );

  if (lastTrackings[serverIdIn] + 60 * 1000 >= Date.now()) return;
  lastTrackings[serverIdIn] = Date.now();
}

export function timePlayer(player: IUploadedPlayer) {
  if (!player.player) return winston.error('[timePlayer] Player does not have a name', player);
  Player
    .where('_id')
    .equals(player.player)
    .findOne(function (err, pl: IPlayerModel) {
      if (err) throw err;
      if (pl === null) {
        pl = new Player(<IPlayer>{
          _id: player.player,
          stats: {},
          score: 0,
          kills: 0,
          deaths: 0,
          offense: 0,
          defense: 0,
          style: 0,
          minutesonline: 0,
          lastTiming: new Date()
        });
      };

      if (Date.now() >= pl.lastTiming.getTime() + 60 * 1000) {
        pl.minutesonline++;
        pl.lastTiming = new Date();
        winston.debug("Timing player", player.player);
      }

      pl.lastseen = new Date();
      pl.save(function (err) { if (err) throw err; });
    });
}

export function handlePlayer(input: IUploadedPlayer, ip: string, port: number) {
  winston.debug("handling player", input);
  if (!input.name) return winston.error('Player does not have a name');

  Player
    .where('_id').equals(input.name)
    .findOne(function (err, player: IPlayerModel) {
      if (err) throw err;
      var changeCountry = false;
      if (player === null) {
        player = new Player(<IPlayer>{
          _id: input.name,
          stats: {},
          score: 0,
          kills: 0,
          deaths: 0,
          offense: 0,
          defense: 0,
          style: 0,
          minutesonline: 20,
          lastTiming: new Date()
        });
      }

      if (player.offense == undefined) player.offense = 0;

      player.ip = input.ip;
      player.lastserver = ip + ":" + port;
      player.score += input.score;
      player.kills += input.kills;
      player.deaths += input.deaths;
      player.offense += input.offense;
      player.defense += input.defense;
      player.style += input.style;
      player.lastseen = new Date();

      if (!player.stats) {
        player.stats = {};
      }

      if (player.stats.StatHighestSpeed == undefined) player.stats.StatHighestSpeed = 0;

      var highestSpeed = input["StatClasses.StatHighestSpeed"] == undefined ? 0 : parseInt(input["StatClasses.StatHighestSpeed"] + '');
      if (highestSpeed > player.stats.StatHighestSpeed) {
        player.stats.StatHighestSpeed = highestSpeed;
        player.markModified('stats');
      }

      for (var i in input) {
        var value = input[i];
        if (typeof value !== 'number') {
          continue;
        }

        winston.debug("handle player stat", { name: i, value: value });
        if (i === "StatClasses.StatHighestSpeed") {
          continue;
        }

        if (i.indexOf('.') !== -1) {
          var name = i.split('.')[1];

          if (!player.stats) {
            player.stats = {};
          }

          if (!player.stats[name]) {
            player.stats[name] = 0;
          }

          player.stats[name] += value;
          //console.log("addded",name,value);
          player.markModified('stats');
        }
      }
      winston.debug("statted", input.name);


      player.save(function (err) { if (err) throw err; });
    });
};

export function addServerLastFullReport(ip: string, port: number) {
  var id = ip + ":" + port;
  Server
    .where('_id')
    .equals(id)
    .findOne(function (err, server: IServerModel) {
      if (err) throw err;
      if (server == null) {
        winston.warn("server null, _id:", id);
        return;
      }
      server.lastfullreport = new Date();
      server.save(function (err) { if (err) throw err; });
    });
}

export function removeDotStatNamesFromFullReport(fullReport: IUploadedData) {
  return {
    ...fullReport,
    players: fullReport.players.map(p => {
      const player = { ...p };
      for (var i in player) {
        const value = player[i];
        if (i.indexOf('.') !== -1) {
          var name = i.split('.')[1];
          delete player[i];
          player[name] = value;
        }
      }
      return player;
    })
  };
}

export function saveMatchResult(ip: string, port: number, fullReport: IUploadedData) {
  var id = ip + ":" + port;

  // Server.where({ _id: '45.32.157.166:8777' })
  Server
    .where('_id').equals(id)
    .findOne(function (err, server: IServerModel) {
      if (err) {
        console.error('Could not find saveMatchResult')
      }

      var match = new Match({
        server: id,
        when: new Date(),
        fullReport: removeDotStatNamesFromFullReport(fullReport),
        basicReport: server.lastdata
      });

      match.save(function (err) {
        if (err) {
          console.error('Could not save saveMatchResult', err)
        }
      });
    });
}

router.post('/upload', function (req, res) {
  var ip = getClientIp(req);

  if (!ip) {
    winston.info("Upload without an ip attempted?!");
    return;
  }

  res.send('Hello World!')
  winston.info("Received /upload request from", { ip });
  winston.debug("received upload request", { ip: ip, data: req.body })
  var decoded = atob(req.body);
  var object: IUploadedData = JSON.parse(decoded); // TODO actually verify this

  object.players.forEach(p => p.isUntracked = !isValid(p, object));

  object.players
    .filter(p => !p.isUntracked)
    .forEach(function (player) {
      handlePlayer(player, ip!, object.port);
    });

  addServerLastFullReport(ip, object.port);

  saveMatchResult(ip, object.port, object)
});
