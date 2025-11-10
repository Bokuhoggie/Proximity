# Proximity - Quick Start Guide

## What We Just Did

Simplified Proximity from a complex multi-channel app to a clean MVP perfect for daily use with friends:

### Removed (~800+ lines of code):
- ❌ Multiple voice channels (was 4, now 1)
- ❌ Multiple text channels (was 4, now 1)
- ❌ Status selector (online/idle/invisible)
- ❌ Device locking toggles
- ❌ Audio gain slider
- ❌ Noise suppression/echo cancellation UI
- ❌ Auto-join setting
- ❌ Mini map modal

### Kept (Core Features):
- ✅ Single voice channel with proximity-based audio
- ✅ Single text chat channel
- ✅ Proximity map with real-time positioning
- ✅ Test bot for testing proximity audio
- ✅ Basic audio settings (device selection)
- ✅ User colors for map visualization
- ✅ Microphone mute/unmute

### Added:
- ✅ Complete Socket.IO signaling server
- ✅ Test suite (15/16 tests passing)
- ✅ Railway deployment guide
- ✅ Fixed voice channel leave button bug

## How to Test Locally

### 1. Start the Server

```bash
npm run server
```

You should see:
```
🚀 Proximity Signaling Server starting...
📡 Port: 3000
🔊 Voice Channel: voice
💬 Text Channel: general

✨ Proximity Signaling Server is running on port 3000
📍 Health check: http://localhost:3000/health
🎧 Ready for connections!
```

### 2. Start the App (in a new terminal)

```bash
npm run dev
```

Or run both at once:
```bash
npm run dev:all
```

### 3. Test Basic Features

1. **Check Connection**: Look for "Connected to server" in DevTools console
2. **Join Voice Channel**: Click the Voice Chat channel
3. **Grant Mic Permission**: Allow microphone access
4. **Test Proximity**:
   - Click "Add Test Bot" button
   - Move your position by dragging your circle on the map
   - Audio volume should change based on distance to bot
5. **Test Chat**: Send a message in the general text channel
6. **Test with Friend**: Have a friend run the app and join the same channel

## Current Setup

### Server
- **Local**: `http://localhost:3000`
- **Railway**: `https://myserver2-production.up.railway.app` (needs redeployment with new code)

### Client Config
Located in `src/renderer/js/app.js` lines 8-9:
```javascript
const SERVER_URL = 'https://myserver2-production.up.railway.app';
const FALLBACK_URL = 'http://localhost:3000';
```

The app automatically tries Railway first, then falls back to localhost.

## Testing with Friends Locally (Same Network)

### Option 1: Use Your IP Address

1. Find your local IP:
   ```bash
   # Windows
   ipconfig
   # Look for IPv4 Address (e.g., 192.168.1.100)

   # Mac/Linux
   ifconfig
   # or
   ip addr show
   ```

2. Update server to listen on all interfaces:
   In `src/server/signaling-server.js`, change:
   ```javascript
   server.listen(PORT, () => {
   ```
   To:
   ```javascript
   server.listen(PORT, '0.0.0.0', () => {
   ```

3. Friends connect to: `http://YOUR_IP:3000`

### Option 2: Deploy to Railway (Recommended)

See `RAILWAY_DEPLOYMENT.md` for full instructions.

Quick steps:
1. Push code to GitHub
2. Create Railway project from GitHub repo
3. Railway auto-deploys
4. Update `SERVER_URL` in app with Railway URL
5. Share built app with friends

## Deploying to Railway

Your existing Railway server needs the new code:

```bash
# Make sure all changes are committed
git add .
git commit -m "Update server code"
git push origin main
```

Railway will automatically detect the push and redeploy!

Check deployment:
1. Go to https://railway.app
2. Open your project
3. Watch the build logs
4. Visit `https://your-app.up.railway.app/health`

## Building for Distribution

When ready to share with friends:

```bash
npm run build
```

This creates installers in the `dist/` folder:
- Windows: `.exe` installer
- Mac: `.dmg` installer
- Linux: `.AppImage`

Friends just run the installer and connect to your Railway server!

## Troubleshooting

### "WebSocket connection failed"
- Server not running → Run `npm run server`
- Wrong URL → Check `SERVER_URL` in app.js

### "Not in any channel" when leaving voice
- ✅ Fixed! This was a bug we solved

### Microphone not working
- Check browser/Electron permissions
- Try different audio device in settings
- Test with "Test Microphone" button

### Test bot not moving
- It should move automatically once added
- Try removing and re-adding

### Can't hear proximity audio
- Make sure both users are in voice channel
- Check output device in settings
- Move closer/farther on map to test

## Next Steps

1. ✅ Test locally with server running
2. ✅ Verify all features work
3. 🔄 Deploy to Railway
4. 📦 Build and share with friends
5. 🎉 Enjoy proximity voice chat!

## File Structure (Simplified)

```
Proximity/
├── src/
│   ├── server/
│   │   └── signaling-server.js    ← Your Socket.IO server
│   ├── main/
│   │   └── main.js                ← Electron main process
│   └── renderer/
│       ├── index.html             ← Simplified UI
│       └── js/
│           ├── app.js             ← Main app (simplified)
│           ├── audio/
│           │   └── AudioManager.js
│           ├── core/
│           │   └── ConnectionManager.js
│           └── proximity/
│               └── ProximityMap.js
├── tests/                         ← Test suite
├── package.json
├── RAILWAY_DEPLOYMENT.md         ← Deployment guide
└── SERVER_README.md              ← Server documentation
```

## Support

Having issues? Check:
1. Console logs in DevTools (Ctrl+Shift+I / Cmd+Opt+I)
2. Server logs in terminal
3. Railway logs (if deployed)

---

**You're all set! Start the server, run the app, and enjoy your simplified proximity voice chat! 🎉**
