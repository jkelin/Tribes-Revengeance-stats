const Influx = require("influx");
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
        ok: Boolean,
        enabled: Boolean
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


const Match = mongoose.model('Match', {
    server: String,
    when: Date,
    basicReport: mongoose.Schema.Types.Mixed,
    fullReport: mongoose.Schema.Types.Mixed
});

async function connect() {
    const conn = mongoose.connect(
        process.env.MONGODB || "mongodb://localhost/tribes"
    );
}

connect()
.then(() => winston.info("DB connected"))
.catch(err => {
    winston.error("Error connecting to DB");
    winston.exception(err);
    process.exit(1);
})

const influx = new Influx.InfluxDB({
    username: process.env.INFLUXDB_USER,
    password: process.env.INFLUXDB_PASSWORD,
    database: process.env.INFLUXDB_DATABASE,
    host: process.env.INFLUXDB_HOST,
    port: process.env.INFLUXDB_PORT,
    schema: [{
        measurement: 'population',
        fields: {
            players: Influx.FieldType.FLOAT,
        },
        tags: [
            'server'
        ]
    }]
})

module.exports = {
    Server,
    Player,
    Match,
    influx
}
