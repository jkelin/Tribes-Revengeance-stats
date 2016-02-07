# Tribes-Revengeance-stats
Tribes Revengeance stats website http://stats.tribesrevengeance.com

## API
- /servers.json - brief overview of alls servers and their last responses
- ws://<address:port>/ - websocket, sends PING and JSON objects 
  
  `{type: (join|leave), server: "ip:port", serverName: "server name", player: "player name"}`
