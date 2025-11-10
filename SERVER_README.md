# Proximity Server Setup

## Quick Start

### Running the Server Locally

1. **Start the signaling server:**
   ```bash
   npm run server
   ```
   Server will run on `http://localhost:3000`

2. **Start the Electron app:**
   ```bash
   npm run dev
   ```

3. **Or run both together:**
   ```bash
   npm run dev:all
   ```

## Server Endpoints

- **Root**: `http://localhost:3000/` - Basic status page
- **Health Check**: `http://localhost:3000/health` - Server health and statistics

## Features Supported

The signaling server handles:

### Voice Communication
- WebRTC signaling (offer/answer/ICE candidates)
- Voice channel management (join/leave)
- User position tracking for proximity audio
- Microphone mute status broadcasting

### Text Chat
- Multiple text channels (diamond, spade, club, heart)
- Message persistence (last 100 messages per channel)
- Message deletion
- Chat history retrieval

### User Management
- User presence (hub join/leave)
- User status (online/idle/invisible)
- User list broadcasting
- Disconnection handling

## Connection Flow

1. App tries to connect to Railway (`https://myserver2-production.up.railway.app`)
2. If Railway fails, automatically falls back to `http://localhost:3000`
3. User joins hub with username and color
4. User can join voice channels and text channels
5. WebRTC peer connections established through signaling

## Deploying to Railway

1. Push your code to GitHub
2. Connect repository to Railway
3. Railway will auto-detect Node.js and run the server
4. Server uses `process.env.PORT` for Railway's dynamic port assignment

## Server Architecture

```
src/server/signaling-server.js
├── Express HTTP Server
├── Socket.io WebSocket Server
├── Voice Channel Manager
├── Chat Message Store
└── User State Manager
```

## Socket.io Events

### Client → Server
- `join-hub` - Join the main hub
- `leave-hub` - Leave the hub
- `join-voice-channel` - Join a voice channel
- `leave-voice-channel` - Leave current voice channel
- `offer` - WebRTC offer
- `answer` - WebRTC answer
- `ice-candidate` - ICE candidate for NAT traversal
- `mic-status` - Mute/unmute status
- `position-update` - User position on proximity map
- `send-chat-message` - Send text message
- `delete-message` - Delete a message
- `request-chat-history` - Request chat history
- `status-change` - Change user status

### Server → Client
- `hub-users` - List of users in hub
- `user-joined-hub` - User joined hub
- `user-left-hub` - User left hub
- `voice-channel-users` - Users in voice channel
- `user-joined-voice` - User joined voice channel
- `user-left-voice` - User left voice channel
- `offer` - Relayed WebRTC offer
- `answer` - Relayed WebRTC answer
- `ice-candidate` - Relayed ICE candidate
- `user-mic-status` - User muted/unmuted
- `position-update` - User moved on map
- `chat-message` - New chat message
- `message-deleted` - Message was deleted
- `chat-history` - Chat history response
- `user-status-changed` - User status changed

## Troubleshooting

### WebSocket Connection Failed
- Make sure the server is running (`npm run server`)
- Check that port 3000 is not in use
- Verify firewall settings

### Can't Connect from App
- Check ConnectionManager.js is pointing to correct URL
- Verify CSP allows WebSocket connections
- Check browser/Electron console for errors

### Voice Not Working
- Ensure microphone permissions granted
- Check WebRTC STUN servers are accessible
- Verify both users are in same voice channel

## Current Status

- ✅ Local server implemented and working
- ✅ All Socket.io events implemented
- ✅ Voice channel management working
- ✅ Text chat system working
- ⚠️ Railway deployment needs to be set up
- ⚠️ OAuth authentication needs server-side implementation
