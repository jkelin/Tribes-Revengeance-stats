import express from "express";
import winston from "winston";
import { sortBy, toPairs } from "lodash";

import {Player, Identity, IPlayerModel, IIdentityModel, IIdentity} from "./db";
import { cleanPlayerName } from "./helpers";

let router = express.Router();

async function findRelatedNicknames(name: string) {
    name = cleanPlayerName(name);
    const data: IIdentity = await Identity
        .where('namesAndIps').in([ name ])
        .select({ names: true })
        .findOne()
        .exec();

    if(data) {
        return sortBy(toPairs(data.names), x => -x[1])
        .filter(x => x[1] > 10 && x[0] !== name)
        .map(x => x[0]);
    } else {
        return null;
    }
}

router.get('/player/:name.json', async function (req, res) {
    var name = decodeURIComponent(req.params["name"]);
    const similar = await findRelatedNicknames(name);
    // const data = await Player.where({ _id: name }).findOne();

    res.json({
        relatedNicknames: similar,
        relatedNicknamesString: similar && similar.join(', ')
    });
})

router.get('/player/:name', async function (req, res) {
    var name = decodeURIComponent(req.params["name"]);
    const similar = await findRelatedNicknames(name);
    const data: IPlayerModel = await Player
        .where('_id').equals(name)
        .findOne()
        .exec();

    res.render('player', {
        data: data,
        relatedNicknames: similar,
        relatedNicknamesString: similar && similar.join(', ')
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
