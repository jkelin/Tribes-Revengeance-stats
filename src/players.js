const express = require("express");
const winston = require("winston");

const {Player, Server} = require("./db.js");

let router = express.Router();

router.get('/player/:name', function (req, res) {
    var name = req.params["name"];
    Player.where({ _id: name }).findOne(function (err, data) {
        if (err) throw err;
        res.render('player', {
            data: data
        });
    });
})

router.get('/players', function (req, res) {
    Player.find().sort({ lastseen: -1 }).exec(function (err, data) {
        Player.count({}, function (e, c) {
            if (err) throw err;
            if (e) throw e;
            res.render('players', {
                data: data,
                alerts: [{ text: c + " players total" }]
            });
        });
    });
})

module.exports = {
    router
}
