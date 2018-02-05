# Tribes-Revengeance-stats
Tribes Revengeance stats website http://stats.tribesrevengeance.net

## API
- `/servers.json` - brief overview of alls servers and their last responses
- `/matches.json` - information about recent matches
- `/matches/<matchId>.json` - recent match detail
- `ws://<address:port>/` - websocket, sends PING and JSON objects 
  
  `{type: (join|leave), server: "ip:port", serverName: "server name", player: "player name"}`
