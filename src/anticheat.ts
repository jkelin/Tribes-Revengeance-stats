import { IUploadedPlayer, IUploadedData } from "./types";
import { mean, min, max, mapValues, values, sum, mapKeys, Dictionary } from "lodash";
import _ from "lodash";

export function isValidPreprocess(player: IUploadedPlayer, data: IUploadedData) {
    const trackedStats = {
        score: player.score,
        kills: player.kills,
        deaths: player.deaths,
        offense: player.offense,
        defense: player.defense,
        style: player.style,
    }

    const averages = mapValues(trackedStats, (value, key) => mean(data.players.map(x => x[key])));
    const averageDistances = mapValues(trackedStats, (value, key) => Math.abs(averages[key] - player[key]));

    // Following can be useful for manual analysis

    // const avgAvgDist = mean(values(averageDistances));
    // const minAvgDist = min(values(averageDistances));
    // const maxAvgDist = max(values(averageDistances));
    // const totalAvgDist = sum(values(averageDistances));

    // const finalObj = {
    //     ...trackedStats,
    //     ...(mapKeys(averages, (value, key) => 'avg_' + key)),
    //     ...(mapKeys(averageDistances, (value, key) => 'avgDist_' + key)),
    //     avgAvgDist,
    //     minAvgDist,
    //     maxAvgDist,
    //     totalAvgDist
    // }

    // return finalObj;

    return averageDistances;
}

/**
 * Basic anticheat
 * 
 * This could be improved by grouping the stats by player count and using current player count to judge
 */
export function isValid(player: IUploadedPlayer, data: IUploadedData) {
    const preprocessed = isValidPreprocess(player, data);
    const stats: Dictionary<{max: number, avg: number, median: number, p90: number, p95: number, p99: number}> = require('./anticheat-stats.json');

    const difference = _(preprocessed)
        .mapValues((value, key) => Math.max(0, value - stats[key].p95)) // absolute differences
        .mapValues((diff, key) => diff / stats[key].p95) // percentage differences
        .values() // percentages
        .sum();

    const tolerance = Math.max(0, data.players.length - 4) * 0.025; // 2.5% per player in games with more than 4 players

    if (difference < tolerance) {
        return true;
    } else {
        console.log("Cheater detected", player.name, data);
        return false;
    }
}
