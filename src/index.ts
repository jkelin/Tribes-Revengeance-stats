require('dotenv').config()
import { initLogger } from "./logger";

initLogger();

import * as express from "express";
import { Request, Response } from 'express';
import * as exphbs from "express-handlebars";
import * as compression from "compression";
import * as winston from "winston";
import * as path from 'path';
import * as http from 'http';
import * as cors from 'cors';
import * as bodyParser from 'body-parser';
import * as SocketIO from "socket.io";
import * as Sentry from '@sentry/node';

import { getTribesServersFromMasterServer, queryTribesServer } from "./serverQuery";
import { Player, Server, IPlayerModel } from "./db";
import { tryConvertIpv6ToIpv4, tribes_news, handlebars_helpers } from "./helpers";
import { handleTribesServerData, addServerLastFullReport, handlePlayer, router as trackerRouter } from "./tracker";
import { CronJob } from 'cron';
import { emitter as tickerEvents } from './ticker';

import './discord';

import Events from "./events";
import { exec } from "shelljs";

const STATS_WEB = (process.env.STATS_WEB || 'true') === 'true';
const STATS_REPORT = (process.env.STATS_REPORT || 'true') === 'true';


let app = express();

if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.requestHandler());
}

app.use(compression());
app.use(cors({
  credentials: true,
  origin: "*"
}));

let server = new http.Server(app);
let io = SocketIO(server, { origins: '*:*' });

// This is needed for /upload
app.use(function (req, res, next) {
  var data = '';
  req.setEncoding('utf8');
  req.on('data', function (chunk) {
    data += chunk;
  });

  req.on('end', function () {
    req.body = data;
    next();
  });
});

if (STATS_WEB) {
  app.set('views', path.join(__dirname, "../views"));
  app.engine('handlebars', exphbs({ defaultLayout: 'main', helpers: handlebars_helpers }));
  app.set('view engine', 'handlebars');

  //app.use(bodyParser.json());
  //app.use(bodyParser.urlencoded({extended: true})); 

  app.use("/public", express.static(path.join(__dirname, "../public"), { maxAge: "365d" }));

  app.use("/static", express.static(path.join(__dirname, "../static"), { maxAge: "365d" }));
}

if (STATS_WEB) {
  const ticker = require("./ticker");
  const servers = require("./servers");
  const players = require("./players");
  const matches = require("./matches");

  app.use("/", players.router);
  app.use("/", servers.router);
  app.use("/", ticker.router);
  app.use("/", matches.router);

  app.get('/about', function (req, res) {
    res.redirect(301, 'https://tribesrevengeance.net');
  });

  app.get('/extension', function (req, res) {
    res.render('extension');
  });
}

if (STATS_REPORT) {
  app.use("/", trackerRouter);
}

function searchPlayers(name: string) {
  return Player
    .where('_id').regex(new RegExp(name, "i"))
    .sort({ lastseen: -1 })
    .select(['_id', 'score', 'kills', 'deaths', 'offense', 'defense', 'style', 'minutesonline', 'lastseen', 'stats.flagCaptureStat'])
    .find()
    .exec();
}

if (STATS_WEB) {
  io.on('connection', function (socket) {
    socket.on("say", data => {
      const nameRegex = /^[A-Za-z0-9\| \-_\?\!\*\/:\.]{3,29}$/;
      const messageRegex = /^[A-Za-z0-9\| \-_\?\!\*\/:\.]{1,196}$/;
      if (nameRegex.test(data.usr) && messageRegex.test(data.message)) {
        Events.next({ type: "say", data: { server: data.server, usr: data.usr, message: data.message } })
      }
    });
  });

  Events.filter(x => x.type == "chat-message").subscribe(e => io.emit(e.type, e.data));
  Events.filter(x => x.type == "player-count-change").subscribe(e => io.emit(e.type, e.data));

  Events.subscribe(e => winston.info("EVENT:", e))


  app.get('/', function (req, res, next) {
    var compDate = new Date();
    compDate.setMinutes(compDate.getMinutes() - 2);

    var promises = [
      Player.find().sort({ kills: -1 }).limit(20).exec(),
      Player.find().sort({ minutesonline: -1 }).limit(20).exec(),
      Server.find().where({ lastseen: { "$gte": compDate } }).limit(20).exec(),
      tribes_news
    ] as Promise<any>[];

    Promise.all(promises)
      .then(function (data) {
        var obj = {
          playersKills: data[0],
          playersTime: data[1],
          servers: data[2],
          news: data[3].slice(0, 5),
          now: new Date(),
          warnings: [{ text: "If you have issues seeing servers in-game, download this <a href='https://downloads.tribesrevengeance.net/other/Engine.dll'>Engine.dll</a> and put it into your Tribes/Program/Bin folder next to your TV_CD_DVD.exe file. If you are asked to overwrite the old one, click yes." }]
        };
        res.render('home', obj);
      })
      .catch(function (error) {
        next(error);
      });
  })

  app.get('/search', async function (req, res) {
    var name = req.query.name !== undefined ? decodeURIComponent(req.query.name) : "";
    const data = await searchPlayers(name);
    res.render('players', {
      data: data,
      alerts: [{ text: data.length + " results" }]
    });
  })
}

app.get('/status.json', function (req, res) {
  res.json({ status: 'ok' });
});

if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

app.use(function (err: Error, req: Request, res: Response, next: () => void) {
  winston.error("App error:", err);
  res.send(err);
});

server.listen(process.env.PORT || 5000, function () {

  var host = server.address().address;
  var port = server.address().port;

  winston.info('App listening', { host: host, port: port });
});

function updateFromMaster() {
  getTribesServersFromMasterServer(function (servers) {
    servers.forEach(function (item) {
      queryTribesServer(item[0], parseInt(item[1]), handleTribesServerData);
    });
  });
}

if (STATS_REPORT) {
  setInterval(updateFromMaster, 5 * 1000);
}

process.on('unhandledRejection', (reason, p) => {
  winston.error('Unhandled Rejection at: Promise', p, 'reason:', reason);
  setTimeout(() => process.exit(1), 1000);
});

process.on('uncaughtException', (ex) => {
  winston.error('uncaughtException', ex.message, ex);
  setTimeout(() => process.exit(1), 1000);
});

new CronJob({
  cronTime: '0 0 0 * * *',
  onTick: () => {
    winston.info('Recalculating identities');
    exec('yarn script:recalculate_identities')
  },
  start: true
});
