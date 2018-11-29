var serverPlayerMap = {};

function countToFgColor(cnt) {
    if (cnt < 4) {
        return "white";
    }

    if (cnt < 8) {
        return "black";
    }

    return "white";
}

function countToBgColor(cnt) {
    if (cnt < 4) {
        return "grey";
    }

    if (cnt < 8) {
        return "orange";
    }

    return "red";
}

function updateIcon() {
    var numPlayers = 0;

    for (var i in serverPlayerMap) {
        numPlayers += serverPlayerMap[i];
    }

    browser.browserAction.setBadgeTextColor({
        color: countToFgColor(numPlayers)
    });

    browser.browserAction.setBadgeBackgroundColor({
        color: countToBgColor(numPlayers)
    });

    browser.browserAction.setBadgeText({
        text: numPlayers === 0 ? null : numPlayers + ''
    });
}

function addListeners() {
    browser.browserAction.onClicked.addListener(() => {
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
        serverPlayerMap[data.server] = data.players;
        updateIcon();
    });
}

function manualUpdate() {
    axios.get('https://stats.tribesrevengeance.net/servers.players.json').then(response => {
        console.debug('Manual update', response);
        serverPlayerMap = {};
        response.data.forEach(x => {
            serverPlayerMap[x.id] = x.players.length
        });

        updateIcon();
    });
}

addListeners();
manualUpdate();
initSocketIo();

setInterval(manualUpdate, 60 * 1000);
