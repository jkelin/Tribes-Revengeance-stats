var isChrome = typeof chrome !== 'undefined';

var browser_action = isChrome ? chrome.browserAction : browser.browserAction;
var browser_tabs = isChrome ? chrome.tabs : browser.tabs;
var browser_idle = isChrome ? chrome.idle : browser.idle;

function countToFgColor(cnt) {
  if (cnt < 4) {
    return '#fff';
  }

  if (cnt < 8) {
    return '#000';
  }

  return '#fff';
}

function countToBgColor(cnt) {
  if (cnt < 4) {
    return '#aaa';
  }

  if (cnt < 8) {
    return '#FFA500';
  }

  return '#B22222';
}

function calculatePlayerList(lastFullResponse) {
  var str = '';

  for (var server of lastFullResponse) {
    if (server.players.length) {
      str += server.name + (server.players.length > 0 ? ` (${server.players.length})` : '') + '\n';
    }

    for (var player of server.players) {
      str += '  ' + player.player + '\n';
    }
  }

  return str;
}

function updateIcon(lastFullResponse) {
  var numPlayers = 0;

  for (var i in lastFullResponse) {
    numPlayers += lastFullResponse[i].players.length;
  }

  if (browser_action.setBadgeTextColor) {
    browser_action.setBadgeTextColor({
      color: countToFgColor(numPlayers),
    });
  }

  browser_action.setTitle({
    title: numPlayers ? calculatePlayerList(lastFullResponse) : 'Servers are empty',
  });

  browser_action.setBadgeBackgroundColor({
    color: countToBgColor(numPlayers),
  });

  browser_action.setBadgeText({
    text: numPlayers === 0 ? null : numPlayers + '',
  });
}

function addListeners() {
  browser_action.onClicked.addListener(() => {
    browser_tabs.create({
      active: true,
      url: 'https://stats.tribesrevengeance.net',
    });
  });
}

function initSocketIo() {
  var socket = io('https://stats.tribesrevengeance.net/');

  socket.on('connect', function () {
    console.info('Connected');
    socket.emit('get-player-count');
  });

  socket.on('full-player-count', function (data) {
    console.debug('full-player-count', data);
    updateIcon(data);
  });

  socket.on('reconnect', () => {
    console.info('Reconnected');
    socket.emit('get-player-count');
  });

  browser_idle.onStateChanged.addListener(() => {
    console.info('Idle state changed');
    socket.emit('get-player-count');
  });
}

addListeners();
initSocketIo();
