import express from 'express';

import { escape } from 'influx';
import { getChatFor } from './chat';
import { influx, IPlayerModel, IServerModel, Player, Server } from './db';

import asyncHandler from 'express-async-handler';
import { getMatchesData, parsePage, parseSort } from './matches';

const router = express.Router();

function getServerChartData(id: string, days: number) {
  return influx
    .query<{ players: number; time: number }>(
      `
        SELECT median("players") as "players" FROM "population"
        WHERE server = ${escape.stringLit(id)} AND time > now() - ${days}d
        GROUP BY time(10m)
    `
    )
    .then((data) => {
      const map: Record<number, number> = {};

      data.filter((x) => x.players !== null).forEach((x) => (map[new Date(x.time).getTime()] = x.players || 0));

      return map;
    });
}

router.get(
  '/server/:id',
  asyncHandler(async (req, res, next) => {
    const id: string = req.params.id;
    let numDays = req.query.days !== undefined ? parseInt(req.query.days, 10) : 2;
    if (numDays > 30) {
      numDays = 30;
    }
    if (numDays < 2) {
      numDays = 2;
    }
    const d = new Date();
    d.setDate(d.getDate() - numDays);

    try {
      const data = await Promise.all([
        Server.where('_id', id).findOne().exec() as Promise<IServerModel>,
        getServerChartData(id, numDays),
        getMatchesData(parsePage(req.query.page), parseSort(req.query.sort), { server: id }),
      ]);

      const compDate = new Date();
      compDate.setMinutes(compDate.getMinutes() - 2);

      res.render('server', {
        data: data[0],
        matches: (data[2] as any).matches,
        pagination: (data[2] as any).pagination,
        tracks: data[1],
        chatOk: data[0].chat && data[0].chat.ok,
        chat: getChatFor(data[0]._id),
        online: data != null && data[0].lastseen > compDate,
        numdays: numDays,
      });
    } catch (error) {
      next(error);
    }
  })
);

// TODO rewrite this so it goes straight to redis
router.get('/server/:id/chat/:from', (req, res, next) => {
  const id = req.params.id;
  const frm = req.params.from;

  const resp: any[] = [];
  const messages = getChatFor(id);

  if (!frm) {
    return res.json(messages);
  }

  let seenFrom = false;

  for (const message of messages) {
    if (message.id === frm) {
      seenFrom = true;
      continue;
    }

    if (!seenFrom) {
      continue;
    }

    resp.push({ ...message, html: 'TODO' });
  }

  res.json(resp);
});

router.get(
  '/servers',
  asyncHandler(async (req, res) => {
    const data = await Server.find().sort({ lastseen: -1 }).exec();

    res.render('servers', {
      data,
      alerts: [{ text: data.length + ' servers total' }],
    });
  })
);

router.get(
  '/servers.json',
  asyncHandler(async (req, res) => {
    const data = await Server.find().sort({ lastseen: -1 }).exec();

    res.json(data);
  })
);

router.get(
  '/servers.players.json',
  asyncHandler(async (req, res) => {
    const data = await Server.find().sort({ lastseen: -1 }).select({ lastdata: 1, lastseen: 1, name: 1 }).lean().exec();

    const players = data
      .filter((x) => x.lastdata)
      .filter((x) => Date.now() - 60 * 1000 < x.lastseen.getTime())
      .map((x) => ({ id: x._id, name: x.name, players: x.lastdata.players }));

    res.json(players);
  })
);

module.exports = {
  router,
};
