var http = require("http");
var dgram = require('dgram');
var mongoose = require('mongoose');
var net = require('net');
var express = require('express')
var app = express()

var timeoutMs = 1000;

var options = {
  host: 'qtracker.com',
  path: '/server_list_details.php?game=tribesvengeance'
};


var getServersFromMaster = function(callback){
	http.request(options, function(response) {
	  var str = '';

	  response.on('data', function (chunk) {
	    str += chunk;
	  });

	  response.on('end', function () {
		var text = str;
		var lines = text.split("\r\n");
		var items = lines.map(function(item){
			return item.split(":");
		});
		var filtered = items.filter(function(item){
			return item.length === 2;
		});
		callback(filtered);
	  });
	}).end();
}

function parseReponse(ip, port, message, ping){
	var items = message.split('\\');
	items.splice(0,1);
	var dict = {};
	var name = true;
	var lastName = "";

	items.forEach(function(item){
		if (name) lastName = item;
		else dict[lastName] = item;
		name = !name;
	});
	var data = {
		players : []
	};

	for(var n in dict){
		if(n.indexOf("_") !== -1){
			var splat = n.split("_");
			var itemName = splat[0];
			var index = splat[1];

			if(data.players[index] === undefined) data.players[index] = {};
			data.players[index][itemName] = dict[n];
		}
		else data[n] = dict[n];
	}

	data.ip = ip;
	data.ping = ping;

	handleData(data);
}

function talkToServer(ip, port){
	var message = new Buffer('\\basic\\');
	var client = dgram.createSocket('udp4');
	var timer = setTimeout(function(){
		closeAll();
		console.log('Timeout on ' + ip + ":" + port);

	}, timeoutMs);
	var start = new Date().getTime();

	client.on('listening', function () {
	    console.log('Listening on ' + ip + ":" + port);
	});

	client.on('message', function (message, remote) {
	    console.log("Response from",ip + ':' + port)
	    closeAll();
	    var end = new Date().getTime();
	    var time = end - start;
	    parseReponse(ip, port, message.toString('utf8'), time);
	});

	var closeAll = function(){
		clearTimeout(timer);
		client.close();
	};

	client.send(message, 0, message.length, port, ip);
	//client.bind(ip, port);
}

function handleData(data){
	//console.log(data);
	var id = data.ip+':'+data.hostport;
	Server.where({_id:id}).findOne(function(err, server){
		if(err) throw err;
		else if(server === null){
			server = new Server({ 
				_id: id,
				minutesonline: 0
			});
		}

		server.minutesonline ++;
		server.name = data.hostname;
		server.adminname = data.adminname;
		server.adminemail = data.adminemail;
		server.ip = data.ip;
		server.port = data.hostport;
		server.maxplayers = data.maxplayers;
		server.lastseen = Date.now();
		server.lastdata = data;
		server.players.push({
			time: Date.now(),
			numplayers: data.numplayers
		});

		data.players.forEach(timePlayer);

		server.save(function(err){
			if(err) throw err;
			else console.log("Saved", id);
		});
	});
}

function timePlayer(player){
	Player.where({_id:player.name}).findOne(function(err, pl){
		if(err)throw err;
		if(pl === null) return;

		pl.minutesonline++;
		pl.save(function(err){if(err)throw err;});
	});
}

function doAllTheWork(){
	getServersFromMaster(function(servers){
		servers.forEach(function(item){
			talkToServer(item[0], parseInt(item[1]));
		});
	});
}

mongoose.connect(process.env.dburl);

var Server = mongoose.model('Server', {
	_id: String,
	name: String,
	adminname: String,
	adminemail: String,
	ip: String,
	port: Number,
	minutesonline: Number,
	maxplayers: Number,
	lastseen: Date,
	players: [{
		time: Date,
		numplayers: Number
	}],
	lastdata: mongoose.Schema.Types.Mixed
});

var Player = mongoose.model('Player', {
	_id: String,
	ip: String,
	lastserver: String,
	score: Number,
	kills: Number,
	deaths: Number,
	offsense: Number,
	defense: Number,
	style: Number,
	lastseen: Date,
	minutesonline: Number,
	stats: mongoose.Schema.Types.Mixed
});

//setInterval(doAllTheWork, 60 * 1000);
//doAllTheWork();

/*var server = net.createServer(function(socket) {
	var data = '';
	var ip = socket.remoteAddress;

	socket.setEncoding('utf8');
	socket.on('data', function(chunk) {
	  data += chunk;
	});

	socket.on('end', function() {
		console.log("Received data from ", ip);
		console.log(data);
		var json = JSON.parse(data);
		var port = json.port;
		json.players.forEach(function(player){
			handlePlayer(player, ip, port);
		});
	});

	socket.write('Echo server\r\n');
});*/
 
function handlePlayer(input, ip, port){
	console.log(input);
	Player.where({_id:input.name}).findOne(function(err, player){
		if(err)throw err;
		if(player === null) player = new Player({
			_id:input.name,
			stats:{},
			score:0,
			kills:0,
			deaths:0,
			offense:0,
			defense:0,
			style:0,
			minutesonline:0
		});

		player.ip = input.ip,
		player.lastserver = ip + ":" + port;
		player.score += input.score;
		player.kills += input.kills;
		player.deaths += input.deaths;
		player.offense += input.offense;
		player.defense += input.defense;
		player.style += input.style;
		player.lastseen	 = Date.now();

		if(parseInt(input["StatClasses.StatHighestSpeed"]) > player.stats.StatHighestSpeed){
			player.stats.StatHighestSpeed = parseInt(input["StatClasses.StatHighestSpeed"]);
			player.markModified('stats');
		}

		for(var i in input){
			var value = input[i];
			console.log(i,value);
			if(value === 0) continue;
			if(i === "StatClasses.StatHighestSpeed") continue;
			console.log("test");
			if(i.indexOf('.') !== -1){
				console.log("test");
				var name = i.split('.')[1];
				if(player.stats[name] === undefined) player.stats[name] = 0;
				player.stats[name] += value;
				console.log("addded",name,value);
				player.markModified('stats');
			}
		}

		player.save(function(err){if(err)throw err;});
	});
}; 


// ----------------------------------------
// express
// ----------------------------------------

app.use (function(req, res, next) {
    var data='';
    req.setEncoding('utf8');
    req.on('data', function(chunk) { 
       data += chunk;
    });

    req.on('end', function() {
        req.body = data;
        next();
    });
});

app.get('/', function (req, res) {
  res.send('Hello World!')
})

app.post('/upload', function (req, res) {
  res.send('Hello World!')
  console.log("received upload request")
  console.log(req.body)
})

app.set('port', (process.env.PORT || 5000));
var server = app.listen(app.get('port'), function () {

  var host = server.address().address
  var port = server.address().port

  console.log('Example app listening at http://%s:%s', host, port)

})