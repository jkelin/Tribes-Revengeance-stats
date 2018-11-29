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

function updateIcon(numPlayers) {
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

browser.browserAction.onClicked.addListener(() => {
    browser.tabs.create({
        active: true,
        url: 'https://stats.tribesrevengeance.net'
    })
});


var serverPlayerMap = {};

var socket = io("wss://stats.tribesrevengeance.net");

socket.on("connect", function () {
    console.info("Connected")
});

socket.on('player-count-change', function (data) {
    console.debug('player-count-change', data);
    serverPlayerMap[data.server] = data.players;
    var total = 0;

    for (var i in serverPlayerMap) {
        total += serverPlayerMap[i];
    }

    updateIcon(total);
});
