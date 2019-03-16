import { CronJob } from 'cron';
import { maxBy, meanBy, minBy, sortBy, sumBy, values } from 'lodash';
import * as moment from 'moment';
import * as github from 'octonode';
import * as path from 'path';
import * as sha1File from 'sha1-file';
import * as timespan from 'timespan';
import { Request } from '../node_modules/@types/express-serve-static-core';
import * as availableMapImages from './data/available-map-images.json';
import * as tags from './data/clan-tags.json';
import * as countryNames from './data/countrynames.json';
import * as StatNames from './data/statnames.json';
import * as StatOrder from './data/statorder.json';
import { removeDiacritics } from './removeAccents';
import { IFullReportPlayer, INews } from './types';

export function tryConvertIpv6ToIpv4(ip: string) {
  const regex = /^::ffff:([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})$/;
  const matches = regex.exec(ip);

  if (matches && matches.length === 2) {
    return matches[1];
  } else {
    return ip;
  }
}

export function getNews() {
  console.info('Fetching news');

  return new Promise<INews[]>((resolve, reject) => {
    const client = github.client();
    const repo = client.repo('jkelin/Tribes-Revengeance-stats');

    repo.commits((error, commits) => {
      if (error) {
        console.error(error.message);

        // return reject(error);
        return resolve([]);
      } else {
        const data: INews[] = [];

        for (const commit of commits) {
          const message = commit.commit.message;
          const dateStr = commit.commit.author.date;
          const url = commit.html_url;
          const date = new Date(dateStr);

          data.push({
            message,
            date,
            url,
          });
        }

        console.info('News resolved');

        return resolve(data);
      }
    });
  });
}

export let tribesNews: Promise<INews[]>;
const cronJob = new CronJob({
  cronTime: '0 0 * * * *',
  onTick: () => (tribesNews = getNews()),
  start: true,
  runOnInit: true,
});

export function getClientIp(req: Request) {
  let ipAddress;
  const forwardedIpsStr = req.header('x-forwarded-for');

  if (forwardedIpsStr) {
    const forwardedIps = forwardedIpsStr.split(',');
    ipAddress = forwardedIps[0];
  }

  if (!ipAddress) {
    ipAddress = req.connection.remoteAddress;
  }

  return ipAddress && tryConvertIpv6ToIpv4(ipAddress);
}

export function aIncludesB(a: string[], b: string[]) {
  for (const i in b) {
    if (a.filter(x => x.indexOf(b[i]) !== -1).length === 0) { return false; }
  }

  return true;
}

export function getFullMapName(map: string) {
  const mapImageComponentMap = availableMapImages.map(x => ({ map: x, components: x.split(/[- ]/g) }));

  const searchComponents = map
    .toLowerCase()
    .replace(/[\[\]\-\_\(\)\<\>]/g, ' ')
    .replace('.tvm', '')
    .split(' ')
    .filter(x => x);

  const possibleMaps = mapImageComponentMap.filter(x => aIncludesB(x.components, searchComponents));

  if (!possibleMaps.length) { return undefined; }
  else { return possibleMaps.map(x => x.map).sort()[0]; }
}

