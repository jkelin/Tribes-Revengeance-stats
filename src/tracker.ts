import winston from "winston";
import freegeoip from "node-freegeoip";
import express from "express";
import atob from "atob";

import { Player, Server, Match, influx } from "./db";
import { emitter } from "./ticker";
import { getClientIp, getFullMapName } from "./helpers";
import { mean, min, max } from "lodash";
import { IUploadedData, IUploadedPlayer } from "./types";
import { isValid } from "./anticheat";

export let router = express.Router();

export function handleTribesServerData(data) {
    //console.log(data);
    var id = data.ip + ':' + data.hostport;
    if(!id) return winston.error('[handleTribesServerData] Server does not have an id', data);
    winston.debug("Handling data from", id);
    Server.where({ _id: id }).findOne(function (err, server) {
        if (err) throw err;
        else if (server === null) {
            server = new Server({
                _id: id,
                minutesonline: 0,
                lastTiming: new Date()
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
            winston.debug("Could not time server because lastTiming is", server.lastTiming, "and now is", new Date(), "while needed is", new Date(Date.now() - 60 * 1000), "diff:", server.lastTiming - (new Date(Date.now() - 60 * 1000) as any));
        }

        server.save(function (err) { if (err) throw err; });

        if (server.lastdata) {
            data.players
                .forEach(function (player) {
                    var wasbefore = server.lastdata.players.some(function (p) { return p.player == player.player });
                    if (!wasbefore) emitter.emit("join", { server: server, player: player });
                });
        }

        if (server.lastdata && server.lastdata.players) {
            server.lastdata.players
                .forEach(function (player) {
                    var hasLeft = data.players.some(function (p) { return p.player == player.player });
                    if (!hasLeft) emitter.emit("left", { server: server, player: player });
                });
        }

        server.lastdata = data;

        if (server.lastdata.mapname) {
            server.lastdata.mapnamefull = getFullMapName(server.lastdata.mapname);
        }

        pushPlayersTrackings(id, data);

        data.players.forEach(timePlayer);

        if (!server.country) {
            freegeoip.getLocation(server.ip, function (err, location) {
                server.country = location["country_code"].toLowerCase();
                server.save(function (err) {
                    if (err) throw err;
                    else {
                        winston.debug("Saved server", id);
                    }
                });
            });
        }
        else {
            server.save(function (err) {
                if (err) throw err;
                else {
                    winston.debug("Saved server", id);
                }
            });
        }
    });
}

var lastTrackings = {};
export function pushPlayersTrackings(serverIdIn, data) {
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

export function timePlayer(player) {
    if(!player.player) return winston.error('[timePlayer] Player does not have a name', player);
    Player.where({ _id: player.player })
        .findOne(function (err, pl) {
            if (err) throw err;
            if (pl === null) {
                pl = new Player({
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

export function handlePlayer(input: IUploadedPlayer, ip: string, port: string) {
    winston.debug("handling player", input);
    if(!input.name) return winston.error('Player does not have a name');

    Player.where({ _id: input.name }).findOne(function (err, player) {
        if (err) throw err;
        var changeCountry = false;
        if (player === null) {
            player = new Player({
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

        var highestSpeed = input["StatClasses.StatHighestSpeed"] == undefined ? 0 : parseInt(input["StatClasses.StatHighestSpeed"]);
        if (highestSpeed > player.stats.StatHighestSpeed) {
            player.stats.StatHighestSpeed = highestSpeed;
            player.markModified('stats');
        }

        for (var i in input) {
            var value = input[i];
            winston.debug("handle player stat", { name: i, value: value });
            if (i === "StatClasses.StatHighestSpeed") continue;
            if (i.indexOf('.') !== -1) {
                var name = i.split('.')[1];
                if (player.stats[name] === undefined) player.stats[name] = 0;
                player.stats[name] += value;
                //console.log("addded",name,value);
                player.markModified('stats');
            }
        }
        winston.debug("statted", input.name);


        player.save(function (err) { if (err) throw err; });
    });
};

export function addServerLastFullReport(ip, port) {
    var id = ip + ":" + port;
    Server.where({ _id: id })
        .findOne(function (err, server) {
            if (err) throw err;
            if (server == null) {
                winston.warn("server null, _id:", id);
                return;
            }
            server.lastfullreport = new Date().getTime();
            server.save(function (err) { if (err) throw err; });
        });
}

export function removeDotStatNamesFromFullReport(fullReport){
    return {
        ...fullReport,
        players: fullReport.players.map(p => {
            const player = {...p};
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

export function saveMatchResult(ip, port, fullReport) {
    var id = ip + ":" + port;

    // Server.where({ _id: '45.32.157.166:8777' })
    Server.where({ _id: id })
    .findOne(function (err, server) {
        if (err) {
            console.error('Could not find saveMatchResult')
        }

        var match = new Match({
            server: id,
            when: new Date(),
            fullReport: removeDotStatNamesFromFullReport(fullReport),
            basicReport: server.lastdata
        });

        match.save(function(err) {
            if (err) {
                console.error('Could not save saveMatchResult', err)
            }
        });
    });
}

router.post('/upload', function (req, res) {
    var ip = getClientIp(req);
    res.send('Hello World!')
    winston.info("Received /upload request from", { ip });
    winston.debug("received upload request", { ip: ip, data: req.body })
    var decoded = atob(req.body);
    var object: IUploadedData = JSON.parse(decoded);

    object.players.forEach(p => p.isTracked = isValid(p, object));

    object.players
    .filter(p => p.isTracked)
    .forEach(function (player) {
        handlePlayer(player, ip, object.port);
    });

    addServerLastFullReport(ip, object.port);

    saveMatchResult(ip, object.port, object)
});
