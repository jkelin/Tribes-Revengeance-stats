# Tribes-Revengeance-stats
Tribes Revengeance stats website http://stats.tribesrevengeance.net

Uses MongoDB for player and server stats storage and InfluxDB for server population history. Is fed data directly by the servers via ServerStatus mod, also queries servers for current uptime via GameSpy server query protocol.

## API
- `/status.json` - Status endpoint
- `/servers.json` - Brief overview of alls servers and their last responses
- `/matches.json` - Information about recent matches
- `/matches/<matchId>.json` - Recent match detail
- `ws://<address:port>/` - Websocket, sends PING and JSON objects 
  
  `{type: (join|leave), server: "ip:port", serverName: "server name", player: "player name"}`
