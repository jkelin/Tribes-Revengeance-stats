const rp = require('request-promise');
const cheerio = require('cheerio');
const url = require('url');
const crypto = require('crypto');
const winston = require("winston");
const Events = require("events");

const {Server} = require('./db.js');

let emitter = new Events();

let chatCache = {};

function arraysMatch(a, b){
    if(a.length !== b.length) return false;

    for(let i in a) {
        if(a[i] !== b[i]) return false;
    }

    return true;
}

function findMaxMachingArrLen(a, b){
    let maxLen = 0;

    for(let i = 0; i < b.length; i++) {
        let len = i + 1;
        let sliceA = a.slice(-len);
        let sliceB = b.slice(0, len);

        if(arraysMatch(sliceA, sliceB)) {
            maxLen = len;
        }
    }

    return maxLen;
}

function newItems(oldArr, newArr, hasherOld, hasherNew) {
    let a = oldArr.map(hasherOld);
    let b = newArr.map(hasherNew);
    let len = findMaxMachingArrLen(a, b);
    return newArr.slice(len);
}

function hashStringIntoNumber(str){
    let buf = crypto.createHash('md5').update(str).digest();

    //return buf.readInt32LE(0);
    return buf.toString('hex').slice(0, 6);
}

function getServerChat(serverId, server, username, password) {
    let u = url.parse(server, true);
    u.auth = username + ":" + password;
    u.pathname = "/ServerAdmin/current_console_log";

    let options = {
        uri: u.format(),
        transform: function (body) {
            return cheerio.load(body);
        }
    };

    return rp(options)
    .then($ => {
        let contents = $("table tr:nth-child(2) td:nth-child(2)").contents();

        let messages = [];

        for(let i = 0; i < contents.length; i++){
            let x = contents[i];

            if(x.type !== "text" || !x.data || !x.data.trim()) continue;

            let groups = /^>( ([^:]{1,16}):)?(.*)$/.exec(x.data.trim());

            if(!groups || groups.length < 4) continue;

            messages.push({
               user: (groups[2] || "").trim() || "WebAdmin",
               message: (groups[3] || "").trim()
            });
        }

        return messages;
    })
    .then(m => {
        let cache = chatCache[serverId];
        if(!cache) cache = chatCache[serverId] = [];

        const hash = x => hashStringIntoNumber(x.user + x.message);

        let newMessages = newItems(cache, m, hash, hash);

        for(let i in newMessages){
            let msg = {
                when: new Date(),
                id: hashStringIntoNumber("" + Date.now() + i),
                user: newMessages[i].user,
                message: newMessages[i].message
            };

            cache.push(msg);
            emitter.emit(serverId, { type: "message", data: msg });
        }

        return cache;
    });
}


setInterval(() => {
    Server.where({ chat: {$exists: true} }).find(function (err, servers) {
        if (err) throw err;

        servers.forEach(server => {
            getServerChat(server._id, server.chat.server, server.chat.username, server.chat.password)
            .then(x => {
                if(!server.chat.ok){
                    server.chat.ok = true;
                    server.save();
                }

                winston.debug("Got server chat from", {id: server._id});
            })
            .catch(x => {
                winston.error(x);

                if(server.chat.ok){
                    server.chat.ok = false;
                    server.save();
                }
            });
        })
    });
}, 1000);

function getChatFor(server) {
    return (chatCache[server] || []).filter(x => x.when.getTime() > Date.now() - 3600 * 1000);
}

module.exports = {
    getChatFor,
    emitter
}
