import * as express from "express";
import * as winston from "winston";
import * as _ from 'lodash';
import * as crypto from 'crypto';

import { Player, Server, Match, IMatchModel } from "./db";
import { getChatFor } from "./chat";
import { ITribesServerQueryResponse, IFullReportPlayer } from "./types";
import * as StatOrder from '../data/statorder.json';

function sha1(input: string) {
  const shasum = crypto.createHash('sha1');
  return shasum.update(input).digest('hex');
}

let router = express.Router();

function getPlayersForTeam(data: IMatchModel, team: string) {
  return data.fullReport.players
    .filter(p => p.team === team)
    .map(x => {
      const ip = x.ip.split(':')[0];

      return {
        ...x,
        ip: undefined,
        ipHash: ip && sha1(ip),
        ipHashFirstTwo: ip && sha1(ip.split('.')[0] + ip.split('.')[1]),
        ipHashFirstThree: ip && sha1(ip.split('.')[0] + ip.split('.')[1] + ip.split('.')[2]),
        url: '/player/' + encodeURIComponent(x.name)
      }
    })
    .sort((a, b) => b.score - a.score)
}

function handleItem(key: string, player: IFullReportPlayer) {
  return {
    value: player[key],
    name: player.name,
    team: player.team
  }
}

function prepareStats(data: IMatchModel) {
  const keys = Object.keys(data.fullReport.players[0]).filter(x => [
    'style',
    'defense',
    'offense',
    'deaths',
    'kills',
    'score',
    'team',
    'voice',
    'starttime',
    'ping',
    'name',
    'url',
    'ip'
  ].indexOf(x) === -1);

  function getDataForKey(k: string) {
    return {
      max: handleItem(k, _.maxBy(data.fullReport.players, x => x[k])!),
      min: handleItem(k, _.minBy(data.fullReport.players, x => x[k])!),
      sum: _.sumBy(data.fullReport.players, k),
      avg: _.meanBy(data.fullReport.players, k),
      key: k
    };
  }

  const ret: Record<string, ReturnType<typeof getDataForKey>> = {};
  keys
    .filter(k => data.fullReport.players.find(p => !!p[k]))
    .forEach(k => ret[k] = getDataForKey(k));

  return _.sortBy(_.values(ret).filter(x => x.sum > 0), x => StatOrder[x.key] || "99" + x.key);
}

function generateResultInfo(data: ITribesServerQueryResponse) {
  if (data.teamonescore > data.teamtwoscore) {
    return { text: `${data.teamone} won the match!`, team: data.teamone };
  } else if (data.teamonescore < data.teamtwoscore) {
    return { text: `${data.teamtwo} won the match!`, team: data.teamtwo };
  } else {
    return { text: 'Match ended in a tie!' }
  }
}

function getMatchData(id: string) {
  return Match
    .where('_id').equals(id)
    .findOne()
    .exec()
    .then((data: IMatchModel) => ({
      id: data._id,
      when: data.when,
      result: generateResultInfo(data.basicReport),
      info: { ...data.basicReport, players: undefined },
      team1: getPlayersForTeam(data, data.basicReport.teamone),
      team2: getPlayersForTeam(data, data.basicReport.teamtwo),
      stats: prepareStats(data),
    }));
}

router.get('/matches/:id.json', function (req, res, next) {
  return getMatchData(req.params.id).then(data => res.json(data))
});

router.get('/matches/:id', function (req, res, next) {
  return getMatchData(req.params.id).then(data => res.render('match', data))
});

async function getMatchesData(page: number) {
  const perPage = 50;

  const [data, count] = await Promise.all([
    Match
      .find({ 'basicReport.numplayers': { $ne: '0' } })
      .sort('-when')
      .select({
        basicReport: true,
        when: true
      })
      .skip((page - 1) * perPage)
      .limit(perPage)
      .exec(),
    Match
      .find({ 'basicReport.numplayers': { $ne: '0' } })
      .count()
      .exec()
  ]);

  const lastPage = Math.floor(count / perPage) + 1;

  return {
    matches: data.map(m => ({
      id: m._id,
      when: m.when,
      map: m.basicReport.mapname,
      hostname: m.basicReport.hostname,
      teamone: m.basicReport.teamone,
      teamonescore: m.basicReport.teamonescore,
      teamtwo: m.basicReport.teamtwo,
      teamtwoscore: m.basicReport.teamtwoscore,
      gametype: m.basicReport.gametype,
      numplayers: m.basicReport.numplayers,
    })),
    pagination: {
      page,
      perPage,
      count: count,
      first: 1,
      last: lastPage,
      prev: page - 1 >= 1 ? page - 1 : null,
      next: page + 1 <= lastPage ? page + 1 : null,
    }
  };
}

function parsePage(page: string) {
  try {
    return parseInt((page || 1) + '');
  } catch (ex) {
    return 1;
  }
}

router.get('/matches.json', function (req, res, next) {
  return getMatchesData(parsePage(req.query.page))
    .then(data => res.json(data))
});

router.get('/matches', function (req, res, next) {
  return getMatchesData(parsePage(req.query.page))
    .then(data => res.render('matches', data))
});

module.exports = {
  router
}
