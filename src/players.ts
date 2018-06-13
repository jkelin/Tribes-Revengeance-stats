const express = require("express");
const winston = require("winston");
const { sortBy, toPairs } = require("lodash");

const {Player, Identity} = require("./db");

let router = express.Router();

async function findRelatedNicknames(name) {
    const data = await Identity.find({ 'namesAndIps': { $in: [name] } }, { names: true }).findOne();
    return sortBy(toPairs(data.names), x => -x[1]).filter(x => x[1] > 5).map(x => x[0]);
}

router.get('/player/:name', async function (req, res) {
    var name = req.params["name"];
    const similar = await findRelatedNicknames(name);
    const data = await Player.where({ _id: name }).findOne();

    console.warn({
        ...data._doc,
        relatedNicknames: similar
    });

    res.render('player', {
        data: {...data._doc, relatedNicknames: similar}
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
