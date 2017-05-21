const express = require("express");
const winston = require("winston");

const {Player, Server, ServerTrack} = require("./db.js");

let router = express.Router();

function getServerChartData(id, days) {
    let date = new Date();
    date.setDate(date.getDate() - days);

    const pipeline = [
        { 
            $match: { 
                serverId: id,
                time: {$gte: date}
            } 
        },
        {
            $group: {
                _id: {
                    server: "$serverId",
                    month: {$month: "$time"},
                    day: {$dayOfMonth: "$time"},
                    year: {$year: "$time"},
                    hour: {$hour: "$time"}
                },
                value: {$max: "$numplayers"}
            }
        }
    ];

    return ServerTrack.aggregate(pipeline)
    .then(function (data) {
        let map = {};
        data.forEach(x => map[new Date(x._id.year, x._id.month, x._id.day, x._id.hour).getTime()] = x.value)
        return map;
    });
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
        getServerChartData(id, numDays)
    ];

    return Promise.all(promises)
    .then(function (data) {
        var compDate = new Date();
        compDate.setMinutes(compDate.getMinutes() - 2);

        res.render('server', {
            data: data[0],
            tracks: data[1],
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
