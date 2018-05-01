const express = require("express");
const exphbs = require("express-handlebars");
const compression = require("compression");
const winston = require("winston");
const path = require('path');
const http = require('http');
const bodyParser = require('body-parser');
const SocketIO = require("socket.io");

const {getTribesServersFromMasterServer, queryTribesServer} = require("./src/serverQuery.js");
const {Player, Server, ServerTrack} = require("./src/db.js");
const {tryConvertIpv6ToIpv4, tribes_news, handlebars_helpers} = require("./src/helpers.js");
const {handleTribesServerData, emitter, addServerLastFullReport, handlePlayer, trackerRouter} = require("./src/tracker.js");

require('./src/discord.js');

const Events = require("./src/events.js");

const STATS_WEB = (process.env.STATS_WEB || 'true') === 'true';
const STATS_REPORT = (process.env.STATS_REPORT || 'true') === 'true';


let app = express();
app.use(compression());

let server = http.Server(app);
let io = SocketIO(server);

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

if (STATS_WEB) {
    app.set('views', path.join(__dirname, "views"));
    app.engine('handlebars', exphbs({defaultLayout: 'main', helpers: handlebars_helpers}));
    app.set('view engine', 'handlebars');

    //app.use(bodyParser.json());
    //app.use(bodyParser.urlencoded({extended: true})); 

    app.use("/public", express.static(path.join(__dirname, "public"), {maxage: "365d"}));

    app.use("/static", express.static(path.join(__dirname, "static"), {maxage: "365d"}));
}

if (STATS_WEB) {
    const ticker = require("./src/ticker.js");
    const servers = require("./src/servers.js");
    const players = require("./src/players.js");
    const matches = require("./src/matches.js");

    app.use("/", players.router);
    app.use("/", servers.router);
    app.use("/", ticker.router);
    app.use("/", matches.router);

    app.get('/about', function (req, res) {
        res.render('about');
    });
}

if (STATS_REPORT) {
    app.use("/", trackerRouter);
}


if (STATS_WEB) {
    io.on('connection', function (socket) {
        socket.on("say", data => Events.next({type: "say", data: {server: data.server, usr: data.usr, message: data.message}}))
    });

    Events.filter(x => x.type == "chat-message").subscribe(e => io.emit(e.type, e.data));

    Events.subscribe(e => winston.info("EVENT:", e))


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
}

app.use(function (err, req, res, next) {
    winston.error("App error:", err);
    res.send(err);
});

server.listen(process.env.PORT || 5000, function () {

    var host = server.address().address;
    var port = server.address().port;

    winston.info('App listening', {host: host, port: port});
});

if (STATS_REPORT) {
    function updateFromMaster() {
        getTribesServersFromMasterServer(function (servers) {
            servers.forEach(function (item) {
                queryTribesServer(item[0], parseInt(item[1]), handleTribesServerData);
            });
        });
    }

    setInterval(updateFromMaster, 5 * 1000);
}
