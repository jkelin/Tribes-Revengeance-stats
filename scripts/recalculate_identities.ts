import { flatMap, groupBy, mapValues, Dictionary, pickBy, keys, values } from "lodash";
import fs from 'fs-extra';

require('dotenv').config()

const db = require('../src/db');
const helpers = require('../src/helpers');

interface Identity {
    ips: string[];
    names: string[];
}

interface IdentityFrequency {
    ips: Dictionary<number>;
    names: Dictionary<number>;
}

const nicknameBlacklist = ['newblood', ''];

function addNameIpToIdentities(identities: Identity[], name: string, ip: string) {
    // console.debug('addNameIpToIdentities', name, ip);

    let added = false;
    for (const identity of identities) {
        if (identity.names.includes(name)) {
            if (!identity.ips.includes(ip)){
                identity.ips.push(ip)
                added = true;
            }
        }

        if (identity.ips.includes(ip)) {
            if (!identity.names.includes(name)){
                identity.names.push(name)
                added = true;
            }
        }
    }

    if (!added) {
        identities.push({
            ips: [ip],
            names: [name]
        })
    }
}

function consolidateIdentities(identities: Identity[]) {
    for (const identity of identities) {
        const match = identities.find(x => 
            x !== identity && (
                !!x.ips.find(y => identity.ips.includes(y)) ||
                !!x.names.find(y => identity.names.includes(y))
            )
        )

        if (!match) {
            continue;
        }

        // console.debug('consolidateIdentities found match', identity, match);

        match.names.filter(x => !identity.names.includes(x)).forEach(x => identity.names.push(x));
        match.ips.filter(x => !identity.ips.includes(x)).forEach(x => identity.ips.push(x));

        const matchIndex = identities.indexOf(match);
        identities.splice(matchIndex, 1);

        return true;
    }

    return false;
}

function expandIdentities(identities: Identity[], nameCounts: Dictionary<Dictionary<number>>, ipCounts: Dictionary<Dictionary<number>>) {
    const singleIpUsers = pickBy(nameCounts, x => keys(x).length === 1);
    for (const name in singleIpUsers) {
        keys(singleIpUsers[name]).forEach(ip => addNameIpToIdentities(identities, name, ip));
    }

    const ipsOfSingleUsers = pickBy(ipCounts, x => keys(x).length === 1);
    for (const ip in singleIpUsers) {
        keys(ipsOfSingleUsers[ip]).forEach(name => addNameIpToIdentities(identities, name, ip));
    }

    const namesMoreThanNMatches = pickBy(mapValues(nameCounts, x => pickBy(x, y => y > 10)), x => x && values(x).length > 0);
    for (const name in namesMoreThanNMatches) {
        keys(namesMoreThanNMatches[name]).forEach(ip => addNameIpToIdentities(identities, name, ip));
    }

    const ipsMoreThanNMatches = pickBy(mapValues(ipCounts, x => pickBy(x, y => y > 10)), x => x && values(x).length > 0);
    for (const ip in ipsMoreThanNMatches) {
        keys(ipsMoreThanNMatches[ip]).forEach(name => addNameIpToIdentities(identities, name, ip));
    }

    // This does not seem to work
    // const uniqueNamesOfIps = pickBy(mapValues(ipCounts, (ncounts, ip) => pickBy(ncounts, (count, name) => values(nameCounts[name]).length === 1)), x => x && values(x).length > 0);
    // for (const ip in uniqueNamesOfIps) {
    //     keys(uniqueNamesOfIps[ip]).forEach(name => addNameIpToIdentities(identities, name, ip));
    // }

    while (consolidateIdentities(identities));
}

async function main() {
    console.info('Downloading data');
    const data: { fullReport?: { players?: { name: string, ip: string }[] } }[] = await db.Match
        .find({}, { 'fullReport.players.name': true, 'fullReport.players.ip': true })
        // .limit(1000);
    console.info('Generting graph');

    const matchPlayers = flatMap(data
        .filter(x => x.fullReport && x.fullReport.players && x.fullReport.players.length)
        .map(x => x.fullReport.players)
    )
    .map(x => ({ 
        ip: x.ip.split(':')[0],
        name: helpers.cleanPlayerName(x.name) 
    }))
    .filter(x => !nicknameBlacklist.includes(x.name));

    const groupByName = groupBy(
        matchPlayers,
        (x: {ip: string, name: string}) => x.name
    );

    const groupByIp = groupBy(
        matchPlayers,
        (x: {ip: string, name: string}) => x.ip
    );

    const groupByNameThenIp = mapValues(
        groupByName,
        group => groupBy(group, (x: {ip: string, name: string}) => x.ip)
    );

    const groupByIpThenName = mapValues(
        groupByIp,
        group => groupBy(group, (x: {ip: string, name: string}) => x.name)
    );

    const nameCounts = mapValues(groupByNameThenIp, x => mapValues(x, y => y.length));
    const ipCounts = mapValues(groupByIpThenName, x => mapValues(x, y => y.length));

    await fs.writeJSON('ipcounts.json', ipCounts, { spaces: 2 });

    const identities: Identity[] = [];

    for (let i = 0; i < 2; i++) {
        expandIdentities(identities, nameCounts, ipCounts);
    }

    const frequencies: IdentityFrequency[] = identities.map(identity => {
        const ips: Dictionary<number> = {};
        const names: Dictionary<number> = {};

        identity.ips.forEach(ip => ips[ip] = matchPlayers.filter(x => x.ip === ip).length);
        identity.names.forEach(name => names[name] = matchPlayers.filter(x => x.name === name).length);

        return {
            ips,
            names
        }
    })

    const docs = frequencies.map(f => new db.Identity({
        ips: f.ips,
        names: f.names
    }));

    console.info('Removing old identities');
    await db.Identity.remove();
    console.info('Inserting new identities');
    await db.Identity.collection.insert(docs);
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
