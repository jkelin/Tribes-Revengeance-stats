require('dotenv').config();

import * as Sentry from '@sentry/node';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import { Request, Response } from 'express';
import Handlebars from 'handlebars';
import exphbs from 'express-handlebars';
import { allowInsecurePrototypeAccess } from '@handlebars/allow-prototype-access';

import http from 'http';
import morgan from 'morgan';
import path from 'path';

import { handlebarsHelpers } from './helpers';
import { queryLiveServers } from './serverQuery';

import './discord';

import {
  loadChatCacheFromRedis,
  publishMessagesToRedis,
  startQueryingServersForChat,
  subscribeToMessagesFromRedis,
} from './chat';
import { redisClient } from './db';
import { initSocketIO } from './socketio';

const RUN_WEB = process.env.RUN_WEB === 'true';
const RUN_SERVER_QUERY = process.env.RUN_SERVER_QUERY === 'true';
const RUN_CHAT_QUERY = process.env.RUN_CHAT_QUERY === 'true';

async function main() {
  const promises: Promise<unknown>[] = [];

  const app = express();

  app.use(morgan('tiny'));

  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      release: process.env.SENTRY_RELEASE,
    });

    app.use(Sentry.Handlers.requestHandler());
  }

  const server = new http.Server(app);

  if (RUN_WEB) {
    app.use(compression());
    app.use(
      cors({
        credentials: true,
        origin: '*',
      })
    );

    initSocketIO(server);

    app.set('views', path.join(__dirname, '../views'));
    app.engine(
      'handlebars',
      exphbs({
        defaultLayout: 'main',
        helpers: handlebarsHelpers,
        handlebars: allowInsecurePrototypeAccess(Handlebars),
      })
    );
    app.set('view engine', 'handlebars');

    // app.use(bodyParser.json());
    // app.use(bodyParser.urlencoded({extended: true}));

    app.use('/public', express.static(path.join(__dirname, '../public'), { maxAge: '365d' }));
    app.use('/static', express.static(path.join(__dirname, '../static'), { maxAge: '365d' }));

    const ticker = require('./ticker');
    const servers = require('./servers');
    const players = require('./players');
    const matches = require('./matches');
    const pages = require('./pages');
    const search = require('./search');
    const tracker = require('./tracker');

    app.use('/', players.router);
    app.use('/', servers.router);
    app.use('/', ticker.router);
    app.use('/', matches.router);
    app.use('/', pages.router);
    app.use('/', search.router);
    app.use('/', tracker.router);
  }

  if (RUN_SERVER_QUERY) {
    setInterval(queryLiveServers, 5 * 1000);
  }

  if (process.env.SENTRY_DSN) {
    app.use(Sentry.Handlers.errorHandler());
  }

  app.use((err: Error, req: Request, res: Response, next: () => void) => {
    console.error('App error:', err);

    res.statusCode = 500;
    res.end(err);
  });

  if (RUN_WEB || RUN_SERVER_QUERY) {
    server.listen(process.env.PORT || 5000, () => {
      console.info('App listening', { port: process.env.PORT || 5000 });
    });
    // tslint:disable-next-line: no-empty
    promises.push(new Promise((resolve) => {}));
  }

  if (RUN_CHAT_QUERY) {
    promises.push(startQueryingServersForChat());
  }

  if (redisClient) {
    promises.push(loadChatCacheFromRedis());
    subscribeToMessagesFromRedis();
    publishMessagesToRedis();
  }

  await Promise.all(promises);
}

const mainPromise: any = main()
  .catch(async (error) => {
    if (process.env.SENTRY_DSN) {
      const id = Sentry.captureException(error);
      console.info('Sentry error captured as', id);
      console.info(error);

      await new Promise((resolve) => setTimeout(resolve, 1000));
    } else {
      console.info('An error has occured but sentry is not connected');
      console.error(error);
    }
  })
  .then(() => {
    console.info('All done');
    process.exit(1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
