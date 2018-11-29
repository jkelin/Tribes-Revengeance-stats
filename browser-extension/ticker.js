var isChrome = typeof chrome !== 'undefined';

var browser_action = isChrome ? chrome.browserAction : browser.browserAction;
var serverPlayerCountMap = {};
var lastFullResponse = [];

function countToFgColor(cnt) {
    if (cnt < 4) {
        return "#fff";
    }

    if (cnt < 8) {
        return "#000";
    }

    return "#fff";
}

function countToBgColor(cnt) {
    if (cnt < 4) {
        return "#aaa";
    }

    if (cnt < 8) {
        return "#FFA500";
    }

    return "#B22222";
}

function calculatePlayerList() {
    if (_(serverPlayerCountMap).values().sum()) {
        var str = "";

        for (var server of _.sortBy(lastFullResponse, x => x.name)) {
            if (server.players.length) {
                str += server.name + (server.players.length > 0 ? ` (${server.players.length})` : '') + "\n";
            }

            for (var player of server.players) {
                str += "  " + player.player + "\n";
            }
        }

        return str;
    } else {
        return "Servers are empty";
    }
}

function updateIcon() {
    var numPlayers = 0;

    for (var i in serverPlayerCountMap) {
        numPlayers += serverPlayerCountMap[i];
    }

    if (browser_action.setBadgeTextColor) {
        browser_action.setBadgeTextColor({
            color: countToFgColor(numPlayers)
        });
    }

    browser_action.setTitle({
        title: calculatePlayerList()
    });

    browser_action.setBadgeBackgroundColor({
        color: countToBgColor(numPlayers)
    });

    browser_action.setBadgeText({
        text: numPlayers === 0 ? null : numPlayers + ''
    });
}

function addListeners() {
    browser_action.onClicked.addListener(() => {
        browser.tabs.create({
            active: true,
            url: 'https://stats.tribesrevengeance.net'
        })
    });
}

function initSocketIo() {
    var socket = io("https://stats.tribesrevengeance.net/");

    socket.on("connect", function () {
        console.info("Connected")
    });

    socket.on('player-count-change', function (data) {
        console.debug('player-count-change', data);
        serverPlayerCountMap[data.server] = data.players;
        updateIcon();
        manualUpdate();
    });
}

function manualUpdate() {
    return axios.get('https://stats.tribesrevengeance.net/servers.players.json').then(response => {
        console.debug('Manual update', response);
        serverPlayerCountMap = {};
        lastFullResponse = response.data;
        response.data.forEach(x => {
            serverPlayerCountMap[x.id] = x.players.length
        });

        updateIcon();
    });
}

addListeners();
manualUpdate();
initSocketIo();

setInterval(manualUpdate, 10 * 60 * 1000);
