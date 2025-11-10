# Proximity Voice Chat Application

## Overview
Proximity is a real-time voice chat application built with Electron that simulates spatial audio through a proximity map system. Users can join voice channels and communicate with others based on their location within a virtual space, similar to Discord but with a unique spatial audio experience.

## Key Features

### 🎯 Proximity-Based Audio
- **Spatial Voice Chat**: Audio volume is based on distance between users on a 2D map
- **Adjustable Range**: Users can control their proximity range with a slider (50-300px)
- **Real-time Movement**: Drag your user icon to move around the map space
- **Visual Feedback**: Dashed circles show your proximity range

### 🗺️ Interactive Map System
- **Modal Map**: Opens as overlay when in voice channel
- **Real-time Map**: Live updates showing all users in the voice channel
- **Map Controls**: Center position, adjust range, add test bots
- **Quick Access**: Map button available directly in voice channel
- **Test Bot**: Add AI bot that moves around to test proximity audio

### 💬 Text Chat
- **Single Channel**: General chat for all users
- **Persistent Chat**: Messages are saved and persist across sessions using localStorage
- **Real-time Sync**: Messages sync across all connected users

### 🔊 Voice Channels
- **Single Voice Channel**: One unified voice room for all users
- **Voice Participants**: See who's in the voice channel
- **Mute Controls**: Mute/unmute microphone
- **Join/Leave**: Easy voice channel management
- **Mute While Moving**: Optional toggle to mute moving users (audio returns after 0.5s stationary)

### 🎨 User Customization
- **Display Names**: Set your username (prompted on startup)
- **Color Selection**: Choose from 8 different user colors
- **Audio Settings**: Noise suppression, echo cancellation, mute while moving
- **Device Selection**: Choose input/output audio devices
- **Persistent Settings**: All settings saved to localStorage

## Current Technical Stack

### Frontend
- **Electron**: Desktop application framework
- **Vanilla JavaScript**: No frontend frameworks, pure JS modules
- **HTML5 Canvas**: For proximity map rendering
- **CSS3**: Custom styling with CSS variables

### Backend
- **Node.js**: Server runtime
- **Socket.io**: Real-time communication and WebRTC signaling
- **Express**: Web server framework with health endpoints
- **Railway**: Cloud hosting for signaling server

### Audio Technology
- **WebRTC**: Peer-to-peer audio streaming
- **MediaRecorder API**: Audio recording and processing
- **Web Audio API**: Audio gain control and effects

## Project Structure
```
src/
├── main/
│   ├── main.js          # Electron main process
│   └── preload.js       # Preload script
├── renderer/
│   ├── index.html       # Main UI
│   ├── styles.css       # Global styles
│   └── js/
│       ├── app.js       # Main application controller
│       ├── auth/        # Authentication modules
│       ├── audio/       # Audio management
│       ├── chat/        # Chat functionality
│       ├── core/        # Core connection management
│       ├── proximity/   # Map and proximity logic
│       ├── server/      # Server management
│       ├── settings/    # Settings management
│       └── ui/          # UI management
```

## Authentication
**Status**: OAuth/Firebase authentication removed for MVP simplicity
- App uses localStorage for settings (username, color, audio preferences)
- No authentication required to use the app
- Users identified by Socket.IO session ID during voice chat

## Current Status - Production Ready! ✅

All major features implemented:
- ✅ Single voice channel and text channel
- ✅ Socket.IO signaling server created and deployed
- ✅ Voice channel join/leave/rejoin working
- ✅ Connection overlay with Railway priority
- ✅ Join hub screen on startup
- ✅ Persistent chat messages (localStorage)
- ✅ Modal map system
- ✅ Mute while moving toggle
- ✅ Test suite created (15/16 tests passing)
- ✅ Simplified UI (removed 800+ lines of code)
- ✅ Railway deployment configured
- ✅ Production build optimization (webpack)

## Development Commands

```bash
# Install dependencies
npm install

# Run in development mode (Electron only)
npm run dev

# Run server and app together (for local development)
npm run dev:all

# Build for production (all platforms with webpack optimization)
npm run build

# Build for specific platforms
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux

# Run server only (Railway uses this)
npm start

# Webpack commands
npm run webpack       # Development build
npm run webpack:prod  # Production build (minified, no source maps)
npm run watch         # Watch mode for development

# Testing
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

## Server Configuration
- **Primary**: Railway deployment (`https://proximityserver-production.up.railway.app`)
- **Fallback**: Local development server (`http://localhost:3000`)
- **Auto-fallback**: App automatically tries Railway first, then localhost

## User Flow
1. User opens app → Join hub screen appears
2. Enter username → Click "Join Hub"
3. Main app loads with connection to Railway server
4. Click voice channel map button (🗺️) to open proximity map
5. Join voice channel to start spatial audio communication
6. Drag around map to change audio volume based on proximity
7. Messages in general chat persist across sessions

## Map System Details
- **Canvas Size**: 800x600 modal overlay
- **User Representation**: Colored circles with usernames and activity indicators
- **Proximity Range**: Visual dashed circles showing audio ranges
- **Audio Calculation**: Volume based on distance with edge feathering and extended range
- **Movement Detection**: Tracks user movement with 500ms stationary timer
- **Movement**: Drag to move, real-time sync with other users
- **Test Bot**: Optional bot with looping audio for proximity testing

## Key Settings
- **Mute While Moving**: When enabled, mutes other users' audio while they're moving (audio returns after 0.5s stationary)
- **Noise Suppression**: Reduces background noise
- **Echo Cancellation**: Prevents audio feedback
- **User Color**: 8 color options for map representation
- **Audio Devices**: Select specific input/output devices