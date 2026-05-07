# Proximity

Discord/Skype-style voice + chat for a small group of friends. Electron desktop client with a single shared text channel and a single shared voice channel. Spatial / proximity audio is intentionally on hold until the basics are rock solid.

## Architecture

- **Electron renderer** ([src/renderer](src/renderer)) — vanilla JS modules, no build step. ES modules load directly via `<script type="module">`.
- **Signaling server** ([src/server/signaling-server.js](src/server/signaling-server.js)) — Express + socket.io. Relays chat, presence, and WebRTC SDP/ICE. Hosts `POST /upload` and `GET /uploads/:id` for image attachments.
- **Voice** — mesh WebRTC. Newcomer offers to existing peers; existing peers wait for the offer. ICE candidates received before the remote description is set are queued.

## File map

```
src/
├── main/
│   ├── main.js           # Electron bootstrap; auto-grants microphone permission
│   └── preload.js        # (empty placeholder)
├── renderer/
│   ├── index.html        # Join screen + main app shell
│   ├── styles.css
│   └── js/
│       ├── app.js        # Controller: connect, render, chat, voice, image upload
│       └── audio.js      # AudioManager: WebRTC peer connections + mic
└── server/
    ├── signaling-server.js
    └── uploads/          # Image storage (gitignored)
```

## Server topology

Two endpoints, same code:

- **Railway** (production) — `https://proximityserver-production.up.railway.app`. This is what your friends connect to. `npm start` is what Railway runs.
- **Local** (dev) — `http://localhost:3000`. Run via `npm run server` or `npm run dev:all`.

The client picks the server with `pickServer()` in [app.js](src/renderer/js/app.js): when running under Electron, it tries local first; in non-Electron / packaged contexts it tries Railway first. Both check `/health` with a 3s timeout before committing.

## Commands

```
npm install
npm run dev:all       # local server + electron, killed together on Ctrl+C
npm run server        # local server only (port 3000)
npm run dev           # electron only
npm run build:win     # package Windows installer
```

## Image uploads

`POST /upload` with the raw image bytes as the body and the mime type as `Content-Type`. Server returns `{ id, url, size, mime }`. Client emits a `chat` event with `{ imageUrl: url }`. On render, the image src is `serverUrl + url`. Limits: 10 MB, png/jpeg/gif/webp only. Storage is on Railway's ephemeral disk — uploads survive restarts but not redeploys; that's fine for a friends-only chat.

## Build / deploy

- **Server:** Railway runs `npm start`. No env vars needed except `PORT` (Railway provides).
- **Client:** `npm run build:win` produces an installer in `dist-electron/`.

## Status

- ✅ Text chat with persistent in-memory history (last 200 messages)
- ✅ Image upload + inline display + click-to-open
- ✅ Single voice channel with mesh WebRTC
- ⏸ Proximity / spatial audio — to be re-added on top of working voice
- ⏸ Multiple channels — single channel for now

## Conventions

- No build step on the client. ES modules load directly. Don't reintroduce webpack unless there's a concrete need.
- No DB. In-memory state. Friends-only, single Railway dyno is fine.
- No auth. Username + color stored in `localStorage`.
- Don't add features beyond the current scope without asking.
