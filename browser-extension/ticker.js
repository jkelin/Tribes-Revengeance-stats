var isChrome = typeof chrome !== 'undefined';

var browser_action = isChrome ? chrome.browserAction : browser.browserAction;
var serverPlayerMap = {};

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

function updateIcon() {
    var numPlayers = 0;

    for (var i in serverPlayerMap) {
        numPlayers += serverPlayerMap[i];
    }

    if (browser_action.setBadgeTextColor) {
        browser_action.setBadgeTextColor({
            color: countToFgColor(numPlayers)
        });
    }

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
