const express = require("express");
const winston = require("winston");

const Influx = require("influx");
const {Player, Server, influx} = require("./db.js");
const {getChatFor} = require("./chat.js");

let router = express.Router();

function getServerChartData(id, days) {
    return influx.query(`
        SELECT median("players") as "players" FROM "population"
        WHERE server = ${Influx.escape.stringLit(id)} AND time > now() - ${days}d
        GROUP BY time(10m)
    `)
    .then(function (data) {
        let map = {};

        data
        .filter(x => x.players !== null)
        .forEach(x => map[new Date(x.time).getTime()] = (x.players || 0));

        return map;
    });
}

router.get('/server/:id', async function (req, res, next) {
    var id = req.params["id"];
    var numDays = req.query.days !== undefined ? parseInt(req.query.days) : 2;
    if (numDays > 30) numDays = 30;
    if (numDays < 2) numDays = 2;
    var d = new Date();
    d.setDate(d.getDate() - numDays);

    try {
        const data = await Promise.all([
            Server.findOne().where({ _id: id }).exec(),
            getServerChartData(id, numDays)
        ]);

        var compDate = new Date();
        compDate.setMinutes(compDate.getMinutes() - 2);

        res.render('server', {
            data: data[0],
            tracks: data[1],
            chatOk: data[0].chat && data[0].chat.ok,
            chat: getChatFor(data[0]._id),
            online: data != null && data[0].lastseen > compDate,
            numdays: numDays
        });
    } catch(error) {
        next(error);
    }
});

router.get('/server/:id/chat/:from', function (req, res, next) {
    var id = req.params["id"];
    var frm = req.params["from"];

    let resp = [];
    let data = getChatFor(id);

    if(!frm) return res.json(data);

    let seenFrom = false;
    
    for(let i in data){
        if(data[i].id == frm) {
            seenFrom = true;
            continue;
        }

        if(!seenFrom) continue;

        resp.push(Object.assign({}, data[i], {html: "TODO"}));
    }

    res.json(resp);
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
