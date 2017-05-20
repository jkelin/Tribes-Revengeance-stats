const winston = require("winston");

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

module.exports = {
    tribes_news,
    getClientIp,
    tryConvertIpv6ToIpv4
}
