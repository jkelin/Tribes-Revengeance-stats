import * as express from "express";
import * as winston from "winston";
import { sortBy, toPairs } from "lodash";

import { Player, Identity, IPlayerModel } from "./db";
import { cleanPlayerName } from "./helpers";

let router = express.Router();

async function findRelatedNicknames(name: string) {
  const player = await Player.find({ '_id': name }).findOne();
  
  if(!player) {
    return null;
  }

  name = cleanPlayerName(name);

  const ip = (player.ip || '').split(':')[0];

  var fromIdentities = await findRelatedNicknamesFromIdentities(name, ip);
  var fromPlayers = await findRelatedNicknamesFromPlayers(name, ip);

  if (fromIdentities && fromIdentities.length > 0) {
    return fromIdentities.filter(x => x !== name);
  }

  if (fromPlayers && fromPlayers.length > 0) {
    return fromPlayers.filter(x => x !== name);
  }

  return null;
}

async function findRelatedNicknamesFromIdentities(name: string, ip?: string) {
  name = cleanPlayerName(name);
  const identities = await Identity.find({ 'namesAndIps': { $in: [name, ip || null] } }, { names: true }).findOne();

  if (identities) {
    return sortBy(toPairs(identities.names), x => -x[1])
      .filter(x => x[1] > 10 && x[0] !== name)
      .map(x => x[0]);
  } else {
    return null;
  }
}

async function findRelatedNicknamesFromPlayers(name: string, ip?: string) {
  if(!ip) {
    return null;
  }

  const players = await Player.find({ 'ip': { $regex: new RegExp(ip) } }, { _id: true, minutesonline: true }).find();

  if (players) {
    return sortBy(players, x => -x.minutesonline)
      .filter(x => x.minutesonline > 60)
      .filter(x => cleanPlayerName(x._id) !== name)
      .map(x => x._id);
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
  const data: IPlayerModel = await Player.where('_id').equals(name).findOne().exec();

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
