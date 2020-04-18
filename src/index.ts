require('dotenv-safe').config({
  allowEmptyValues: true,
});

import * as Sentry from '@sentry/node';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import { Request, Response } from 'express';
import Handlebars from 'handlebars';
import exphbs from 'express-handlebars';
import { allowInsecurePrototypeAccess } from '@handlebars/allow-prototype-access';
import { createTerminus } from '@godaddy/terminus';

import http from 'http';
import morgan from 'morgan';
import path from 'path';

import { handlebarsHelpers, setupNewsFetch as setupNewsFetchJob } from './helpers';
import { queryLiveServers, setupQueryLiveServers } from './serverQuery';

import './discord';

import {
  loadChatCacheFromRedis,
  publishMessagesToRedis,
  startQueryingServersForChat,
  subscribeToMessagesFromRedis,
} from './chat';
import { connectMongo, connectRedis } from './db';
import { initSocketIO } from './socketio';
import { CronJob } from 'cron';
import { setupDiscord } from './discord';

const RUN_SERVER_QUERY = process.env.RUN_SERVER_QUERY === 'true';
const RUN_CHAT_QUERY = process.env.RUN_CHAT_QUERY === 'true';

function configureApp() {
  const app = express();

  app.use(morgan('tiny'));
  app.use(Sentry.Handlers.requestHandler());
  app.use(compression());
  app.use(
    cors({
      credentials: true,
      origin: '*',
    })
  );

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

  app.use(Sentry.Handlers.errorHandler());

  app.use((err: Error, req: Request, res: Response, next: () => void) => {
    console.error('App error:', err);

    res.statusCode = 500;
    res.end(err);
  });

  return app;
}

async function main() {
  Sentry.init();
  const cronJobs: CronJob[] = [];

  const mongo = await connectMongo();
  const { redisClient, redisSubClient } = await connectRedis();
  await setupDiscord();

  cronJobs.push(setupNewsFetchJob());

  if (RUN_SERVER_QUERY) {
    cronJobs.push(setupQueryLiveServers());
  }

  if (RUN_CHAT_QUERY) {
    cronJobs.push(startQueryingServersForChat());
  }

  if (redisClient) {
    await loadChatCacheFromRedis();
    subscribeToMessagesFromRedis();
    publishMessagesToRedis();
  }

  const app = configureApp();

  let server = new http.Server(app);

  initSocketIO(server);
  server = createTerminus(server, {
    signals: ['SIGINT', 'SIGTERM', 'SIGQUIT'],
    healthChecks: {
      '/status.json': async () => {
        return true;
      },
    },
    beforeShutdown: async () => {
      console.info('Shutting down');

      console.debug('Stopping cron jobs');
      cronJobs.forEach((x) => x.stop());

      console.debug('Disconnecting from mongo');
      await mongo.disconnect();

      console.debug('Disconnecting from redis');
      await redisClient.quit();
      await redisSubClient.quit();

      console.debug('Flusing sentry');
      await Sentry.flush();
    },
    onShutdown: async () => console.info('Shutdown'),
  });

  await new Promise((resolve) => server.listen(process.env.PORT || 5000, resolve));

  console.info('App initialized', { address: server.address(), RUN_SERVER_QUERY, RUN_CHAT_QUERY });
}

main().catch(async (error) => {
  const id = Sentry.captureException(error);
  await Sentry.flush();

  console.info('Sentry error captured as', id);
  console.error(error);

  process.exit(1);
});
