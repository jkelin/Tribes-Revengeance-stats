const express = require("express");
const winston = require("winston");

const {Player, Server, ServerTrack} = require("./db.js");

let router = express.Router();

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

function limitTracks(tracks, numDays) {
    var d = new Date();
    d.setDate(d.getDate() - numDays);
    var data = []
    while (d < new Date()) {
        var e = new Date(d);
        e.setHours(e.getHours() + 1);
        var filtered = tracks.filter(t => d < t.time && t.time < e);
        if (filtered.length != 0) {
            var item = Math.min.apply(null, filtered.map(t => new Date(t.time)));
            data.push({
                time: item.time,
                players: item.numplayers
            });
        }
        d.setHours(d.getHours() + 1);
    }

    return data;
}

router.get('/server/:id', function (req, res, next) {
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
            numdays: numDays
        });
    })
    .catch(function (error) {
        next(error);
    });
});

router.get('/servers', function (req, res) {
    Server.find().sort({ lastseen: -1 }).exec(function (err, data) {
        if (err) throw err;
        res.render('servers', {
            data: data,
            alerts: [{ text: data.length + " servers total" }]
        });
    });
});

router.get('/servers.json', function (req, res) {
    Server.find().sort({ lastseen: -1 }).exec(function (err, data) {
        if (err) throw err;
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        res.json(data);
    });
});

module.exports = {
    router
}
