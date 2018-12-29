import { InfluxDB, FieldType } from "influx";
import * as mongoose from "mongoose";
import { Document } from 'mongoose';
import * as winston from "winston";
import { ITribesServerQueryResponse, IFullReport } from "./types";

(mongoose as any).Promise = Promise;

export interface IServerChat {
  server: string,
  username: string,
  password: string,
  ok: boolean,
  enabled: boolean
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
    enabled: Boolean
  },
  lastdata: mongoose.Schema.Types.Mixed
} as any);

export interface IPlayer {
  _id: string,
  ip?: string,
  lastserver: string,
  score: number,
  kills: number,
  deaths: number,
  offense: number,
  defense: number,
  style: number,
  lastTiming: Date,
  lastseen: Date,
  minutesonline: number,
  stats?: Record<string, number>
}

export interface IPlayerModel extends IPlayer, Document {
  _id: string;
}

export const Player = mongoose.model<IPlayerModel>('Player', {
  _id: String,
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
  stats: mongoose.Schema.Types.Mixed
} as any);

export interface IIdentity {
  ips: Record<string, number>;
  names: Record<string, number>;
  namesAndIps: string[];
}

export interface IIdentityModel extends IIdentity, Document { }

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

export interface IMatchModel extends IMatch, Document { }

const MatchSchema = new mongoose.Schema({
  server: String,
  when: Date,
  numplayers: Number,
  basicReport: mongoose.Schema.Types.Mixed,
  fullReport: mongoose.Schema.Types.Mixed
});

MatchSchema.index({ "basicReport.numplayers": 1 });
MatchSchema.index({ "numplayers": 1 });
MatchSchema.index({ "when": 1 });

export const Match = mongoose.model<IMatchModel>('Match', MatchSchema);

export const influx = new InfluxDB({
  username: process.env.INFLUXDB_USER,
  password: process.env.INFLUXDB_PASSWORD,
  database: process.env.INFLUXDB_DATABASE,
  host: process.env.INFLUXDB_HOST,
  port: process.env.INFLUXDB_PORT,
  schema: [{
    measurement: 'population',
    fields: {
      players: FieldType.INTEGER,
    },
    tags: [
      'server'
    ]
  }]
} as any);

async function connect() {
  const conn = mongoose.connect(
    process.env.MONGODB || "mongodb://localhost:3000/tribes",
    // { useNewUrlParser: true }
  );

  return conn;
}

connect()
  .then(() => winston.info("DB connected"))
  .catch(err => {
    winston.error("Error connecting to DB", err);
    process.exit(1);
  })
