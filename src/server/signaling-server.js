const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const Redis = require('ioredis');

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

// Connect to Redis
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
redis.on('connect', () => console.log('✅ Connected to Redis'));
redis.on('error', (err) => console.error('❌ Redis Connection Error', err));


// Store connected users and their states
const users = new Map();
const hubUsers = new Set();
const voiceChannels = new Map(); // channelId -> Set of userIds

// Initialize single voice channel
const VOICE_CHANNEL = 'voice';
voiceChannels.set(VOICE_CHANNEL, new Set());

// Chat channel
const CHAT_CHANNEL = 'general';

console.log('🚀 Proximity Signaling Server starting...');
console.log(`📡 Port: ${PORT}`);
console.log(`🔊 Voice Channel: ${VOICE_CHANNEL}`);
console.log(`💬 Text Channel: ${CHAT_CHANNEL}`);

io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.id}`);

    // Initialize user data
    users.set(socket.id, {
        id: socket.id,
        username: null,
        userColor: null,
        isMuted: false,
        position: { x: 400, y: 300 }, // Default center position
        voiceChannel: null,
        status: 'online'
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
                        isMuted: u.isMuted
                    };
                });

            // Send list of users in channel to the joining user
            socket.emit('voice-channel-users', usersInChannel);

            // Notify others in the channel about the new user
            socket.to(channelId).emit('user-joined-voice', {
                id: socket.id,
                username: user.username,
                userColor: user.userColor,
                position: user.position,
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

    // Handle chat messages
    socket.on('send-chat-message', async (data) => {
        const { content } = data;
        const user = users.get(socket.id);

        if (user && content) {
            const message = {
                id: `${socket.id}-${Date.now()}`,
                userId: socket.id,
                username: user.username,
                userColor: user.userColor,
                content,
                timestamp: Date.now(),
                channelId: CHAT_CHANNEL
            };

            // Store message in Redis
            await redis.lpush(`chat:${CHAT_CHANNEL}`, JSON.stringify(message));

            console.log(`💬 ${user.username}: ${content.substring(0, 50)}`);

            // Broadcast message to all connected clients
            io.emit('chat-message', message);
        }
    });

    // Handle message deletion
    socket.on('delete-message', async (data) => {
        const { messageId } = data;
        const user = users.get(socket.id);

        if (user) {
            // Find the message to be deleted
            const messages = await redis.lrange(`chat:${CHAT_CHANNEL}`, 0, -1);
            let messageToDelete = null;
            let messageIndex = -1;

            const parsedMessages = messages.map(m => JSON.parse(m));

            for (let i = 0; i < parsedMessages.length; i++) {
                if (parsedMessages[i].id === messageId) {
                    messageToDelete = parsedMessages[i];
                    messageIndex = i;
                    break;
                }
            }

            if (messageToDelete && messageToDelete.userId === user.id) {
                // To "delete" a message from a list, we set a temporary value and then remove it.
                const placeholder = `__DELETED__${Date.now()}`;
                await redis.lset(`chat:${CHAT_CHANNEL}`, messageIndex, placeholder);
                await redis.lrem(`chat:${CHAT_CHANNEL}`, 1, placeholder);


                console.log(`🗑️ Message deleted: ${messageId}`);

                // Notify all clients
                io.emit('message-deleted', { messageId, channelId: CHAT_CHANNEL });
            }
        }
    });

    // Handle requesting chat history
    socket.on('request-chat-history', async () => {
        const messagesJSON = await redis.lrange(`chat:${CHAT_CHANNEL}`, 0, -1);
        const messages = messagesJSON.map(m => JSON.parse(m)).reverse(); // reverse to show oldest first
        socket.emit('chat-history', { channelId: CHAT_CHANNEL, messages: messages });
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

// Health check endpoint
app.get('/health', async (req, res) => {
    const voiceChannel = voiceChannels.get(VOICE_CHANNEL);
    const messageCount = await redis.llen(`chat:${CHAT_CHANNEL}`);
    res.json({
        status: 'ok',
        users: users.size,
        hubUsers: hubUsers.size,
        voiceChannel: {
            id: VOICE_CHANNEL,
            userCount: voiceChannel ? voiceChannel.size : 0
        },
        chatChannel: CHAT_CHANNEL,
        messageCount,
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
    redis.quit();
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

module.exports = { server, io, redis };
