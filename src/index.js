const express = require("express");
const ExpressWs = require("express-ws");
const exphbs = require("express-handlebars");
const compression = require("compression");
const winston = require("winston");
const path = require('path');

const {getTribesServersFromMasterServer, queryTribesServer} = require("./serverQuery.js");
const {Player, Server, ServerTrack} = require("./db.js");
const {tryConvertIpv6ToIpv4, tribes_news, handlebars_helpers} = require("./helpers.js");
const {handleTribesServerData, emitter, addServerLastFullReport, handlePlayer, trackerRouter} = require("./tracker.js");

const ticker = require("./ticker.js");
const servers = require("./servers.js");
const players = require("./players.js");


let app = express();
let expressWs = ExpressWs(app);

// This is needed for /upload
app.use(function (req, res, next) {
    var data = '';
    req.setEncoding('utf8');
    req.on('data', function (chunk) {
        data += chunk;
    });

    req.on('end', function () {
        req.body = data;
        next();
    });
});

app.engine('handlebars', exphbs({defaultLayout: 'main', helpers: handlebars_helpers}));
app.set('view engine', 'handlebars');

app.use(express.static(path.join(__dirname, "..", "public"), { maxAge: 86400000 }));
app.use(compression());

app.use("/", players.router);
app.use("/", servers.router);
app.use("/", trackerRouter);
app.use("/", ticker.router);
app.ws('/', ticker.handleWs);

app.get('/', function (req, res) {
    var compDate = new Date();
    compDate.setMinutes(compDate.getMinutes() - 2);

    var promises = [
        Player.find().sort({ kills: -1 }).limit(20).exec(),
        Player.find().sort({ minutesonline: -1 }).limit(20).exec(),
        Server.find().where({ lastseen: { "$gte": compDate } }).limit(20).exec(),
        tribes_news
    ];

    Promise.all(promises)
    .then(function (data) {
        var obj = {
            playersKills: data[0],
            playersTime: data[1],
            servers: data[2],
            news: data[3].slice(0, 5),
            now: new Date()
        };
        res.render('home', obj);
    })
    .catch(function (error) {
        next(error);
    });
})

app.get('/search', function (req, res) {
    var name = req.query.name !== undefined ? req.query.name : "";
    Player.where({ _id: new RegExp(name, "i") }).sort({ lastseen: -1 }).find().exec(function (err, data) {
        if (err) throw err;
        res.render('players', {
            data: data,
            alerts: [{ text: data.length + " results" }]
        });
    });
})

app.use(function (err, req, res, next) {
    winston.error("App error:", err);
    res.send(err);
});

var server = app.listen(process.env.PORT || 5000, function () {

    var host = server.address().address;
    var port = server.address().port;

    winston.info('App listening', {host: host, port: port});
});

function updateFromMaster() {
    getTribesServersFromMasterServer(function (servers) {
        servers.forEach(function (item) {
            queryTribesServer(item[0], parseInt(item[1]), handleTribesServerData);
        });
    });
}

setInterval(updateFromMaster, 5 * 1000);
