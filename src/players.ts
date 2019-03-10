import * as express from 'express';
import * as winston from 'winston';
import { sortBy, toPairs, sumBy, maxBy, uniq, includes } from 'lodash';

import { Player, Identity, IPlayerModel } from './db';
import { cleanPlayerName, prepareStats } from './helpers';
import { IFullReportPlayer } from './types';

import * as asyncHandler from 'express-async-handler';

let router = express.Router();

async function findRelatedNicknames(name: string) {
  const player = await Player.find({ _id: name }).findOne();

  if (!player) {
    return null;
  }

  name = cleanPlayerName(name);

  const ip = (player.ip || '').split(':')[0];

  var fromIdentities = await findRelatedNicknamesFromIdentities([name], [ip]);
  var fromPlayers = await findRelatedNicknamesFromPlayers(name, ip);

  if (fromIdentities && fromIdentities.length > 0) {
    return uniq(fromIdentities.map(cleanPlayerName)).filter(x => x !== name);
  }

  if (fromPlayers && fromPlayers.length > 0) {
    return uniq(fromPlayers.map(cleanPlayerName)).filter(x => x !== name);
  }

  return null;
}

async function findRelatedNicknamesFromIdentities(names: string[], ips: string[]) {
  names = names.map(cleanPlayerName);
  const identities = await Identity.find({ namesAndIps: { $in: [...names, ...ips] } }, { names: true }).findOne();

  if (identities) {
    return sortBy(toPairs(identities.names), x => -x[1])
      .filter(x => x[1] > 10 && !includes(names, x[0]))
      .map(x => x[0]);
  } else {
    return null;
  }
}

async function findRelatedNicknamesFromPlayers(name: string, ip?: string) {
  if (!ip) {
    return null;
  }

  const players = await Player.find({ ip: { $regex: new RegExp(ip) } }, { _id: true, minutesonline: true }).find();

  if (players) {
    return sortBy(players, x => -x.minutesonline)
      .filter(x => x.minutesonline > 60)
      .filter(x => cleanPlayerName(x._id) !== name)
      .map(x => x._id);
  } else {
    return null;
  }
}

function getFullReportForPlayer(player: IPlayerModel): IFullReportPlayer {
  return {
    name: player._id,
    ip: player.ip,
    style: player.style,
    defense: player.defense,
    offense: player.offense,
    deaths: player.deaths,
    kills: player.kills,
    score: player.score,
    minutesonline: player.minutesonline,
    ...player.stats,
  } as any;
}

router.get(
  '/player/:name.json',
  asyncHandler(async function(req, res) {
    var name = decodeURIComponent(req.params['name']);
    const similar = await findRelatedNicknames(name);
    // const data = await Player.where({ _id: name }).findOne();

    res.json({
      relatedNicknames: similar,
      relatedNicknamesString: similar && similar.join(', '),
    });
  })
);

router.get(
  '/player/:name',
  asyncHandler(async function(req, res) {
    var name = decodeURIComponent(req.params['name']);
    const similar = await findRelatedNicknames(name);
    const data: IPlayerModel = await Player.where('_id')
      .equals(name)
      .findOne()
      .exec();

    const personaCount = await Player.where('normalizedName')
      .equals(cleanPlayerName(name))
      .find()
      .countDocuments()
      .exec();

    res.render('player', {
      data: data,
      persona: data && personaCount > 0 ? data.normalizedName : null,
      relatedNicknames: similar,
      relatedNicknamesString: similar && similar.join(', '),
    });
  })
);

router.get(
  '/players',
  asyncHandler(async function(req, res) {
    const players = await Player.find()
      .sort({ lastseen: -1 })
      .exec();

    const playerCount = await Player.countDocuments().exec();

    res.render('players', {
      data: players,
      alerts: [{ text: playerCount + ' aliases total' }],
    });
  })
);

router.get(
  '/persona/:name',
  asyncHandler(async function(req, res) {
    var name = decodeURIComponent(req.params['name']);
    const names: IPlayerModel[] = await Player.where('normalizedName')
      .equals(cleanPlayerName(name))
      .find()
      .exec();

    if (names.length < 1) {
      return res.render('persona');
    }

    const fullReports = names.map(getFullReportForPlayer);
    const stats = prepareStats(fullReports);
    const relatedNicknames = await findRelatedNicknamesFromIdentities(
      names.map(x => x._id),
      names.map(x => (x.ip || '').split(':')[0])
    );

    res.render('persona', {
      name: cleanPlayerName(name),
      score: sumBy(names, 'score'),
      kills: sumBy(names, 'kills'),
      deaths: sumBy(names, 'deaths'),
      offense: sumBy(names, 'offense'),
      defense: sumBy(names, 'defense'),
      style: sumBy(names, 'style'),
      minutesonline: sumBy(names, 'minutesonline'),
      lastseen: sortBy(names, 'lastseen').reverse()[0],
      names: sortBy(names, 'minutesonline').reverse(),
      stats: stats,
      relatedNicknames: relatedNicknames,
    });
  })
);

router.get(
  '/personas',
  asyncHandler(async function(req, res) {
    const personas: IPlayerModel[] = await Player.aggregate([
      {
        $group: {
          _id: '$normalizedName',
          count: { $sum: 1 },
          score: { $sum: '$score' },
          kills: { $sum: '$kills' },
          deaths: { $sum: '$deaths' },
          offense: { $sum: '$offense' },
          defense: { $sum: '$defense' },
          style: { $sum: '$style' },
          minutesonline: { $sum: '$minutesonline' },
          captures: { $sum: '$stats.flagCaptureStat' },
          lastseen: { $max: '$lastseen' },
        },
      },
      {
        $match: {
          minutesonline: { $gte: 60 },
          score: { $gte: 100 },
          _id: { $ne: '' },
        },
      },
      {
        $sort: {
          score: -1,
        },
      },
    ]).exec();

    res.render('personas', {
      data: personas,
      alerts: [
        {
          text:
            personas.length +
            ' tribals total. Only tribals with aggregate play time of 60 minutes and 100 score are shown.',
        },
      ],
      linkPrefix: 'persona',
    });
  })
);

module.exports = {
  router,
};
