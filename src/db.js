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
    chat: {
        server: String,
        username: String,
        password: String,
        ok: Boolean
    },
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

const ServerTrackSchema = new mongoose.Schema({
    serverId: String,
    time: Date,
    numplayers: Number
});

ServerTrackSchema.index({
    serverId: 1,
    time: -1
});

const ServerTrack = mongoose.model('ServerTrack', ServerTrackSchema);

mongoose.connect(process.env.MONGODB || "mongodb://localhost/tribes", function (err) {
    if (err) { 
        winston.error("DB failed to connect", err);
        process.exit(1);
    }

    winston.info("DB connected");
    ServerTrack.ensureIndexes();
});

module.exports = {
    Server,
    Player,
    ServerTrack
}
