import * as express from "express";
import * as winston from "winston";
import * as _ from 'lodash';
import * as crypto from 'crypto';

import { Player, Server, Match, IMatchModel } from "./db";
import { getChatFor } from "./chat";
import { ITribesServerQueryResponse, IFullReportPlayer } from "./types";
import { prepareStats } from "./helpers";

import * as asyncHandler from 'express-async-handler';

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

function generateResultInfo(data: ITribesServerQueryResponse) {
  if (parseInt(data.teamonescore) > parseInt(data.teamtwoscore)) {
    return { text: `${data.teamone} won the match!`, team: data.teamone };
  } else if (parseInt(data.teamonescore) < parseInt(data.teamtwoscore)) {
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
      stats: prepareStats(data.fullReport.players),
    }));
}

router.get('/matches/:id.json', asyncHandler(async function (req, res, next) {
  const data = await getMatchData(req.params.id)

  res.json(data);
}));

router.get('/matches/:id', asyncHandler(async function (req, res, next) {
  const data = await getMatchData(req.params.id)
  
  res.render('match', data);
}));

async function getMatchesData(page: number, sort: string) {
  const perPage = 50;

  const [data, count] = await Promise.all([
    Match
      .find({ 'numplayers': { $gt: 0 } })
      .sort(sort)
      .select({
        basicReport: true,
        when: true
      })
      .skip((page - 1) * perPage)
      .limit(perPage)
      .exec(),
    Match
      .find({ 'numplayers': { $gt: 0 } })
      .countDocuments()
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

function parseSort(sort: 'players' | 'time') {
  switch(sort) {
    case 'players':
      return '-numplayers';
    default:
      return '-when';
  }
}

function parsePage(page: string) {
  try {
    return parseInt((page || 1) + '');
  } catch (ex) {
    return 1;
  }
}

router.get('/matches.json', asyncHandler(async function (req, res, next) {
  const data = await getMatchesData(parsePage(req.query.page), parseSort(req.query.sort));

  res.json({ ...data, sort: req.query.sort });
}));

router.get('/matches', asyncHandler(async function (req, res, next) {
  const data = await getMatchesData(parsePage(req.query.page), parseSort(req.query.sort));

  res.render('matches', { ...data, sort: req.query.sort });
}));

module.exports = {
  router
}
