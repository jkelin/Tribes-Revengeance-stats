import * as http from "http";
import * as https from "https";
import * as dgram from "dgram";
import * as net from "net";
import * as winston from "winston";
import axios from 'axios';
import { ITribesServerQueryResponse } from "./types";
import { Server } from "./db";
import { handleTribesServerData } from "./tracker";

const masterClient = axios.create({
  timeout: 5000,
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true, rejectUnauthorized: false }),
  responseType: 'text'
});

const udpSocket = dgram.createSocket('udp4', function (message, remote) {
  try {
    const data = parseTribesServerQueryReponse(remote.address, remote.port - 1, message.toString('ascii'));
    if (data && data.hostport) {
      handleTribesServerData(data).catch(er => winston.error("Could not handleTribesServerData for", data));
    }
  } catch(er) {
    winston.warn("Error in UDP server response", er);
  }
});

udpSocket.bind();

export async function getTribesServersFromMasterServer(): Promise<{ ip: string, port: number }[]> {
  const resp = await masterClient.get<string>("https://qtracker.com/server_list_details.php?game=tribesvengeance");
  var lines = resp.data.split("\r\n");
  var servers = lines
  .map(function (item) {
    const splat = item.split(":");
    return {
      ip: splat[0],
      port: parseInt(splat[1])
    }
  })
  .filter(s => s.ip && s.port);

  return servers;
}

export async function getTribesServersFromDb() {
  const servers = await Server.find().select({ ip: 1, port: 1 }).exec();
  return servers.filter(x => x.ip && x.port).map(x => ({ ip: x.ip, port: x.port }));
}

export function parseTribesServerQueryReponse(ip: string, port: number, message: string): ITribesServerQueryResponse {
  var items = message.split('\\');
  items.splice(0, 1);
  var dict = {};
  var name = true;
  var lastName = "";

  items.forEach(function (item) {
    if (name) lastName = item;
    else dict[lastName] = item;
    name = !name;
  });

  var data: Partial<ITribesServerQueryResponse> = {
    ip,
    players: []
  };

  for (var n in dict) {
    if (n.indexOf("_") !== -1) {
      var splat = n.split("_");
      var itemName = splat[0];
      var index = splat[1];

      if (data.players![index] === undefined) data.players![index] = {};
      data.players![index][itemName] = dict[n];
    }
    else data[n] = dict[n];
  }

  data.ip = ip;

  return data as ITribesServerQueryResponse;
}

export function queryTribesServer(ip: string, port: number) {
  var message = new Buffer('\\basic\\', 'ascii');
  
  udpSocket.send(message, port, ip);
}
