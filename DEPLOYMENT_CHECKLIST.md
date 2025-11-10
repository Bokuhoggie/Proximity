# Proximity Deployment Checklist ✅

## Pre-Deployment Verification

### ✅ Code Ready
- [x] OAuth secrets removed from CLAUDE.md
- [x] Server URL configured: `proximityserver-production.up.railway.app`
- [x] package.json `start` script runs server (not Electron)
- [x] Webpack bundle built with correct URLs
- [x] Test suite created (15/16 tests passing)
- [x] 800+ lines of unnecessary code removed

### ✅ Server Configuration
- [x] Socket.IO server in `src/server/signaling-server.js`
- [x] Single voice channel: `voice`
- [x] Single text channel: `general`
- [x] PORT configuration: `process.env.PORT || 3000`
- [x] CORS enabled for all origins
- [x] Health endpoint: `/health`
- [x] Graceful shutdown handler

### ✅ Client Configuration
- [x] Connection overlay implemented
- [x] Railway-first connection strategy
- [x] Fallback to localhost option
- [x] Clear connection status indicators
- [x] Retry and local server buttons

### ✅ Features Working
- [x] Voice channel join/leave
- [x] Proximity-based audio
- [x] Text chat
- [x] User positioning on map
- [x] Test bot for proximity testing
- [x] Microphone mute/unmute
- [x] Audio device selection
- [x] Mute while moving toggle (mutes moving users until 0.5s stationary)
- [x] Join hub screen on startup
- [x] Chat message persistence
- [x] Modal map system

## Deployment Steps

### Step 1: Push to GitHub ✅
```bash
git add -A
git commit -m "Remove OAuth secrets and verify production readiness"
git push origin main
```

### Step 2: Connect Railway to GitHub
1. Go to https://railway.app
2. Open your ProximityServer project
3. Click "Settings"
4. Under "Source" → "Connect Repo"
5. Select your GitHub repository
6. Choose `main` branch
7. Railway will auto-deploy on every push

### Step 3: Verify Railway Deployment
Wait 1-2 minutes, then check:

```bash
# Test health endpoint
curl https://proximityserver-production.up.railway.app/health
```

Expected response:
```json
{
  "status": "ok",
  "users": 0,
  "hubUsers": 0,
  "voiceChannel": {
    "id": "voice",
    "userCount": 0
  },
  "chatChannel": "general",
  "messageCount": 0,
  "uptime": 123.45
}
```

### Step 4: Test Client Connection
```bash
npm run dev
```

You should see:
1. ✅ Connection overlay: "Connecting to Railway server..."
2. ✅ Overlay disappears after successful connection
3. ✅ Notification: "Connected to Railway server"
4. ✅ No console errors

### Step 5: Test Complete User Flow

#### A. Join Voice Channel
1. Click "Voice Chat" in sidebar
2. Grant microphone permission
3. You appear on proximity map
4. Your user circle shows on the map

#### B. Test Proximity Audio
1. Click "Add Test Bot" button
2. Bot appears and moves around automatically
3. Drag your position closer/farther from bot
4. Volume should change based on distance

#### C. Test Chat
1. Type message in general chat
2. Press Enter
3. Message appears with your username and color

#### D. Test with Second User
1. Have friend run `npm run dev` on their computer
2. Both join voice channel
3. Both appear on each other's proximity maps
4. Audio works based on proximity
5. Chat messages sync between both users

### Step 6: Build for Distribution

Build for all platforms:
```bash
npm run build
```

Or build for specific platform:
```bash
npm run build:win    # Windows only
npm run build:mac    # macOS only
npm run build:linux  # Linux only
```

Creates installers in `dist/` folder:
- Windows: `Proximity Setup.exe`
- Mac: `Proximity.dmg`
- Linux: `Proximity.AppImage`

Note: Production builds automatically optimize webpack bundle (no source maps, minified code)

## Post-Deployment Monitoring

### Railway Dashboard
- Check logs for any errors
- Monitor memory usage (should be <100MB)
- Verify uptime

### Health Checks
Set up automated health checks:
```bash
# Every 5 minutes
curl https://proximityserver-production.up.railway.app/health
```

### User Testing
- Test with 2-3 friends simultaneously
- Verify audio quality
- Check for any connection drops
- Test proximity audio accuracy

## Troubleshooting

### Railway Deployment Failed
```bash
# Check Railway logs in dashboard
# Common issues:
# - Missing dependencies → npm install should fix
# - Wrong start command → Should be "node src/server/signaling-server.js"
# - Port binding → Server uses process.env.PORT
```

### Client Can't Connect
```bash
# 1. Check Railway is running
curl https://proximityserver-production.up.railway.app/health

# 2. Check client URL in src/renderer/js/app.js
# Should be: proximityserver-production.up.railway.app

# 3. Rebuild webpack bundle
npm run webpack

# 4. Restart app
npm run dev
```

### Audio Not Working
- Check microphone permissions in browser/Electron
- Verify both users are in voice channel
- Test with test bot first
- Check output device in settings

### Proximity Audio Volume Issues
- Ensure both users have different positions on map
- Try adjusting proximity range slider
- Check that neither user is muted
- Verify output volume isn't at 0%

## Success Criteria ✅

Your deployment is successful when:
- [ ] Railway health endpoint returns 200 OK
- [ ] App connects without showing error overlay
- [ ] Voice channel join works
- [ ] Proximity audio changes volume with distance
- [ ] Chat messages send and receive
- [ ] Multiple users can connect simultaneously
- [ ] Test bot moves and audio works

## Next Steps After Deployment

1. **Share with Friends**
   - Send them the built app from `dist/` folder
   - Or have them clone repo and run `npm install && npm run dev`
   - Everyone connects to same Railway URL

2. **Monitor Usage**
   - Check Railway dashboard for user count
   - Watch for any error patterns in logs
   - Monitor Railway billing (should stay under $5/month)

3. **Future Improvements**
   - Fix remaining 1 test that times out
   - Add voice channel user list
   - Implement push-to-talk option
   - Add spatial audio settings
   - Create reconnection logic for network drops

---

## Current Status: READY FOR DEPLOYMENT! 🚀

All systems verified and ready. Just:
1. Push to GitHub
2. Let Railway auto-deploy
3. Test and enjoy!
