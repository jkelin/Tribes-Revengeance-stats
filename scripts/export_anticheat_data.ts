import fs from 'fs-extra';
import { isValidPreprocess } from '../src/anticheat';
import { flatMap, max, mean, keys, sortBy, range } from 'lodash';

require('dotenv').config()

const db = require('../src/db');

function median(values) {
    values = values.slice(0).sort( function(a, b) {return a - b; } );

    return middle(values);
}

function middle(values) {
    var len = values.length;
    var half = Math.floor(len / 2);

    if(len % 2)
        return (values[half - 1] + values[half]) / 2.0;
    else
        return values[half];
}

function percentile(arr, p) {
    if (arr.length === 0) return 0;
    if (typeof p !== 'number') throw new TypeError('p must be a number');
    if (p <= 0) return arr[0];
    if (p >= 1) return arr[arr.length - 1];
    
    arr.sort(function (a, b) { return a - b; });
    var index = (arr.length - 1) * p,
        lower = Math.floor(index),
        upper = lower + 1,
        weight = index % 1;
    
    if (upper >= arr.length) return arr[lower];
    return arr[lower] * (1 - weight) + arr[upper] * weight;
}

const percentileOfScore = (array, value) => {
    const originalLength = array.length;
    const a = [...array];
    let alen;
    const equalsValue = v => v === value;

    if (!array.some(equalsValue)) {
        a.push(value);
        alen = range(a.length)
    } else {
        alen = range(a.length + 1)
    }
    const idx = array.map(equalsValue);
    const alenTrue = alen.filter((v) => idx[alen.indexOf(v)]);
    const meanVal = mean(alenTrue);
    const percent = meanVal / originalLength;
    return Math.round( percent * 100) / 100;
};

function Quartile(data, q) {
    data=sortBy(data, x => x);
    var pos = ((data.length) - 1) * q;
    var base = Math.floor(pos);
    var rest = pos - base;
    if( (data[base+1]!==undefined) ) {
      return data[base] + rest * (data[base+1] - data[base]);
    } else {
      return data[base];
    }
  }

async function exportToFile(data: any[], filename: string) {
    const preprocessed = flatMap(
        data.map(x => x.players.map(p => isValidPreprocess(p, x)))
    );

    // await fs.writeFile(filename, JSON.stringify(preprocessed, null, 2));

    const summary: any = {};

    for (const key in preprocessed[0]) {
        const values = sortBy(preprocessed.map(x => x[key]), x => x);

        summary[key] = {
            max: max(values),
            avg: mean(values),
            median: median(values),
            // p90: percentileOfScore(values, values[Math.floor(values.length * 0.9)]),
            // p95: percentileOfScore(values, values[Math.floor(values.length * 0.95)]),
            // p99: percentileOfScore(values, values[Math.floor(values.length * 0.99)]),
            p90: percentile(values, 0.9),
            p95: percentile(values, 0.95),
            p99: percentile(values, 0.99),
        };
    }

    // console.warn('written', filename);
    console.warn(JSON.stringify(summary, null ,2));
}

async function main() {
    console.info('Downloading data');
    const data: any[] = (await db.Match
        .find({}, { 'fullReport': true }))
        .filter(x => x.fullReport && Array.isArray(x.fullReport.players) && x.fullReport.players.length > 0)
        .map(x => x.fullReport);

    await exportToFile(data, 'data/anticheat.good.json');
}

main()
.then(() => {
    console.info('All done');
    process.exit(0);
})
.catch(ex => {
    console.error("Fatal in main");
    console.error(ex);
    process.exit(1);
});
