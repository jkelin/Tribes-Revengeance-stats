const mongoose = require("mongoose");
const winston = require("winston");

mongoose.Promise = Promise;

const Server = mongoose.model('Server', {
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
    lastdata: mongoose.Schema.Types.Mixed
});

const Player = mongoose.model('Player', {
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
});

const ServerTrack = mongoose.model('ServerTrack', {
    serverId: String,
    time: Date,
    numplayers: Number
});

mongoose.connect(process.env.MONGODB || "mongodb://localhost/tribes", function (err) {
    if (err) { 
        winston.error("DB failed to connect", err); 
        throw err; 
    }

    winston.info("DB connected");
});

module.exports = {
    Server,
    Player,
    ServerTrack
}
