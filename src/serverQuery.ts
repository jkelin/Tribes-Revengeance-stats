import http from "http";
import dgram from "dgram";
import net from "net";
import winston from "winston";

const timeoutMs = 1000;

export function getTribesServersFromMasterServer(callback) {
    let options = {
        host: 'qtracker.com',
        path: '/server_list_details.php?game=tribesvengeance'
    };

    http.request(options, function (response) {
        var str = '';

        response.on('data', function (chunk) {
            str += chunk;
        });

        response.on('end', function () {
            var text = str;
            var lines = text.split("\r\n");
            var items = lines.map(function (item) {
                return item.split(":");
            });

            var filtered = items.filter(function (item) {
                return item.length === 2;
            });

            callback(filtered);
        });
    }).end();
}

export function parseTribesServerQueryReponse(ip, port, message, ping) {
    var items = message.split('\\');
    items.splice(0, 1);
    var dict = {};
    var name = true;
    var lastName = "";

    items.forEach(function (item) {
        if (name) lastName = item;
        else dict[lastName] = item;
        name = !name;
    });
    
    var data: any = {
        players: []
    };

    for (var n in dict) {
        if (n.indexOf("_") !== -1) {
            var splat = n.split("_");
            var itemName = splat[0];
            var index = splat[1];

            if (data.players[index] === undefined) data.players[index] = {};
            data.players[index][itemName] = dict[n];
        }
        else data[n] = dict[n];
    }

    data.ip = ip;
    data.ping = ping;

    return data;
}

export function queryTribesServer(ip, port, callback) {
    var message = new Buffer('\\basic\\');
    var client = dgram.createSocket('udp4');
    var timer = setTimeout(function () {
        closeAll();
        winston.info('Timeout on ' + ip + ":" + port);

    }, timeoutMs);

    var start = new Date().getTime();

    client.on('listening', function () {
        //console.log('Listening on ' + ip + ":" + port);
    });

    client.on('message', function (message, remote) {
        //console.log("Response from",ip + ':' + port)
        closeAll();
        var end = new Date().getTime();
        var time = end - start;
        let parsed = parseTribesServerQueryReponse(ip, port, message.toString('utf8'), time);
        callback(parsed);
    });

    var closeAll = function () {
        clearTimeout(timer);
        client.close();
    };

    client.send(message, 0, message.length, port, ip);
    //client.bind(ip, port);
}
