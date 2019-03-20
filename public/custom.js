(function scrollChat() {
  window.addEventListener('load', function() {
    var chat = document.getElementById('chat-container');
    if (chat) {
      chat.scrollTop = chat.scrollHeight;
    }
  });
})();

function requires(scriptNames, cb) {
  var loaded = scriptNames
    .filter(function(n) {
      return window._scripts[n];
    })
    .reduce(function(a) {
      return a + 1;
    }, 0);
  scriptNames.forEach(function(name) {
    document.getElementById('script-' + name).addEventListener('load', function() {
      loaded++;
      if (loaded === scriptNames.length) {
        cb();
      }
    });
  });

  if (loaded === scriptNames.length) {
    cb();
  }
}

// Notifications
requires([], function() {
  function notify(what, body) {
    console.log('notify', what);
    Notification.requestPermission().then(function(permission) {
      if (permission === 'granted') {
        var notification = new Notification(what, {
          icon: '/static/favicon.ico',
          body: body,
          requireInteraction: false,
        });
        setTimeout(notification.close.bind(notification), 3 * 1000);
      }
    });
  }

  window.testTribesNotification = function() {
    notify('Hello world!');
  };

  window.startTribesNotifications = function() {
    var msgArr = [];
    var lastMsg = Date.now();

    var ws = new ReconnectingWebSocket('ws://' + location.host + '/');

    ws.onmessage = function(msg) {
      if (msg.data == 'PING') return console.info('PING!');
      var data = JSON.parse(msg.data);

      if (data.type != 'join') return;
      msgArr.push(data);

      if (lastMsg + 500 >= Date.now()) return;

      var what =
        msgArr
          .map(function(x) {
            return x.player;
          })
          .join(', ') +
        ' joined ' +
        msgArr[0].serverName;
      notify(what);

      lastMsg = Date.now();
      msgArr = [];
    };
  };
});

// Clickable rows
requires([], function() {
  window.addEventListener('load', function() {
    Array.prototype.forEach.call(document.getElementsByClassName('clickable-row'), function(x) {
      x.addEventListener('click', function() {
        window.location = x.dataset.href;
      });
    });
  });
});

// GA
requires([], function() {
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    dataLayer.push(arguments);
  }
  gtag('js', new Date());

  gtag('config', 'UA-60631405-1');
});

// Navbar handling
requires([], function() {
  // Navbar and dropdowns
  var toggle = document.getElementsByClassName('navbar-toggle')[0],
    collapse = document.getElementsByClassName('navbar-collapse')[0],
    dropdowns = document.getElementsByClassName('dropdown');

  // Toggle if navbar menu is open or closed
  function toggleMenu() {
    collapse.classList.toggle('collapse');
    collapse.classList.toggle('in');
  }

  // Close all dropdown menus
  function closeMenus() {
    for (var j = 0; j < dropdowns.length; j++) {
      dropdowns[j].getElementsByClassName('dropdown-toggle')[0].classList.remove('dropdown-open');
      dropdowns[j].classList.remove('open');
    }
  }

  // Add click handling to dropdowns
  for (var i = 0; i < dropdowns.length; i++) {
    dropdowns[i].addEventListener('click', function() {
      if (document.body.clientWidth < 768) {
        var open = this.classList.contains('open');
        closeMenus();
        if (!open) {
          this.getElementsByClassName('dropdown-toggle')[0].classList.toggle('dropdown-open');
          this.classList.toggle('open');
        }
      }
    });
  }

  // Close dropdowns when screen becomes big enough to switch to open by hover
  function closeMenusOnResize() {
    if (document.body.clientWidth >= 768) {
      closeMenus();
      collapse.classList.add('collapse');
      collapse.classList.remove('in');
    }
  }

  // Event listeners
  window.addEventListener('resize', closeMenusOnResize, false);
  toggle.addEventListener('click', toggleMenu, false);
});

// Timechart
requires(['tc'], function() {
  var chartElem = document.getElementById('chartdata');

  if (chartElem) {
    var dataSpan = JSON.parse(chartElem.innerHTML);
    var chartData = [];
    for (var i in dataSpan) {
      var date = new Date(parseInt(i));
      //var formated = date.getMonth()+"-"+date.getDate()+" "+date.getHours()+":"+date.getSeconds();
      chartData.push({ date: date, players: dataSpan[i] });
    }

    document.TC = new Timechart(
      {
        id: 'chart_div',
        zoom: 'd',
        datefield: 'date',
        datafields: ['players'],
        dateformat: 'yyyy-mm-dd h:i',
      },
      chartData
    );
  }
});

// Chat
requires(['zepto', 'socketio'], function() {
  var chatElem = document.getElementById('chatdata');

  if (chatElem) {
    const serverId = JSON.parse(document.getElementById('serverid').innerHTML);

    var isActive;

    window.onfocus = function() {
      isActive = true;
    };

    window.onblur = function() {
      isActive = false;
    };

    var socket = io();
    socket.on('connect', function() {
      setLoading(false);
    });

    socket.on('chat-message', function(data) {
      if (!data || data.server !== serverId) return;

      var shouldScroll = container[0].scrollHeight == container[0].clientHeight + container[0].scrollTop;

      var html =
        '<div class="chat-item">' +
        '<span class="chat-user">' +
        data.user +
        ':</span>' +
        '<span class="chat-message">' +
        data.messageFriendly +
        '</span>' +
        '</div>';

      setLoading(false);

      if (!isActive && $('#notif')[0].checked && !data.messageFriendly.contains('QuickChat')) {
        notify(data.messageFriendly, 'Said ' + data.user);
      }

      container.append(html);

      if (shouldScroll) {
        container.scrollTop(container[0].scrollHeight);
      }
    });

    var container = $('#chat-container');

    $('#usr').val(localStorage.getItem('name') || '');
    $('#usr').keyup(function() {
      localStorage.setItem('name', $(this).val());
    });

    $('#notif')[0].checked = JSON.parse(localStorage.getItem('notify') || 'false');
    $('#notif').click(function() {
      localStorage.setItem('notify', $(this)[0].checked);
    });

    function setLoading(isLoading) {
      if (isLoading) {
        $('#snd').text($('#snd').attr('data-loading-text'));
        $('#snd').addClass('disabled');
        $('#snd').attr('disabled', true);
      } else {
        $('#snd').text('Send');
        $('#snd').removeClass('disabled');
        $('#snd').removeAttr('disabled');
      }
    }

    container.scrollTop(container[0].scrollHeight);

    $('#chat-form').on('submit', function(e) {
      e.preventDefault();

      var usr = $('#usr').val();
      var msg = $('#msg').val();

      $('#msg').val('');
      setLoading(true);

      socket.emit('say', { server: serverId, usr: usr, message: msg });
    });
  }
});
