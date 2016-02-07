var http = require("http");
var dgram = require('dgram');
var mongoose = require('mongoose');
var net = require('net');
var express = require('express');
var app = express();
var expressWs = require('express-ws')(app);
var atob = require('atob');
var exphbs  = require('express-handlebars');
var url = require('url');
var moment = require('moment');
var q = require('q');
var timespan = require('timespan');
var freegeoip = require('node-freegeoip');
var Cacher = require("cacher");
var cacher = new Cacher();
var github = require('octonode');
var underscore = require('underscore');
var compression = require('compression');
var emitter = new (require('events'));
//var mongooseCachebox = require("mongoose-cachebox");

var countryNames = require("./countrynames.json");

var tribes_news = [];

var timeoutMs = 1000;

var options = {
  host: 'qtracker.com',
  path: '/server_list_details.php?game=tribesvengeance'
};

var NodeCache = require( "node-cache" );
var myCache = new NodeCache();

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
	    //console.log('Listening on ' + ip + ":" + port);
	});

	client.on('message', function (message, remote) {
	    //console.log("Response from",ip + ':' + port)
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

		server.name = data.hostname;
		server.adminname = data.adminname;
		server.adminemail = data.adminemail;
		server.ip = data.ip;
		server.port = data.hostport;
		server.maxplayers = data.maxplayers;
		server.lastseen = Date.now();

		if(!server.lastTiming || server.lastTiming + 60 * 1000 <= Date.now()) {
			server.minutesonline++;
			server.lastTiming = Date.now();
			console.log("timing server", server.name);
		}

		data.players
		.forEach(function(player){
			var wasbefore = server.lastdata.players.some(function(p){return p.player == player.player});
			if(!wasbefore) emitter.emit("join", {server: server, player: player});
		});

		if(server.lastdata && server.lastdata.players){
			server.lastdata.players
			.forEach(function(player){
				var hasLeft = data.players.some(function(p){return p.player == player.player});
				if(!hasLeft) emitter.emit("left", {server: server, player: player});
			});
		}

		server.lastdata = data;

		pushPlayersTrackings(id, data);

		data.players.forEach(timePlayer);

		if(server.country == undefined){
			freegeoip.getLocation(server.ip, function(err, location) {
				server.country = location["country_code"].toLowerCase();
		  		server.save(function(err){
					if(err) throw err;
					else {
						//console.log("Saved", id);
					}
				});
			});
		}
		else {
			server.save(function(err){
				if(err) throw err;
				else {
					//console.log("Saved", id);
				}
			});
		}
	});
}

var lastTrackings = {};
function pushPlayersTrackings(serverIdIn, data){
	if(!lastTrackings[serverIdIn]) lastTrackings[serverIdIn] = 0;
	if(lastTrackings[serverIdIn] + 60 * 1000 >= Date.now()) return;
	lastTrackings[serverIdIn] = Date.now();

	var track = new ServerTrack({
		serverId: serverIdIn,
		time: Date.now(),
		numplayers: data.numplayers
	});

	track.save(function(err){if(err)throw err;});
}

