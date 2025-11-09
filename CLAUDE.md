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
- **Real-time Map**: Live updates showing all users in the voice channel
- **Map Controls**: Center position, adjust range, add test bots
- **Mini Map Modal**: Accessible from voice channels for quick map access
- **Test Bot**: Add AI bot that moves around to test proximity audio

### 💬 Text Chat Channels
- **Multiple Channels**: Diamond (💎), Spade (♠️), Club (♣️), Heart (♥️)
- **Persistent Chat**: Messages are saved and persist across sessions
- **Channel Switching**: Easy switching between text channels
- **Message Management**: Delete your own messages

### 🔊 Voice Channels
- **Multiple Voice Channels**: Separate voice rooms for different groups
- **Voice Participants**: See who's in each voice channel
- **Mute Controls**: Mute/unmute microphone
- **Join/Leave**: Easy voice channel management

### 🎨 User Customization
- **Display Names**: Set your username
- **Color Selection**: Choose from 8 different user colors
- **Audio Settings**: Microphone gain, noise suppression, echo cancellation
- **Device Selection**: Choose input/output audio devices

### 🔐 OAuth Authentication
- **Google OAuth**: Sign in with Google account
- **Cloud Sync**: Settings sync across devices
- **User Profiles**: Persistent user data
- **Optional Auth**: Can use app without authentication

## Current Technical Stack

### Frontend
- **Electron**: Desktop application framework
- **Vanilla JavaScript**: No frontend frameworks, pure JS modules
- **HTML5 Canvas**: For proximity map rendering
- **CSS3**: Custom styling with CSS variables

### Backend
- **Node.js**: Server runtime
- **Socket.io**: Real-time communication
- **Express**: Web server framework
- **Firebase**: Authentication and user data storage

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

## OAuth Configuration
- **Client ID**: `580999552333-m2uei964tsmeugiqjbijrbjoak8decd3.apps.googleusercontent.com`
- **Client Secret**: `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`
- **Provider**: Google OAuth 2.0
- **Scopes**: Basic profile information (email, name)

## Current Issues to Fix

### 1. Firebase Module Import Error
```
Uncaught TypeError: Failed to resolve module specifier "firebase/app". 
Relative references must start with either "/", "./", or "../".
```
**Fix**: Update Firebase imports to use proper ES module syntax

### 2. Content Security Policy Warning
```
Electron Security Warning (Insecure Content-Security-Policy)
```
**Fix**: Update CSP to remove unsafe-eval while maintaining functionality

### 3. Map Navigation Issue
- **Current**: Map is accessible from main navigation
- **Desired**: Map should only be accessible from within voice channels
- **Fix**: Remove map from navbar, add map buttons to voice channels only

## Development Commands

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run server and app together
npm run dev:all

# Build for production
npm run build

# Run webpack
npm run webpack

# Watch mode for webpack
npm run watch
```

## Server Configuration
- **Primary**: Railway deployment (`https://myserver2-production.up.railway.app`)
- **Fallback**: Local development server (`http://localhost:3000`)
- **Auto-fallback**: App automatically tries Railway first, then localhost

## Authentication Flow
1. User opens app
2. After 2 seconds, auth prompt appears (if not dismissed recently)
3. User can sign in with Google or dismiss
4. If authenticated, settings sync from cloud
5. User profile displayed in settings
6. Settings changes automatically sync to cloud

## Map System Details
- **Canvas Size**: 800x600 (main), 400x300 (mini)
- **User Representation**: Colored circles with usernames
- **Proximity Range**: Visual dashed circle around user
- **Audio Calculation**: Volume based on distance between users
- **Movement**: Drag to move, real-time sync with other users

## Next Steps
1. Fix Firebase import errors
2. Implement proper OAuth authentication
3. Restructure map access (voice channels only)
4. Test and debug authentication flow
5. Improve security configuration