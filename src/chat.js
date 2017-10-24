const rp = require('request-promise');
const cheerio = require('cheerio');
const url = require('url');
const crypto = require('crypto');
const winston = require("winston");
const encoding = require("encoding");
const Rx = require("rxjs/Rx");

require("rxjs/operator/debounceTime");

const {Server} = require('./db.js');
const QcMappings = require('./qcmappings.json');
const Events = require("./events.js");


let chatCache = {};
let activeChatRequests = {};

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

function makeMessageFromRaw(message){
    let matches = /\((QuickChat|TeamQuickChat)\) ([A-Za-z_0-9]+)\?/g.exec(message);

    if(matches && matches.length > 2) {
        if(QcMappings[matches[2]]){
            return `(${matches[1]}) ${QcMappings[matches[2]]}`;
        }

        return message;
    } else {
        return message;
    }
}

function getServerChat(serverId, server, username, password) {
    let u = url.parse(server, true);
    u.auth = username + ":" + password;
    u.pathname = "/ServerAdmin/current_console_log";

    let options = {
        uri: u.format(),
        encoding: "binary",
        transform: function (body) {
            return cheerio.load(encoding.convert(body, "utf-8", "iso-8859-1").toString());
        }
    };

    return rp(options)
    .then($ => {
        let contents = $("table tr:nth-child(2) td:nth-child(2)").contents();

        let messages = [];

        for(let i = 0; i < contents.length; i++){
            let x = contents[i];

            if(x.type !== "text" || !x.data || !x.data.trim()) continue;

            let groups = /^>( ([^:]{1,29}):)?(.*)$/.exec(x.data.trim());

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
                message: newMessages[i].message,
                messageFriendly: makeMessageFromRaw(newMessages[i].message),
                server: serverId
            };

            cache.push(msg);
            Events.next({ type: "chat-message", data: msg });
        }

        return cache;
    });
}

setInterval(() => {
    Server.where({ chat: {$exists: true} }).find(function (err, servers) {
        if (err) throw err;

        servers.forEach(server => {
            if(activeChatRequests[server._id]) return;

            activeChatRequests[server._id] = getServerChat(server._id, server.chat.server, server.chat.username, server.chat.password)
            .then(x => {
                server.chat.ok = true;
                server.save();

                winston.debug("Got server chat from", {id: server._id});
                delete activeChatRequests[server._id];
            })
            .catch(x => {
                winston.error("Error getting chat from " + server._id, x);

                server.chat.ok = false;
                server.save();
                delete activeChatRequests[server._id];
            });
        })
    });
}, 1000);

function getChatFor(server) {
    return (chatCache[server] || []).filter(x => x.when.getTime() > Date.now() - 3600 * 1000);
}

function serverFromId(id){
    return Rx.Observable.fromPromise(Server.findById(id).exec());
}

let sayMessages$ = Events
    .filter(x => x.type == "say")
    .flatMap(m => 
        serverFromId(m.data.server)
        .map(s => ({user: m.data.usr, message: m.data.message, server: s.chat.server, username: s.chat.username, password: s.chat.password}))
    )
    .publish()
    .refCount();

sayMessages$
    .debounce(() => Rx.Observable.interval(500))
    .flatMap(({user, message, server, username, password}) => {
        let u = url.parse(server, true);
        u.auth = username + ":" + password;
        u.pathname = "/ServerAdmin/current_console";

        let options = {
            uri: u.format(),
            method: "POST",
            form: {
                SendText: `say ${user}: ${message}`,
                Send: "Send"
            }
        };

        return Rx.Observable.fromPromise(rp(options));
    })
    .subscribe();

module.exports = {
    getChatFor
}
