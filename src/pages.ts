import * as express from "express";
import { Player, Server } from "./db";
import { tribes_news } from "./helpers";

import * as  asyncHandler from 'express-async-handler';

export const router = express.Router();

router.get('/', asyncHandler(async function (req, res, next) {
  var compDate = new Date();
  compDate.setMinutes(compDate.getMinutes() - 2);

  const data = await Promise.all([
    Player.find().sort({ kills: -1 }).limit(20).exec(),
    Player.find().sort({ minutesonline: -1 }).limit(20).exec(),
    Server.find().where({ lastseen: { "$gte": compDate } }).limit(20).exec(),
    tribes_news
  ]);

  var obj = {
    playersKills: data[0],
    playersTime: data[1],
    servers: data[2],
    news: data[3].slice(0, 5),
    now: new Date(),
    // warnings: [{ text: "If you have issues seeing servers in-game, download this <a href='https://downloads.tribesrevengeance.net/other/Engine.dll'>Engine.dll</a> and put it into your Tribes/Program/Bin folder next to your TV_CD_DVD.exe file. If you are asked to overwrite the old one, click yes." }]
  };
  
  res.render('home', obj);
}));

router.get('/about', function (req, res) {
  res.redirect(301, 'https://tribesrevengeance.net');
});

router.get('/extension', function (req, res) {
  res.render('extension');
});

router.get('/status.json', function (req, res) {
  res.json({ status: 'ok' });
});
