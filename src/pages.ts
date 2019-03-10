import * as express from 'express';
import { Player, Server } from './db';
import { tribesNews } from './helpers';

import * as asyncHandler from 'express-async-handler';

export const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    const compDate = new Date();
    compDate.setMinutes(compDate.getMinutes() - 2);

    const data = await Promise.all([
      Player.find()
        .sort({ kills: -1 })
        .select({
          _id: 1,
          kills: 1,
          deaths: 1,
          style: 1,
          score: 1,
          minutesonline: 1,
          lastseen: 1,
          captures: 1,
          'stats.flagCaptureStat': 1,
        })
        .lean()
        .limit(20)
        .exec(),
      Player.find()
        .sort({ minutesonline: -1 })
        .select({
          _id: 1,
          kills: 1,
          deaths: 1,
          style: 1,
          score: 1,
          minutesonline: 1,
          lastseen: 1,
          captures: 1,
          'stats.flagCaptureStat': 1,
        })
        .limit(20)
        .lean()
        .exec(),
      Server.find()
        .where({ lastseen: { $gte: compDate } })
        .select({
          _id: 1,
          country: 1,
          name: 1,
          'lastdata.mapname': 1,
          'lastdata.gametype': 1,
          'lastdata.mapnamefull': 1,
          'lastdata.numplayers': 1,
        })
        .lean()
        .limit(20)
        .exec(),
      tribesNews,
    ]);

    const obj = {
      playersKills: data[0],
      playersTime: data[1],
      servers: data[2],
      news: data[3].slice(0, 5),
      now: new Date(),
      // warnings: [{ text: "If you have issues seeing servers in-game, download this
      // <a href='https://downloads.tribesrevengeance.net/other/Engine.dll'>Engine.dll</a>
      // and put it into your Tribes/Program/Bin folder next to your TV_CD_DVD.exe file.
      // If you are asked to overwrite the old one, click yes." }]
    };

    res.render('home', obj);
  })
);

router.get('/about', (req, res) => {
  res.redirect(301, 'https://tribesrevengeance.net');
});

router.get('/extension', (req, res) => {
  res.render('extension');
});

router.get('/status.json', (req, res) => {
  res.json({ status: 'ok' });
});
