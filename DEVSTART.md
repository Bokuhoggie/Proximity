# Proximity - Developer Quick Start Guide

Welcome to Proximity! This guide will get you up and running quickly so you can start developing.

## 📋 Prerequisites

- **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
- **Git** - [Download here](https://git-scm.com/)
- **Code Editor** - VS Code recommended

## 🚀 Quick Setup (5 minutes)

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/Proximity.git
cd Proximity
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required packages including:
- Electron (desktop app framework)
- Socket.io (real-time communication)
- Webpack (bundler)
- Express (server)

### 3. Start Development Mode

**Option A: Run everything together (recommended)**
```bash
npm run dev:all
```
This starts both the signaling server AND the Electron app.

**Option B: Run separately**
```bash
# Terminal 1 - Start the signaling server
npm run server

# Terminal 2 - Start the Electron app
npm run dev
```

## 🏗️ Project Structure

```
Proximity/
├── src/
│   ├── main/
│   │   ├── main.js          # Electron main process
│   │   └── preload.js       # Preload script
│   ├── renderer/
│   │   ├── index.html       # Main UI
│   │   ├── styles.css       # Global styles
│   │   └── js/
│   │       ├── app.js       # Main application controller
│   │       ├── audio/       # Audio management
│   │       ├── core/        # Connection management
│   │       ├── proximity/   # Map and proximity logic
│   │       ├── settings/    # Settings management
│   │       └── ui/          # UI management
│   └── server/
│       └── signaling-server.js  # Socket.IO server
├── package.json
├── webpack.config.js
├── ISSUE_LOG.md             # Current bugs and issues
└── DEVSTART.md              # This file!
```

## 🛠️ Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Electron app in dev mode (with DevTools) |
| `npm run dev:all` | Start server + app together |
| `npm run server` | Start signaling server only |
| `npm run webpack` | Build JavaScript bundle |
| `npm run watch` | Auto-rebuild on file changes |
| `npm run build` | Build for production |

## 🔄 Development Workflow

### Making Changes to JavaScript

1. Edit files in `src/renderer/js/`
2. Run webpack to rebuild:
   ```bash
   npm run webpack
   ```
3. Restart the Electron app (Ctrl+R in app window)

**Pro Tip:** Use watch mode for auto-rebuilding:
```bash
npm run watch
```

### Making Changes to HTML/CSS

1. Edit `src/renderer/index.html` or `styles.css`
2. Restart the app (Ctrl+R) - no webpack needed!

### Making Changes to Server

1. Edit `src/server/signaling-server.js`
2. Restart the server (Ctrl+C then `npm run server`)

## 🐛 Debugging

### Opening DevTools
The app automatically opens Chrome DevTools in dev mode. If not:
- Press `F12` or `Ctrl+Shift+I` in the app window

### Common Console Logs
- `🎵 AudioManager initialized` - Audio system ready
- `✅ Connected to server` - Socket.IO connected
- `🔊 Joined voice channel` - Voice connection established

### Cache Issues
If you're seeing old code after changes:
```bash
npm run dev -- --dev
```
This clears Electron's cache on startup.

## 🌐 Server Configuration

The app connects to the Railway production server by default:
- **Production:** `https://proximityserver-production.up.railway.app`
- **Fallback:** `http://localhost:3000`

To force local server, edit `src/renderer/js/core/ConnectionManager.js`:
```javascript
// Line ~10
this.serverUrl = 'http://localhost:3000';
```

## 📝 Key Files to Know

### Frontend (Client)
- **`app.js`** - Main app controller, handles everything
- **`UIManager.js`** - All UI updates and DOM manipulation
- **`AudioManager.js`** - WebRTC audio connections
- **`ProximityMap.js`** - Canvas-based proximity map
- **`ConnectionManager.js`** - Socket.IO connection handling
- **`SettingsManager.js`** - User settings persistence

### Backend (Server)
- **`signaling-server.js`** - WebRTC signaling + chat server

## 🔧 Common Issues & Solutions

### "Module not found" errors
```bash
rm -rf node_modules package-lock.json
npm install
```

### App won't start
1. Make sure server is running: `npm run server`
2. Check port 3000 isn't in use: `lsof -i :3000` (Mac/Linux) or `netstat -ano | findstr :3000` (Windows)
3. Try deleting `node_modules` and reinstalling

### Audio not working
1. Check browser console for permission errors
2. Make sure you granted microphone permission
3. Check Settings page for device selection

### Changes not appearing
1. Did you run `npm run webpack`?
2. Did you restart the app (Ctrl+R)?
3. Try clearing cache with dev flag

## 📚 Technology Stack

- **Electron** - Desktop app framework
- **Socket.io** - Real-time bidirectional communication
- **WebRTC** - Peer-to-peer audio streaming
- **Webpack** - Module bundler
- **Express** - Web server
- **Canvas API** - Proximity map rendering
- **Web Audio API** - Audio processing

## 🎯 Current Development Focus

Check `ISSUE_LOG.md` for:
- 🔴 Critical bugs to fix
- 🟡 Medium priority improvements
- 🟢 Feature enhancements
- 📝 Known issues

## 🤝 Contributing Workflow

1. **Create a branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes and test**

3. **Commit with descriptive messages:**
   ```bash
   git add .
   git commit -m "Add feature: description of what you did"
   ```

4. **Push to GitHub:**
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Create a Pull Request on GitHub**

## 💡 Pro Tips

1. **Use console.log liberally** - The app logs everything, check DevTools console
2. **Check ISSUE_LOG.md** - All known bugs and fixes are documented there
3. **Use watch mode** - `npm run watch` saves time during active development
4. **Test with two clients** - Open two instances to test voice/chat features
5. **Use the map** - The proximity map helps debug spatial audio issues

## 🆘 Getting Help

- **Console errors?** - Check Chrome DevTools (F12)
- **Server issues?** - Check server terminal output
- **Need to understand code?** - Read `CLAUDE.md` for architecture overview
- **Found a bug?** - Add it to `ISSUE_LOG.md` with `#issue` tag

## 🚦 You're Ready!

Run this to start developing:
```bash
npm run dev:all
```

Then open the app, join a voice channel, and start coding! The server will be running at `http://localhost:3000` and the Electron app will connect automatically.

Happy coding! 🎉
