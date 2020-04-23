# Tribes Vengeance Stats

Tribes Revengeance stats website available at http://stats.tribesrevengeance.net

## Features

- Tracks player and server stats
- Tracks server population
- Integrates in-game chat and allows bidirectional communication between Game == Stats == Discord
- Associates players using their IP addresses to identify players hiding their true identity (smurfing)
- Provides a [browser extension](http://stats.tribesrevengeance.net/extension) which spells out current player count

## Technical

![Components](/docs/components.svg)

Uses Node.js, Express, Typescript and Handlebars for views.

### Persistence

Primary datastore is MongoDB. Historical population is stored in InfluxDB, this has been migrated from MongoDB because Mongo did not perform adequately. Chat data is stored in Redis without persistance, this is also synchronized into all running instances to enable scaling.

In the future it would be great to migrate onto a database with a strict schema, like PostgreSQL. Choosing MongoDB has been a mistake but migration costs are too high.

### Stat and server tracking

- [Qtracker](https://www.qtracker.com/) master server is polled periodically to acquire list of server addresses
- Servers are queried using GameSpy QR2 protocol on their UDP diagnostic ports. This returns basic server information like name, scores, current players, their teams and scores (not Tribes stats).
  - This happens periodically every second for each active server
  - This data is used for server detail screen to see who is online
  - Player total play time is also accumulated from this query
  - However this data is extremely rudimentary for a game like Tribes which has custom stats that are much more interesting than just score
  - This data is also fed into the event system which in the end sends a WebSocket notification into the [browser extension](http://stats.tribesrevengeance.net/extension)
- Servers that have [Tribes Vengeance Server Status mod](https://github.com/jkelin/TribesVengeanceServerStatus) installed and correctly configured report match details on match end
  - This data includes full player stats and their IP addresses
  - Each match result is saved so it can be looked up in the future (including on the website)
  - This data is also used for player pairing (by IPs)

### Chat integration

- Game servers, when configured properly, expose a HTTP WebAdmin, which Stats poll periodically for chat updates. New chat messages are also sent through here
  - WebAdmin is protected by Basic HTTP Auth, which needs to be configured in a database for every server
  - Specifically game console screen located at `/ServerAdmin/current_console` is requested
  - Chat extracted this way does not show correct player names when using QuickChat commands
  - `iso-8859-1` encoding is used throughout the WebAdmin component
  - Messages are also deduplicated and stored in Redis, from which they are synchronized into all Stats instances
  - New chat messages are also sent through here.
    - Because Stats are basically injecting commands (`say` command to be exact), it would be possible to create and integration with other systems, like map switching
- Webhooks are used to send chat messages into Discord IM platform
- Discord SDK is used to read messages from Discord, show them on the website and publish subsequently publish them through WebAdmin into the game

### API

- `/status.json` - Status endpoint
- `/servers.json` - Brief overview of alls servers and their last responses
- `/matches.json` - Information about recent matches
- `/matches/<matchId>.json` - Recent match detail
- `ws://<address:port>/` - Websocket, sends PING and JSON objects

  `{type: (join|leave), server: "ip:port", serverName: "server name", player: "player name"}`
