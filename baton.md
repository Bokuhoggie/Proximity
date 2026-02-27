# 🎯 Proximity — Baton

> Pass this file between sessions. It tracks what's done, what's in flight, and what's next.

---

## 🗺️ Vision

A lightweight Discord alternative for a small friend group with a unique spatial audio twist. Users move around a 2D map — the closer you are to someone, the louder they sound. Messages and voice are private, self-controlled, and fast.

**Core differentiator:** The proximity map. Everything else should get out of its way.

---

## 🏗️ Architecture

```
Electron App (renderer)
├── app.js              — main controller, thin orchestrator
├── AudioManager        — WebRTC peer connections, mic, gain
├── ConnectionManager   — Socket.IO client
├── ProximityMap        — canvas map, drag, audio volume calc
├── SettingsManager     — localStorage persistence
└── UIManager           — DOM, events, notifications

Railway Server (signaling + chat)
├── signaling-server.js — Socket.IO, WebRTC relay, in-memory chat
└── No database yet     — messages lost on restart (known issue)
```

**Server:** `https://proximityserver-production.up.railway.app`
**Fallback:** `http://localhost:3001` (local dev)

---

## ✅ What's Working

- [x] Single voice channel + text channel
- [x] Socket.IO signaling server on Railway
- [x] Voice channel join/leave/rejoin
- [x] Persistent chat (localStorage)
- [x] Modal proximity map — renders correctly
- [x] Position persistence (server stores, restores on rejoin)
- [x] Proximity range persistence
- [x] Mute while moving toggle
- [x] Join/leave sound effects
- [x] Mic activity → map glow
- [x] Background image upload for map
- [x] Create text channels
- [x] User color picker
- [x] UI restructure — clean Discord-like layout, dead CSS removed
- [x] Dead code removed (Matrix integration, minimap, bomboclat bug)
- [x] Audio bug fixed (connectToUser now appends to body + sets data-user-id)

---

## 🔴 Known Issues

- **Audio between users may still fail** — WebRTC works on LAN, but STUN-only means symmetric NAT users (corporate wifi, some mobile) will silently fail. Need TURN server for public use.
- **Messages not persistent** — Railway in-memory only, wiped on redeploy
- **No file/image sharing in chat** — text only right now

---

## 🛣️ Roadmap

### Phase 1 — Solid Foundation (current)
- [x] Clean up codebase, remove dead code
- [x] Fix audio bug
- [x] UI restructure
- [ ] Fix server bugs (`/api/messages` references undefined `chatMessages`)
- [ ] Add SQLite to Railway server for persistent messages

### Phase 2 — Storage & Privacy
- [ ] Decide: Railway Postgres vs hybrid Timone storage
- [ ] Persistent messages that survive server restarts
- [ ] Image/file uploads in chat
- [ ] User profiles (avatar, bio)

### Phase 3 — Public Access
- [ ] TURN server for reliable audio through NATs
- [ ] Cloudflare Tunnel or Tailscale for Timone access
- [ ] Custom domain

### Phase 4 — Features
- [ ] Multiple voice channels
- [ ] Message reactions
- [ ] Reply threading
- [ ] Screen share / video
- [ ] Mobile-friendly layout

---

## 🧹 Audit Findings (2026-02-25)

### Removed
- `matrix-js-sdk` — entire Matrix integration was dead code, never called
- `webrtc-adapter` — listed as dependency, never imported
- `MatrixClient.js` — 400 lines, entirely unused
- Dead minimap sync code in `ProximityMap.js` (~15 references to non-existent `miniProximityMap`)
- `loadChatForCurrentChannel()`, `setupMatrixEventHandlers()`, `displayMatrixMessage()`, `getDisplayNameFromUserId()` — all dead functions in app.js
- ~250 lines of dead CSS (home page, nav items, setup modal, mini-map modal, status selector)
- `window.global = window` polyfill for Matrix SDK

### Fixed
- `bomboclat` error handler (line 1260) — was `console.bomboclat()` and notification type `'bomboclat'`
- `FALLBACK_URL` was identical to `SERVER_URL` — now correctly points to `localhost:3001`
- `/api/messages` endpoint referenced undefined `chatMessages` — now uses `textChannels`
- `connectToUser()` in AudioManager — audio element was missing `data-user-id` and wasn't appended to `document.body`, causing `disconnectAll()` to miss it

### Remaining Tech Debt
- `app.js` is still 1,800+ lines — ideally split into ChatManager, VoiceManager modules
- 52 references to `window.proximityApp` global — tight coupling, hard to test
- No input validation on socket events (server-side)
- No rate limiting on chat messages

---

## 🗂️ Key Files

| File | Purpose |
|------|---------|
| `src/server/signaling-server.js` | Express + Socket.IO server |
| `src/renderer/js/app.js` | Main app controller |
| `src/renderer/js/audio/AudioManager.js` | WebRTC + mic |
| `src/renderer/js/proximity/ProximityMap.js` | Canvas map |
| `src/renderer/js/ui/UIManager.js` | DOM management |
| `src/renderer/index.html` | UI structure |
| `src/renderer/styles.css` | Styles |
| `package.json` | Scripts + deps |

---

## 💻 Dev Commands

```bash
npm run dev:all       # Run server + Electron together
npm run dev           # Electron only (uses Railway server)
npm start             # Server only
npm run webpack       # Bundle JS (dev)
npm run webpack:prod  # Bundle JS (prod, minified)
npm test              # Jest tests
```
