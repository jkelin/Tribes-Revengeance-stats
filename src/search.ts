import * as express from "express";
import { Player } from "./db";

export const router = express.Router();

function searchPlayers(name: string) {
  return Player
    .where('_id').regex(new RegExp(name, "i"))
    .sort({ lastseen: -1 })
    .select(['_id', 'score', 'kills', 'deaths', 'offense', 'defense', 'style', 'minutesonline', 'lastseen', 'stats.flagCaptureStat'])
    .find()
    .exec();
}

router.get('/search', async function (req, res) {
  var name = req.query.name !== undefined ? decodeURIComponent(req.query.name) : "";
  const data = await searchPlayers(name);
  res.render('players', {
    data: data,
    alerts: [{ text: data.length + " results" }]
  });
});
