# Tribes-Revengeance-stats
Tribes Revengeance stats website http://stats.tribesrevengeance.net

## API
- `/status.json` - Status endpoint
- `/servers.json` - Brief overview of alls servers and their last responses
- `/matches.json` - Information about recent matches
- `/matches/<matchId>.json` - Recent match detail
- `ws://<address:port>/` - Websocket, sends PING and JSON objects 
  
  `{type: (join|leave), server: "ip:port", serverName: "server name", player: "player name"}`
