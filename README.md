# Proximity

Voice + text chat for a small group of friends. Electron client, Node signaling server, WebRTC for audio. See [CLAUDE.md](CLAUDE.md) for architecture and conventions.

## Quick start

```
npm install
npm run dev:all
```

That spins up the local signaling server on `:3000` and launches Electron. The client tries the local server first when running under Electron; otherwise it falls back to the Railway deployment.

## Run only the server

```
npm run server
```

Health check: `http://localhost:3000/health`

## Build the desktop app

```
npm run build:win    # also: build:mac, build:linux
```

## Status

In active rebuild. See CLAUDE.md for what's working today.
