const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;

// Store connected users and their states
const users = new Map();
const hubUsers = new Set();
const voiceChannels = new Map(); // channelId -> Set of userIds
const textChannels = new Map(); // channelId -> { name, messages[] }
const MAX_MESSAGES = 100;

// Initialize default channels
const VOICE_CHANNEL = 'voice';
voiceChannels.set(VOICE_CHANNEL, new Set());

// Initialize default text channel
textChannels.set('general', {
    name: 'general',
    messages: []
});

console.log('🚀 Proximity Signaling Server starting...');
console.log(`📡 Port: ${PORT}`);
console.log(`🔊 Voice Channel: ${VOICE_CHANNEL}`);
console.log(`💬 Chat: Socket.IO (in-memory)`);

io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.id}`);

    // Initialize user data
    users.set(socket.id, {
        id: socket.id,
        username: null,
        userColor: null,
        isMuted: false,
        position: { x: 400, y: 300 }, // Default center position
        proximityRange: 100, // Default proximity range
        voiceChannel: null,
        status: 'online',
        backgroundImage: null // Store background image data URL
    });

    // Handle user joining hub
    socket.on('join-hub', (data) => {
        const { username, userColor, status } = data;
        const user = users.get(socket.id);

        if (user) {
            user.username = username;
            user.userColor = userColor;
            user.status = status || 'online';
            hubUsers.add(socket.id);

            console.log(`👤 ${username} joined hub (${socket.id})`);

            // Send current hub users to the new user
            const currentUsers = Array.from(hubUsers).map(id => {
                const u = users.get(id);
                return {
                    id: u.id,
                    username: u.username,
                    userColor: u.userColor,
                    position: u.position,
                    isMuted: u.isMuted,
                    voiceChannel: u.voiceChannel,
                    status: u.status
                };
            });

            socket.emit('hub-users', currentUsers);

            // Send text channels list
            const channelsList = Array.from(textChannels.entries()).map(([id, channel]) => ({
                id,
                name: channel.name
            }));
            socket.emit('text-channels-list', channelsList);

            // Send chat message history for general channel
            const generalChannel = textChannels.get('general');
            if (generalChannel) {
                socket.emit('chat-history', generalChannel.messages);
            }

            // Notify others about the new user
            socket.broadcast.emit('user-joined-hub', {
                id: socket.id,
                username: user.username,
                userColor: user.userColor,
                position: user.position,
                status: user.status
            });
        }
    });

    // Handle user leaving hub
    socket.on('leave-hub', () => {
        const user = users.get(socket.id);
        if (user) {
            console.log(`👋 ${user.username} left hub`);
            hubUsers.delete(socket.id);
            socket.broadcast.emit('user-left-hub', socket.id);
        }
    });

    // Handle joining voice channel
    socket.on('join-voice-channel', (data) => {
        const { channelId } = data;
        const user = users.get(socket.id);

        if (user && channelId) {
            // Leave previous channel if in one
            if (user.voiceChannel) {
                const prevChannel = voiceChannels.get(user.voiceChannel);
                if (prevChannel) {
                    prevChannel.delete(socket.id);
                }
            }

            // Join new channel
            if (!voiceChannels.has(channelId)) {
                voiceChannels.set(channelId, new Set());
            }

            const channel = voiceChannels.get(channelId);
            channel.add(socket.id);
            user.voiceChannel = channelId;

            console.log(`🔊 ${user.username} joined voice channel: ${channelId}`);

            // Get other users in the channel
            const usersInChannel = Array.from(channel)
                .filter(id => id !== socket.id)
                .map(id => {
                    const u = users.get(id);
                    return {
                        id: u.id,
                        username: u.username,
                        userColor: u.userColor,
                        position: u.position,
                        proximityRange: u.proximityRange,
                        isMuted: u.isMuted
                    };
                });

            // Send list of users in channel to the joining user, along with their own stored state
            socket.emit('voice-channel-users', {
                users: usersInChannel,
                myPosition: user.position,
                myProximityRange: user.proximityRange
            });

            // Notify others in the channel about the new user
            socket.to(channelId).emit('user-joined-voice', {
                id: socket.id,
                username: user.username,
                userColor: user.userColor,
                position: user.position,
                proximityRange: user.proximityRange,
                isMuted: user.isMuted
            });

            // Join socket.io room for this channel
            socket.join(channelId);
        }
    });

    // Handle leaving voice channel
    socket.on('leave-voice-channel', () => {
        const user = users.get(socket.id);

        if (user && user.voiceChannel) {
            const channelId = user.voiceChannel;
            const channel = voiceChannels.get(channelId);

            if (channel) {
                channel.delete(socket.id);
                console.log(`🔇 ${user.username} left voice channel: ${channelId}`);

                // Notify others in the channel
                socket.to(channelId).emit('user-left-voice', socket.id);

                // Leave socket.io room
                socket.leave(channelId);

                user.voiceChannel = null;
            }
        }
    });

    // WebRTC Signaling - Offer
    socket.on('offer', (data) => {
        const { target, offer } = data;
        console.log(`📞 Relaying offer from ${socket.id} to ${target}`);
        io.to(target).emit('offer', {
            offer,
            from: socket.id
        });
    });

    // WebRTC Signaling - Answer
    socket.on('answer', (data) => {
        const { target, answer } = data;
        console.log(`📞 Relaying answer from ${socket.id} to ${target}`);
        io.to(target).emit('answer', {
            answer,
            from: socket.id
        });
    });

    // WebRTC Signaling - ICE Candidate
    socket.on('ice-candidate', (data) => {
        const { target, candidate } = data;
        io.to(target).emit('ice-candidate', {
            candidate,
            from: socket.id
        });
    });

    // Handle microphone mute status
    socket.on('mic-status', (data) => {
        const { isMuted } = data;
        const user = users.get(socket.id);

        if (user) {
            user.isMuted = isMuted;

            // Broadcast to users in the same voice channel
            if (user.voiceChannel) {
                socket.to(user.voiceChannel).emit('user-mic-status', {
                    userId: socket.id,
                    isMuted
                });
            }
        }
    });

    // Handle position updates (for proximity map)
    socket.on('position-update', (data) => {
        const { x, y } = data;
        const user = users.get(socket.id);

        if (user) {
            user.position = { x, y };

            // Broadcast position to users in the same voice channel
            if (user.voiceChannel) {
                socket.to(user.voiceChannel).emit('position-update', {
                    userId: socket.id,
                    x,
                    y
                });
            }
        }
    });

    // Handle proximity range updates
    socket.on('proximity-range-update', (data) => {
        const { range } = data;
        const user = users.get(socket.id);

        if (user) {
            user.proximityRange = range;
            console.log(`📏 ${user.username} updated proximity range to ${range}px`);

            // Broadcast proximity range to users in the same voice channel
            if (user.voiceChannel) {
                socket.to(user.voiceChannel).emit('proximity-range-update', {
                    userId: socket.id,
                    range
                });
            }
        }
    });

    // Simple in-memory chat (Matrix integration paused - guest registration disabled)
    socket.on('send-chat-message', (data) => {
        const { message, channelId = 'general' } = data;
        const user = users.get(socket.id);

        if (user && message) {
            const chatMessage = {
                id: `${socket.id}-${Date.now()}`,
                userId: socket.id,
                username: user.username,
                userColor: user.userColor,
                message,
                timestamp: Date.now(),
                channelId
            };

            console.log(`💬 [#${channelId}] ${user.username}: ${message.substring(0, 50)}`);

            // Save to channel's message history
            const channel = textChannels.get(channelId);
            if (channel) {
                channel.messages.push(chatMessage);
                if (channel.messages.length > MAX_MESSAGES) {
                    channel.messages.shift(); // Remove oldest message
                }

                // Broadcast to all clients
                io.emit('chat-message', chatMessage);
            }
        }
    });

    // Create text channel
    socket.on('create-text-channel', (data) => {
        const { channelName } = data;
        const user = users.get(socket.id);

        if (!user || !channelName) return;

        // Check if channel already exists
        if (textChannels.has(channelName)) {
            socket.emit('error', { message: 'Channel already exists' });
            return;
        }

        // Create new channel
        textChannels.set(channelName, {
            name: channelName,
            messages: []
        });

        console.log(`📝 ${user.username} created channel: #${channelName}`);

        // Broadcast to all users
        io.emit('text-channel-created', {
            channelId: channelName,
            channelName,
            createdBy: socket.id
        });
    });

    // Request messages for a specific channel
    socket.on('request-channel-messages', (data) => {
        const { channelId } = data;
        const channel = textChannels.get(channelId);

        if (channel) {
            socket.emit('channel-messages', {
                channelId,
                messages: channel.messages
            });
        }
    });

    // Handle user status change
    socket.on('status-change', (data) => {
        const { status } = data;
        const user = users.get(socket.id);

        if (user) {
            user.status = status;

            // Broadcast status change to all users
            io.emit('user-status-changed', {
                userId: socket.id,
                status
            });
        }
    });

    // Handle background image update
    socket.on('update-background', (data) => {
        const { backgroundImage } = data;
        const user = users.get(socket.id);

        if (user) {
            // Store background image (could be large base64 string)
            user.backgroundImage = backgroundImage;

            console.log(`🖼️ ${user.username} updated background image (${backgroundImage ? 'set' : 'removed'})`);

            // Broadcast to users in the same voice channel
            if (user.voiceChannel) {
                socket.to(user.voiceChannel).emit('user-background-updated', {
                    userId: socket.id,
                    username: user.username,
                    hasBackground: !!backgroundImage
                });
            }
        }
    });

    // Handle request for another user's background
    socket.on('request-user-background', (data) => {
        const { userId } = data;
        const targetUser = users.get(userId);
        const requestingUser = users.get(socket.id);

        if (targetUser && requestingUser && targetUser.backgroundImage) {
            console.log(`🖼️ ${requestingUser.username} requested ${targetUser.username}'s background`);

            socket.emit('user-background-data', {
                userId: targetUser.id,
                username: targetUser.username,
                backgroundImage: targetUser.backgroundImage
            });
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        const user = users.get(socket.id);

        if (user) {
            console.log(`❌ User disconnected: ${user.username || socket.id}`);

            // Remove from hub
            hubUsers.delete(socket.id);

            // Remove from voice channel
            if (user.voiceChannel) {
                const channel = voiceChannels.get(user.voiceChannel);
                if (channel) {
                    channel.delete(socket.id);
                    socket.to(user.voiceChannel).emit('user-left-voice', socket.id);
                }
            }

            // Notify others
            socket.broadcast.emit('user-left-hub', socket.id);
        }

        // Clean up user data
        users.delete(socket.id);
    });
});

// Chat messages endpoint
app.get('/api/messages', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const generalChannel = textChannels.get('general');
    const messages = generalChannel ? generalChannel.messages : [];
    const recentMessages = messages.slice(-limit);
    res.json({
        messages: recentMessages,
        count: recentMessages.length,
        total: messages.length
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    const voiceChannel = voiceChannels.get(VOICE_CHANNEL);
    const generalChannel = textChannels.get('general');
    res.json({
        status: 'ok',
        users: users.size,
        hubUsers: hubUsers.size,
        voiceChannel: {
            id: VOICE_CHANNEL,
            userCount: voiceChannel ? voiceChannel.size : 0
        },
        messageCount: generalChannel ? generalChannel.messages.length : 0,
        uptime: process.uptime()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.send('Proximity Signaling Server is running!');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n👋 Shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`\n✨ Proximity Signaling Server is running on port ${PORT}`);
        console.log(`📍 Health check: http://localhost:${PORT}/health`);
        console.log(`🎧 Ready for connections!\n`);
    });
}

module.exports = { server, io };
