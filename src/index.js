const express = require("express");
const ExpressWs = require("express-ws");
const atob = require("atob");
const exphbs = require("express-handlebars");
const url = require("url");
const moment = require("moment");
const timespan = require( "timespan");
const github = require("octonode");
const underscore = require("underscore");
const compression = require("compression");
const winston = require("winston");
const Events = require("events");
const path = require('path');

const {getTribesServersFromMasterServer, queryTribesServer} = require("./serverQuery.js");
const {Player, Server, ServerTrack} = require("./db.js");
const {tryConvertIpv6ToIpv4, tribes_news, getClientIp} = require("./helpers.js");
const {handleTribesServerData, emitter, addServerLastFullReport} = require("./tracker.js");

const countryNames = require("./countrynames.json");

let app = express();
let expressWs = ExpressWs(app);

function limitTracks(tracks, numDays) {
    var d = new Date();
    d.setDate(d.getDate() - numDays);
    var data = []
    while (d < new Date()) {
        var e = new Date(d);
        e.setHours(e.getHours() + 1);
        var filtered = underscore.filter(tracks, function (t) { return d < t.time && t.time < e; });
        if (filtered.length != 0) {
            var item = underscore.min(filtered, function (t) { return new Date(t.time) });
            data.push({
                time: item.time,
                players: item.numplayers
            });
        }
        d.setHours(d.getHours() + 1);
    }

    return data;
}


// ----------------------------------------
// express
// ----------------------------------------

var handlebars_helpers = {
    json: function (context) { return JSON.stringify(context); },
    urlencode: function (context) { return encodeURIComponent(context); },
    showMinutes: function (context) {
        var span = new timespan.TimeSpan();
        span.addMinutes(parseInt(context));
        var str = "";
        if (span.days == 1) str += span.days + " day ";
        else if (span.days != 0) str += span.days + " days ";
        if (span.hours != 0) str += span.hours + " hours ";
        if (str != "") str += "and ";
        str += span.minutes + " minutes";
        return str;
    },
    showMoment: function (context) { return moment(context).fromNow(); },
    translateStatName: function (context) {
        var table = require(__dirname + "/statnames.json");
        for (var i in table) {
            if (context == i) return table[i];
        };
        return context;
    },
    killsperminute: function (context) {
        if(!context.kills && !context.deaths){
            return "";
        }

        return ((context.kills || 0) / (context.minutesonline || 1)).toFixed(2); 
    },
    inc: function (num) { return num + 1; },
    countryname: function (country, options) { return countryNames[country.toUpperCase()]; },
    condPrint: function (v1, v2, v3) {
        return (v1 == v2) ? v3 : "";
    },
    emptyIfZero: function (context, num) {
        if(context.kills || context.deaths) {
            return num || 0;
        }

        if(typeof(num) !== "number") {
            return num;
        }

        if(Math.abs(num) < 0.0001) {
            return "";
        }

        return num;
    }
};

app.set('views', path.join(__dirname, "..", "views"));
app.engine('handlebars', exphbs({ defaultLayout: 'main' }));
app.set('view engine', 'handlebars');

app.use(express.static(path.join(__dirname, "..", "public"), { maxAge: 86400000 }));
app.use(compression());

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
            helpers: handlebars_helpers,
            now: new Date()
        };
        res.render('home', obj);
    })
    .catch(function (error) {
        next(error);
    });
})

app.get('/player/:name', function (req, res) {
    var name = req.params["name"];
    Player.where({ _id: name }).findOne(function (err, data) {
        if (err) throw err;
        res.render('player', {
            data: data,
            helpers: handlebars_helpers
        });
    });
})

app.get('/players', function (req, res) {
    Player.find().sort({ lastseen: -1 }).exec(function (err, data) {
        Player.count({}, function (e, c) {
            if (err) throw err;
            if (e) throw e;
            res.render('players', {
                data: data,
                alerts: [{ text: c + " players total" }],
                helpers: handlebars_helpers
            });
        });
    });
})

app.get('/servers', function (req, res) {
    Server.find().sort({ lastseen: -1 }).exec(function (err, data) {
        if (err) throw err;
        res.render('servers', {
            data: data,
            alerts: [{ text: data.length + " servers total" }],
            helpers: handlebars_helpers
        });
    });
});

app.get('/servers.json', function (req, res) {
    Server.find().sort({ lastseen: -1 }).exec(function (err, data) {
        if (err) throw err;
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        res.json(data);
    });
});


