const winston = require("winston");
const moment = require("moment");
const countryNames = require("./countrynames.json");
const timespan = require( "timespan");

function tryConvertIpv6ToIpv4(ip){
    var regex = /^::ffff:([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})$/;
    var matches = regex.exec(ip);
    
    if(matches && matches.length == 2){
        return matches[1];
    } else {
        return ip;
    }
}

function getNews() {
    winston.info("Resolving news");

    return new Promise(function (resolve, reject) {
        var deferred = q.defer();
        var client = github.client();
        var repo = client.repo('fireantik/Tribes-Revengeance-stats');
        
        repo.commits(function (error, commits) {
            if (error) {
                winston.error(error);

                return reject(new Error(error));
            } else {
                var data = [];

                for (var i in commits) {
                    var message = commits[i].commit.message;
                    var dateStr = commits[i].commit.author.date;
                    var url = commits[i].html_url;
                    var date = new Date(dateStr);

                    data.push({
                        message: message,
                        date: date,
                        url: url
                    });
                }

                winston.info("News resolved", news);

                return resolve(data);
            }
        });
    })
}

const tribes_news = getNews().catch(() => []);

function getClientIp(req) {
    var ipAddress;
    var forwardedIpsStr = req.header('x-forwarded-for');

    if (forwardedIpsStr) {
        var forwardedIps = forwardedIpsStr.split(',');
        ipAddress = forwardedIps[0];
    }

    if (!ipAddress) {
        ipAddress = req.connection.remoteAddress;
    }

    return tryConvertIpv6ToIpv4(ipAddress);
};

const handlebars_helpers = {
    json: function (context) { return JSON.stringify(context); },
    urlencode: function (context) { return encodeURIComponent(context); },
    showMinutes: function (context) {
        var span = new timespan.TimeSpan();
        span.addMinutes(parseInt(context));
        var str = "";
        if (span.days == 1) str += span.days + " day ";
        else if (span.days != 0) str += span.days + " days ";
        if (span.hours != 0) str += span.hours + " hours ";
        if (str != "") str += "and ";
        str += span.minutes + " minutes";
        return str;
    },
    showMoment: function (context) { return moment(context).fromNow(); },
    translateStatName: function (context) {
        var table = require(__dirname + "/statnames.json");
        for (var i in table) {
            if (context == i) return table[i];
        };
        return context;
    },
    killsperminute: function (context) {
        if(!context.kills && !context.deaths){
            return "";
        }

        return ((context.kills || 0) / (context.minutesonline || 1)).toFixed(2); 
    },
    inc: function (num) { return num + 1; },
    countryname: function (country, options) { return countryNames[country.toUpperCase()]; },
    condPrint: function (v1, v2, v3) {
        return (v1 == v2) ? v3 : "";
    },
    emptyIfZero: function (context, num) {
        if(context.kills || context.deaths) {
            return num || 0;
        }

        if(typeof(num) !== "number") {
            return num;
        }

        if(Math.abs(num) < 0.0001) {
            return "";
        }

        return num;
    }
};

module.exports = {
    handlebars_helpers,
    tribes_news,
    getClientIp,
    tryConvertIpv6ToIpv4
}