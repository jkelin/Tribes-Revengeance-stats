import { FieldType, InfluxDB } from 'influx';
import mongoose from 'mongoose';
import { Document } from 'mongoose';
import redis from 'async-redis';
import { IFullReport, ITribesServerQueryResponse } from './types';

(mongoose as any).Promise = Promise;

export interface IServerChat {
  server: string;
  username: string;
  password: string;
  ok: boolean;
  enabled: boolean;
}

export interface IServer {
  _id: string;
  name: string;
  adminname?: string;
  adminemail?: string;
  country: string;
  ip: string;
  port: number;
  minutesonline: number;
  maxplayers: number;
  lastseen: Date;
  lastTiming: Date;
  lastfullreport: Date;
  chat: IServerChat;
  lastdata: ITribesServerQueryResponse;
}

export interface IServerModel extends IServer, Document {
  _id: string;
}

export const Server = mongoose.model<IServerModel>('Server', {
  _id: String,
  name: String,
  adminname: String,
  adminemail: String,
  country: String,
  ip: String,
  port: Number,
  minutesonline: Number,
  maxplayers: Number,
  lastseen: Date,
  lastTiming: Date,
  lastfullreport: Date,
  chat: {
    server: String,
    username: String,
    password: String,
    ok: Boolean,
    enabled: Boolean,
  },
  lastdata: mongoose.Schema.Types.Mixed,
} as any);

export interface IPlayer {
  _id: string;
  normalizedName: string;
  ip?: string;
  lastserver: string;
  score: number;
  kills: number;
  deaths: number;
  offense: number;
  defense: number;
  style: number;
  lastTiming: Date;
  lastseen: Date;
  minutesonline: number;
  stats?: Record<string, number>;
}

export interface IPlayerModel extends IPlayer, Document {
  _id: string;
}

export const Player = mongoose.model<IPlayerModel>('Player', {
  _id: String,
  normalizedName: String,
  ip: String,
  lastserver: String,
  score: Number,
  kills: Number,
  deaths: Number,
  offense: Number,
  defense: Number,
  style: Number,
  lastTiming: Date,
  lastseen: Date,
  minutesonline: Number,
  stats: mongoose.Schema.Types.Mixed,
} as any);

export interface IIdentity {
  ips: Record<string, number>;
  names: Record<string, number>;
  namesAndIps: string[];
}

export interface IIdentityModel extends IIdentity, Document {}

export const Identity = mongoose.model<IIdentityModel>('Identity', {
  ips: mongoose.Schema.Types.Mixed,
  names: mongoose.Schema.Types.Mixed,
  namesAndIps: [String],
} as any);

export interface IMatch {
  server: string;
  when: Date;
  numplayers: number;
  basicReport: ITribesServerQueryResponse;
  fullReport: IFullReport;
}

export interface IMatchModel extends IMatch, Document {}

const MatchSchema = new mongoose.Schema({
  server: String,
  when: Date,
  numplayers: Number,
  basicReport: mongoose.Schema.Types.Mixed,
  fullReport: mongoose.Schema.Types.Mixed,
});

MatchSchema.index({ 'basicReport.numplayers': 1 });
MatchSchema.index({ numplayers: 1 });
MatchSchema.index({ when: 1 });

export const Match = mongoose.model<IMatchModel>('Match', MatchSchema);

export const influx = new InfluxDB({
  username: process.env.INFLUXDB_USER,
  password: process.env.INFLUXDB_PASSWORD,
  database: process.env.INFLUXDB_DATABASE,
  host: process.env.INFLUXDB_HOST,
  port: process.env.INFLUXDB_PORT,
  schema: [
    {
      measurement: 'population',
      fields: {
        players: FieldType.INTEGER,
      },
      tags: ['server'],
    },
  ],
  pool: {
    maxRetries: Number.MAX_VALUE,
    requestTimeout: 5000,
  },
} as any);

export async function connectMongo() {
  const mongoEnv = process.env.MONGODB || process.env.MONGODB_URI;
  if (!mongoEnv) {
    throw new Error('MONGODB or MONGODB_URI env variables not set');
  }

  mongoose.set('debug', true);

  console.debug('Connecting to MongoDB');
  const conn = await mongoose.connect(mongoEnv, {
    useNewUrlParser: true,
    // server: {
    //   socketOptions: {
    //     keepAlive: 1,
    //     connectTimeoutMS: 5000,
    //     reconnectTries: Number.MAX_VALUE,
    //     reconnectInterval: 1000,
    //   },
    // },
    // replset: {
    //   socketOptions: {
    //     keepAlive: 1,
    //     connectTimeoutMS: 5000,
    //     reconnectTries: Number.MAX_VALUE,
    //     reconnectInterval: 1000,
    //   },
    // },
  });

  conn.connection.on('error', console.error.bind(console, 'MongoDB error:'));
  conn.connection.on('disconnected', console.error.bind(console, 'MongoDB disconnect:'));

  console.info('MongoDB connected');

  return conn;
}

export let redisClient: redis.RedisClient | undefined;
export let redisSubClient: redis.RedisClient | undefined;

function createRedisClient(url: string) {
  return new Promise<redis.RedisClient>((resolve, reject) => {
    const client = redis.createClient(url);

    client.on('error', reject);

    client.on('error', console.error.bind(console, 'Redis error:'));

    client.on('warning', console.warn.bind(console, 'Redis warning:'));

    client.on('connect', () => resolve(client));

    client.on('end', () => {
      console.info('Redis disconnected');
    });
  });
}

export async function connectRedis() {
  console.info('Connecting to redis');

  const redisEnv = process.env.REDIS || process.env.REDIS_URL;
  if (redisEnv) {
    redisClient = await createRedisClient(redisEnv);
    redisSubClient = await createRedisClient(redisEnv);

    await redisClient.ping();
    await redisSubClient.ping();

    console.info('Redis connected');

    return { redisClient, redisSubClient };
  } else {
    throw new Error('REDIS env variable not specified');
  }
}