app.get('/search', function (req, res) {
    var name = req.query.name !== undefined ? req.query.name : "";
    Player.where({ _id: new RegExp(name, "i") }).sort({ lastseen: -1 }).find().exec(function (err, data) {
        if (err) throw err;
        res.render('players', {
            data: data,
            alerts: [{ text: data.length + " results" }],
            helpers: handlebars_helpers
        });
    });
})

app.get('/ticker', function (req, res) {
    res.render('ticker');
});

function parseServerTimeData(data) {
    var o = {};
    data.forEach(function (element) {
        var time = new Date(element.value.avgTime);
        var index = time.getTime();
        var value = element.value.max;

        o[index] = value;
    });
    return o;
}

function makeMro(id, d) {
    var mro = {};
    mro.map = function () {
        var dayStr = this.time.getFullYear() + '-' + this.time.getMonth() + '-' + this.time.getDay();
        var hourStr = this.time.getHours();
        var finalStr = dayStr + ':' + hourStr;

        emit(
            finalStr,
            { num: this.numplayers, time: this.time, server: this.serverId }
        );
    }
    mro.reduce = function (key, values) {
		/*var sum = 0;
		for(var i = 1;i<values.length;i++) sum+=values[i].num;
		var cnt = values.length;
		var avg = sum/cnt;
		var rounded = Math.round(avg);*/

        var minTime = values[1].time;
        var maxTime = values[values.length - 1].time;

        var avgTimestamp = (minTime.getTime() + maxTime.getTime()) / 2;
        var avgTime = new Date(avgTimestamp);

        var max = 0;
        for (var i = 1; i < values.length; i++) if (max < values[i].num) max = values[i].num;

        return {
            //key:key, 
            //players: rounded,
            max: max,
            //avg:avg,
            //server:values[1].server,
            //minTime:minTime,
            //maxTime:maxTime,
            avgTime: avgTime
        };
    }
    mro.query = {
        "serverId": id,
        "time": { "$gte": d }
    };

    return mro;
}

function getMinutesUntilNextHour() {
    return 60 - new Date().getMinutes();
}

function getServerChartData(id, d, days) {
    var mro = makeMro(id, d);

    return ServerTrack.mapReduce(mro).then(function (data) {
        return data;
    });
}

app.get('/server/:id', function (req, res, next) {
    var id = req.params["id"];
    var numDays = req.query.days !== undefined ? parseInt(req.query.days) : 2;
    if (numDays > 7) numDays = 7;
    if (numDays < 2) numDays = 2;
    var d = new Date();
    d.setDate(d.getDate() - numDays);

    var promises = [
        Server.findOne().where({ _id: id }).exec(),
        //ServerTrack.where({serverId: id, time: {'$gt':d}}).find().exec()
        getServerChartData(id, d, numDays)
    ];

    return Promise.all(promises)
    .then(function (data) {
        var compDate = new Date();
        compDate.setMinutes(compDate.getMinutes() - 2);

        var parsed = parseServerTimeData(data[1]);
        //console.log(parsed);
        res.render('server', {
            data: data[0],
            //tracks: limitTracks(data[1], numDays),
            tracks: parsed,
            online: data != null && data[0].lastseen > compDate,
            helpers: handlebars_helpers,
            numdays: numDays
        });
    })
    .catch(function (error) {
        next(error);
    });
});

app.post('/upload', function (req, res) {
    var ip = getClientIp(req);
    res.send('Hello World!')
    winston.debug("received upload request", {ip: ip, data: req.body})
    var decoded = atob(req.body);
    var object = JSON.parse(decoded);

    object.players
    .forEach(function (player) {
        handlePlayer(player, ip, object.port);
    });

    addServerLastFullReport(ip, object.port);
})

app.ws('/', function (ws, req) {
    function listen(type, data) {
        var wsData = {
            type: type,
            server: data.server._id,
            serverName: data.server.name,
            player: data.player.player
        };

        if (ws && !ws.closed) ws.send(JSON.stringify(wsData));
    }

    function ping() {
        if (ws && !ws.closed) ws.send("PING");
    }

    emitter.addListener("join", listen.bind(null, "join"));
    emitter.addListener("left", listen.bind(null, "left"));
    var interval = setInterval(ping, 30 * 1000);

    ws.on('error', function () {
        ws.closed = true;
        emitter.removeListener("join", listen);
        clearInterval(interval);
    });

    ws.on('close', function () {
        ws.closed = true;
        emitter.removeListener("join", listen);
        clearInterval(interval);
    });

    ping();
});

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