function timePlayer(player){
	Player.where({_id:player.player}).findOne(function(err, pl){
		if(err)throw err;
		if(pl === null) return;

		if(!pl.lastTiming || pl.lastTiming + 60 * 1000 >= Date.now()){
			pl.minutesonline++;
			pl.lastTiming = Date.now();
			console.log("timing player", player.player);
		}
		pl.lastseen = Date.now();
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



var Server = mongoose.model('Server', {
	_id: String,
	name: String,
	adminname: String,
	adminemail: String,
	country: String,
	ip: String,
	port: Number,
	minutesonline: Number,
	maxplayers: Number,
	lastseen: Date,
	lastTiming: Date,
	lastfullreport: Date,
	lastdata: mongoose.Schema.Types.Mixed
});

var Player = mongoose.model('Player', {
	_id: String,
	ip: String,
	lastserver: String,
	score: Number,
	kills: Number,
	deaths: Number,
	offense: Number,
	defense: Number,
	style: Number,
	lastTiming: Date,
	lastseen: Date,
	minutesonline: Number,
	stats: mongoose.Schema.Types.Mixed
});

var ServerTrack = mongoose.model('ServerTrack', {
	serverId: String,
	time: Date,
	numplayers: Number
});



setInterval(doAllTheWork, 5 * 1000);
doAllTheWork();
 
function handlePlayer(input, ip, port){
	console.log(input);
	Player.where({_id:input.name}).findOne(function(err, player){
		if(err)throw err;
		var changeCountry = false;
		if(player === null) {
			player = new Player({
				_id:input.name,
				stats:{},
				score:0,
				kills:0,
				deaths:0,
				offense:0,
				defense:0,
				style:0,
				minutesonline:20
			});
		}

		if(player.offense == undefined) player.offense = 0;

		player.ip = input.ip;
		player.lastserver = ip + ":" + port;
		player.score += input.score;
		player.kills += input.kills;
		player.deaths += input.deaths;
		player.offense += input.offense;
		player.defense += input.defense;
		player.style += input.style;
		player.lastseen	 = Date.now();

		if(player.stats.StatHighestSpeed == undefined) player.stats.StatHighestSpeed = 0;

		var highestSpeed = input["StatClasses.StatHighestSpeed"] == undefined ? 0 : parseInt(input["StatClasses.StatHighestSpeed"]);
		if(highestSpeed > player.stats.StatHighestSpeed){
			player.stats.StatHighestSpeed = highestSpeed;
			player.markModified('stats');
		}

		for(var i in input){
			var value = input[i];
			console.log(i,value);
			if(i === "StatClasses.StatHighestSpeed") continue;
			if(i.indexOf('.') !== -1){
				var name = i.split('.')[1];
				if(player.stats[name] === undefined) player.stats[name] = 0;
				player.stats[name] += value;
				//console.log("addded",name,value);
				player.markModified('stats');
			}
		}
		console.log("statted ",input.name);


		player.save(function(err){if(err)throw err;});
	});
};

function getNewsForProject(){
	console.log("Resolving news");
	var deferred = q.defer();
	var client = github.client();
	var repo = client.repo('fireantik/Tribes-Revengeance-stats');
	repo.commits(function(error,commits){
	    if (error) {
	        deferred.reject(new Error(error));
	    } else {
	    	var data = [];
	    	for(var i in commits){
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
	        deferred.resolve(data);
	    }
	});
	return deferred.promise;
}

function addServerLastFullReport(ip,port){
	Server.where({_id:ip+":"+port}).findOne(function(err, server){
		if(err) throw err;
		if(server == null){
			rollbar.reportMessage("server null, _id:" + (ip+":"+port));
			return;
		}
		server.lastfullreport = new Date().getTime();
		server.save(function(err){if(err)throw err;});
	});
}

function limitTracks(tracks, numDays){
	var d = new Date();
	d.setDate(d.getDate() - numDays);
	var data = []
	while(d < Date.now()){
		var e = new Date(d);
		e.setHours(e.getHours() + 1);
		var filtered = underscore.filter(tracks,function(t){return d < t.time && t.time < e;});
		if(filtered.length != 0){
			var item = underscore.min(filtered,function(t){return new Date(t.time)});
			data.push({
				time: item.time,
				players: item.numplayers
			});
		}
		d.setHours(d.getHours() + 1);
	}

	return data;
}


// ----------------------------------------
// express
// ----------------------------------------

var helpers = {
	json: function (context) { return JSON.stringify(context); },
	urlencode: function (context) { return encodeURIComponent(context); },
	showMinutes: function(context) { 
		var span = new timespan.TimeSpan();
		span.addMinutes(parseInt(context));
		var str = "";
		if(span.days == 1)str += span.days + " day ";
		else if(span.days != 0)str += span.days + " days ";
		if(span.hours != 0)str += span.hours + " hours ";
		if(str != "") str += "and ";
		str += span.minutes + " minutes";
		return str;
	},
	showMoment: function(context) { return moment(context).fromNow(); },
	translateStatName: function(context) { 
		var table = require("./statnames.json");
		for (var i in table) {
			if(context == i) return table[i];
		};
		return context;
	},
	killsperminute: function(context) { return (context.kills / context.minutesonline).toFixed(2); },
	inc: function(num) { return num + 1; },
	countryname: function(country, options) { return countryNames[country.toUpperCase()]; },
	condPrint: function (v1, v2,v3) {
		return (v1 == v2) ? v3 : "";
	}
};

app.engine('handlebars', exphbs({defaultLayout: 'main'}));
app.set('view engine', 'handlebars');

//app.use(cacher.cache('seconds', 60))
app.use(express.static(__dirname + "/public/", { maxAge: 86400000 }));
app.use(compression());

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
	var r = myCache.get("index");
	if(r.index !== undefined){
		res.render('home', r.index);
	}
	else{
		var compDate = new Date();
		compDate.setMinutes(compDate.getMinutes() - 2);

		var promises = [
			Player.find().sort({kills:-1}).limit(20).exec(),
			Player.find().sort({minutesonline:-1}).limit(20).exec(),
			Server.find().where({lastseen:{"$gte": compDate}}).limit(20).exec()
		];

		q.all(promises).then(function(data) {
			//console.log("then");
			var obj = {
				playersKills:data[0],
				playersTime:data[1],
				servers:data[2],
				news:tribes_news.slice(0, 5),
				helpers:helpers,
				now: new Date(Date.now())
			};
			res.render('home', obj);
			myCache.set("index",obj,180);
		}).catch(function (error) {
			console.log("catch");
			next(error);
		})
		.done();
	}
})

app.get('/player/:name', cacher.cache(false), function (req, res) {
  	var name = req.params["name"];
	Player.where({_id: name}).findOne(function(err,data){
		if(err) throw err;
		res.render('player',{
			data:data,
			helpers:helpers
		});
	});
})

app.get('/players', function (req, res) {
	Player.find().sort({lastseen:-1}).exec(function(err,data){
		if(err) throw err;
		res.render('players',{
			data:data,
			alerts: [{text: data.length + " players total"}],
			helpers:helpers
		});
	});
})

app.get('/servers', function (req, res) {
	Server.find().sort({lastseen:-1}).exec(function(err,data){
		if(err) throw err;
		res.render('servers',{
			data:data,
			alerts: [{text: data.length + " servers total"}],
			helpers:helpers
		});
	});
});

app.get('/servers.json', function (req, res) {
	Server.find().sort({lastseen:-1}).exec(function(err,data){
		if(err) throw err;
		res.json(data);
	});
});


app.get('/search', cacher.cache(false), function (req, res) {
	var name = req.query.name !== undefined ? req.query.name : "";
	Player.where({_id: new RegExp(name, "i")}).sort({lastseen:-1}).find().exec(function(err,data){
		if(err) throw err;
		res.render('players',{
			data:data,
			alerts: [{text: data.length + " results"}],
			helpers:helpers
		});
	});
})

function parseServerTimeData(data){
	var o = {};
	data.forEach(function(element){
		var time = new Date(element.value.avgTime);
		var index = time.getTime();
		var value = element.value.max;

		o[index] = value;
	});
	return o;
}

function makeMro(id, d){
	var mro = {};
	mro.map = function() {
		var dayStr = this.time.getFullYear()+'-'+this.time.getMonth()+'-'+this.time.getDay();
		var hourStr = this.time.getHours();
		var finalStr = dayStr + ':' + hourStr;
		
		emit(
			finalStr,
			{num:this.numplayers,time:this.time,server:this.serverId}
		); 
	}
	mro.reduce = function (key, values) {
		/*var sum = 0;
		for(var i = 1;i<values.length;i++) sum+=values[i].num;
		var cnt = values.length;
		var avg = sum/cnt;
		var rounded = Math.round(avg);*/
		
		var minTime = values[1].time;	
		var maxTime = values[values.length-1].time;

		var avgTimestamp = (minTime.getTime() + maxTime.getTime()) / 2;
		var avgTime = new Date(avgTimestamp);
		
		var max = 0;
		for(var i = 1;i<values.length;i++) if(max < values[i].num) max = values[i].num;
		
		return {
			//key:key, 
			//players: rounded,
			max:max,
			//avg:avg,
			//server:values[1].server,
			//minTime:minTime,
			//maxTime:maxTime,
			avgTime: avgTime
		};	
	}
	mro.query = {
		"serverId":id,
		"time":{"$gte":d}
	};

	return mro;
}

function getMinutesUntilNextHour() { 
	return 60 - new Date().getMinutes(); 
}

function getServerChartData(id, d, days){
	var cacheId = id+"|"+days;
	

	var r = myCache.get( cacheId );
	//console.log("r = ",r)
	if(r[cacheId] !== undefined) {
		//console.log("from cache");
		var deferred = q.defer();
		deferred.resolve(r[cacheId]);
		return deferred.promise;
	}

	var mro = makeMro(id,d);

	return ServerTrack.mapReduce(mro).then(function(data){
		//console.log("mapreduce then");
		//myCache.set(cacheId, data, 1 * 60);
		myCache.set(cacheId, data, (getMinutesUntilNextHour() + 5) * 60);
		return data;
	});
}

app.get('/server/:id', cacher.cache(false), function (req, res,next) {
	var id = req.params["id"];
	var numDays = req.query.days !== undefined ? parseInt(req.query.days) : 2;
	if(numDays > 7) numDays = 7;
	if(numDays < 2) numDays = 2;
	var d = new Date();
	d.setDate(d.getDate() - numDays);

	var promises = [
		Server.findOne().where({_id: id}).exec(),
		//ServerTrack.where({serverId: id, time: {'$gt':d}}).find().exec()
		getServerChartData(id,d, numDays)
	];
		
	q.all(promises).then(function(data) {
		//console.log("q.all",data[1]);
		var compDate = new Date();
		compDate.setMinutes(compDate.getMinutes() - 2);

		var parsed = parseServerTimeData(data[1]);
		//console.log(parsed);
		res.render('server',{
			data:data[0],
			//tracks: limitTracks(data[1], numDays),
			tracks: parsed,
			online:data != null && data[0].lastseen > compDate,
			helpers:helpers,
			numdays:numDays
		});
	}).catch(function (error) {
		next(error);
	})
	.done();
});

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
  return ipAddress;
};

app.post('/upload', function (req, res) {
	var ip = getClientIp(req);
  	res.send('Hello World!')
  	console.log("received upload request from",ip)
  	console.log(req.body)
  	var decoded = atob(req.body);
  	var object = JSON.parse(decoded);

	var port = object.port;
	object.players.forEach(function(player){
		handlePlayer(player, ip, port);
	});
	addServerLastFullReport(ip, port);
})

app.ws('/', function(ws, req) {
	function listen(type, data){
		var wsData = {
			type: type,
			server: data.server._id,
			serverName: data.server.name,
			player: data.player.player
		};

		if(ws) ws.send(JSON.stringify(wsData));
	}

	function ping(){
		if(ws) ws.send("PING");
	}

	emitter.addListener("join", listen.bind(null, "join"));
	emitter.addListener("left", listen.bind(null, "left"));
	var interval = setInterval(ping, 30 * 1000);

	ws.on('close', function() {
		emitter.removeListener("join", listen);
		clearInterval(interval);
	});

	ping();
});

app.use(function(err, req, res, next) {
	console.log("Error:",err);
  	res.send(err);
});

app.set('port', (process.env.PORT || 5000));
var server = app.listen(app.get('port'), function () {

  var host = server.address().address
  var port = server.address().port

  console.log('App listening at http://%s:%s', host, port)

})

mongoose.connect(process.env.MONGOLAB_URI || "mongodb://localhost/tribes", function(err){
	if(err){console.log("DB failed to connect"); throw err;}
	console.log("DB connected");
});

getNewsForProject().then(function(news){
	tribes_news = news;
});