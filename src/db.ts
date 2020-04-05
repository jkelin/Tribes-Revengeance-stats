import { FieldType, InfluxDB } from 'influx';
import * as mongoose from 'mongoose';
import { Document } from 'mongoose';
import * as redis from 'redis';
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

async function connect() {
  const mongoEnv = process.env.MONGODB || process.env.MONGODB_URI;
  const conn = await mongoose.connect(mongoEnv || 'mongodb://localhost:3000/tribes', {
    useNewUrlParser: true,
    server: {
      socketOptions: {
        keepAlive: 1,
        connectTimeoutMS: 5000,
        reconnectTries: Number.MAX_VALUE,
        reconnectInterval: 1000,
      },
    },
    replset: {
      socketOptions: {
        keepAlive: 1,
        connectTimeoutMS: 5000,
        reconnectTries: Number.MAX_VALUE,
        reconnectInterval: 1000,
      },
    },
  });

  conn.connection.on('error', err => {
    console.error('MongoDB error', err);
  });

  conn.connection.on('disconnected', () => {
    console.error('MongoDB disconnected');
  });

  return conn;
}

connect()
  .then(() => console.info('MongoDB connected'))
  .catch(err => {
    console.error('Error connecting to MongoDB', err);
    process.exit(1);
  });

export let redisClient: redis.RedisClient | undefined;
export let redisSubClient: redis.RedisClient | undefined;

const redisEnv = process.env.REDIS || process.env.REDIS_URL;
if (redisEnv) {
  redisClient = redis.createClient(redisEnv);
  redisSubClient = redis.createClient(redisEnv);

  redisClient.on('error', err => {
    console.error('Redis error', err);
  });

  redisClient.on('connect', () => {
    console.info('Redis connected');
  });

  redisClient.on('end', () => {
    console.info('Redis disconnected');
  });

  redisSubClient.on('warning', console.warn);

  redisSubClient.on('error', err => {
    console.error('Redis error', err);
  });

  redisSubClient.on('connect', () => {
    console.info('Redis connected');
  });

  redisSubClient.on('end', () => {
    console.info('Redis disconnected');
  });

  redisSubClient.on('warning', console.warn);
} else {
  console.info('REDIS env variable not specified');
}
