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
import * as Sentry from '@sentry/node';
import * as morgan from 'morgan';

import { queryLiveServers } from "./serverQuery";
import { handlebars_helpers } from "./helpers";

import './discord';

import { initSocketIO } from "./socketio";
import { startQueryingServersForChat, loadChatCacheFromRedis, publishMessagesToRedis, subscribeToMessagesFromRedis } from "./chat";
import { redisClient } from "./db";

const RUN_WEB = process.env.RUN_WEB === 'true';
const RUN_SERVER_QUERY = process.env.RUN_SERVER_QUERY === 'true';
const RUN_CHAT_QUERY = process.env.RUN_CHAT_QUERY === 'true';


let app = express();

app.use(morgan('tiny'));

if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.requestHandler());
}

let server = new http.Server(app);

if (RUN_WEB) {
  app.use(compression());
  app.use(cors({
    credentials: true,
    origin: "*"
  }));

  initSocketIO(server);

  app.set('views', path.join(__dirname, "../views"));
  app.engine('handlebars', exphbs({ defaultLayout: 'main', helpers: handlebars_helpers }));
  app.set('view engine', 'handlebars');

  //app.use(bodyParser.json());
  //app.use(bodyParser.urlencoded({extended: true})); 

  app.use("/public", express.static(path.join(__dirname, "../public"), { maxAge: "365d" }));
  app.use("/static", express.static(path.join(__dirname, "../static"), { maxAge: "365d" }));

  const ticker = require("./ticker");
  const servers = require("./servers");
  const players = require("./players");
  const matches = require("./matches");
  const pages = require("./pages");
  const search = require("./search");
  const tracker = require("./tracker");

  
  app.use("/", players.router);
  app.use("/", servers.router);
  app.use("/", ticker.router);
  app.use("/", matches.router);
  app.use("/", pages.router);
  app.use("/", search.router);
  app.use("/", tracker.router);
}

if (RUN_SERVER_QUERY) {
  setInterval(queryLiveServers, 5 * 1000);
}

if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

app.use(function (err: Error, req: Request, res: Response, next: () => void) {
  winston.error("App error:", err);
  res.send(err);
});

if (RUN_WEB || RUN_SERVER_QUERY) {
  server.listen(process.env.PORT || 5000, function () {
    var host = server.address().address;
    var port = server.address().port;

    winston.info('App listening', { host: host, port: port });
  });
}

process.on('unhandledRejection', (reason, p) => {
  winston.error('Unhandled Rejection at: Promise', p, 'reason:', reason);
  setTimeout(() => process.exit(1), 1000);
});

process.on('uncaughtException', (ex) => {
  winston.error('uncaughtException', ex.message, ex);
  setTimeout(() => process.exit(1), 1000);
});

if (RUN_CHAT_QUERY) {
  startQueryingServersForChat();
}

if (redisClient) {
  loadChatCacheFromRedis();
  subscribeToMessagesFromRedis();
  publishMessagesToRedis();
}