export const handlebarsHelpers: Record<string, (...params: any[]) => string> = {
  json(context) {
    return JSON.stringify(context);
  },
  urlencode(context) {
    return encodeURIComponent(context);
  },
  showMinutes(context) {
    const span = new timespan.TimeSpan();
    span.addMinutes(parseInt(context, 10));
    let str = '';
    if (span.days === 1) { str += span.days + ' day '; }
    else if (span.days !== 0) { str += span.days + ' days '; }
    if (span.hours !== 0) { str += span.hours + ' hours '; }
    if (str !== '') { str += 'and '; }
    str += span.minutes + ' minutes';
    return str;
  },
  showHours(context) {
    return Math.round(parseInt(context, 10) / 60) + ' hours';
  },
  showMoment(context) {
    return moment(context).fromNow();
  },
  translateStatName(context) {
    for (const i in StatNames) {
      if (context === i) { return StatNames[i]; }
    }
    return context;
  },
  killsperminute(context) {
    if (!context.kills && !context.deaths) {
      return '';
    }

    return ((context.kills || 0) / (context.minutesonline || 1)).toFixed(2);
  },
  inc(num) {
    return num + 1;
  },
  countryname(country, options) {
    return country && countryNames[country.toUpperCase()];
  },
  condPrint(v1, v2, v3) {
    return v1 === v2 ? v3 : '';
  },
  emptyIfZero(context, num) {
    if (context.kills || context.deaths) {
      return num || 0;
    }

    if (typeof num !== 'number') {
      return num;
    }

    if (Math.abs(num) < 0.0001) {
      return '';
    }

    return num;
  },
  mapImage(map, kind = 'loadscreens-chopped', thumbnail = true) {
    const baseUrl =
      kind === 'loadscreens-chopped' && thumbnail === true
        ? '/static'
        : 'https://map-images.tribesrevengeance.net';

    return `${baseUrl}/${kind}${thumbnail ? '-thumbnails' : ''}/${map}.jpg`;
  },
  mapName(map = '') {
    const splat = map.split('-');
    return splat[splat.length - 1].replace(/\(.*\)|\.tvm|BEML[0-9]/g, '').trim();
  },
  humanDate(date) {
    return moment(date).format('YYYY-MM-DD');
  },
  humanTime(date) {
    return moment(date).format('HH:mm');
  },
  csshash: () => (sha1File as any)(path.join(__dirname, '..', 'public', 'custom.css')),
  jshash: () => (sha1File as any)(path.join(__dirname, '..', 'public', 'custom.js')),
};

export function matchClan(name: string) {
  // tslint:disable-next-line:forin
  for (const i in tags) {
    const regex = new RegExp(tags[i], 'i');

    if (regex.test(name)) {
      return {
        clan: i,
        name: regex.exec(name)![1],
      };
    }
  }

  return undefined;
}

export function stripClanTags(name: string) {
  const clan = matchClan(name);
  if (clan) {
    return clan.name;
  } else {
    return name;
  }
}

export function stripFormating(name: string) {
  return name
    .replace(/\[c=[0-9a-f]{1}\]/i, '')
    .replace(/\[c=[0-9a-f]{3}\]/i, '')
    .replace(/\[c=[0-9a-f]{6}\]/i, '')
    .replace(/\[i\]/i, '')
    .replace(/\[u\]/i, '')
    .replace(/\[b\]/i, '');
}

export function removeSpaces(name: string) {
  for (let i = 0; i < 10; i++) {
    name = name
      .replace(/  /g, ' ')
      .replace(/^ /g, '')
      .replace(/ $/g, '');
  }

  return name;
}

export function removeTrailingDigits(name: string) {
  name = name.replace(/\d{1,3}$/g, ' ');

  return name;
}

export function cleanPlayerName(name: string) {
  name = name.toLocaleLowerCase();
  name = removeDiacritics(name);
  name = stripClanTags(name);
  name = stripFormating(name);
  name = name.replace(/[^a-z0-9\-\_]/gi, ' ');
  name = removeTrailingDigits(name);
  name = removeSpaces(name);

  return name.trim();
}

function handleItem(key: string, player: IFullReportPlayer) {
  return {
    value: player[key],
    name: player.name,
    team: player.team,
  };
}

export function getStatAggregateForPlayer(statName: string, players: IFullReportPlayer[]) {
  return {
    max: handleItem(statName, maxBy(players, x => x[statName])!),
    min: handleItem(statName, minBy(players, x => x[statName])!),
    sum: sumBy(players, statName),
    avg: meanBy(players, statName),
    key: statName,
  };
}

export function prepareStats(players: IFullReportPlayer[]): Array<ReturnType<typeof getStatAggregateForPlayer>> {
  if (!players.length) {
    return [];
  }

  const keys = Object.keys(players[0]).filter(
    x =>
      [
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
        'ip',
      ].indexOf(x) === -1
  );

  const ret: Record<string, ReturnType<typeof getStatAggregateForPlayer>> = {};
  keys.filter(k => players.find(p => !!p[k])).forEach(k => (ret[k] = getStatAggregateForPlayer(k, players)));

  return sortBy(values(ret).filter(x => x.sum > 0), x => StatOrder[x.key] || '99' + x.key) as any;
}
