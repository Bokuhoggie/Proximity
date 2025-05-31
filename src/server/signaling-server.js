const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const rooms = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (data) => {
        const { roomId, username } = data;
        console.log(`User ${socket.id} (${username}) joining room ${roomId}`);
        socket.join(roomId);
        
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Map());
        }
        
        const roomUsers = rooms.get(roomId);
        
        // Get existing users before adding new one
        const existingUsers = Array.from(roomUsers.entries()).map(([userId, userData]) => ({
            userId,
            username: userData.username,
            position: userData.position
        }));
        
        // Add new user to room with default position
        roomUsers.set(socket.id, {
            username: username || 'Anonymous',
            position: { x: 100, y: 100 }, // Default spawn position
            lastUpdate: Date.now()
        });

        // Notify existing users that new user joined
        socket.to(roomId).emit('user-joined', {
            userId: socket.id,
            username: username || 'Anonymous'
        });

        // Send list of existing users to the new participant
        socket.emit('room-users', existingUsers);
        
        console.log(`Room ${roomId} now has ${roomUsers.size} users`);
    });

    socket.on('position-update', ({ roomId, x, y }) => {
        console.log(`Position update from ${socket.id}: x=${x}, y=${y} in room ${roomId}`);
        
        if (rooms.has(roomId)) {
            const roomUsers = rooms.get(roomId);
            if (roomUsers.has(socket.id)) {
                const userData = roomUsers.get(socket.id);
                userData.position = { x, y };
                userData.lastUpdate = Date.now();
                
                // Broadcast position update to other users in the room
                socket.to(roomId).emit('position-update', {
                    userId: socket.id,
                    x,
                    y
                });
            }
        }
    });

    socket.on('offer', ({ target, offer }) => {
        console.log(`Forwarding offer from ${socket.id} to ${target}`);
        io.to(target).emit('offer', {
            offer,
            from: socket.id
        });
    });

    socket.on('answer', ({ target, answer }) => {
        console.log(`Forwarding answer from ${socket.id} to ${target}`);
        io.to(target).emit('answer', {
            answer,
            from: socket.id
        });
    });

    socket.on('ice-candidate', ({ target, candidate }) => {
        console.log(`Forwarding ICE candidate from ${socket.id} to ${target}`);
        io.to(target).emit('ice-candidate', {
            candidate,
            from: socket.id
        });
    });

    socket.on('mic-status', ({ roomId, isMuted }) => {
        console.log(`User ${socket.id} mic status: ${isMuted ? 'muted' : 'unmuted'}`);
        socket.to(roomId).emit('user-mic-status', { userId: socket.id, isMuted });
        
        // Update user data with mic status
        if (rooms.has(roomId)) {
            const roomUsers = rooms.get(roomId);
            if (roomUsers.has(socket.id)) {
                roomUsers.get(socket.id).isMuted = isMuted;
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Find and leave all rooms
        rooms.forEach((roomUsers, roomId) => {
            if (roomUsers.has(socket.id)) {
                const userData = roomUsers.get(socket.id);
                roomUsers.delete(socket.id);
                
                socket.to(roomId).emit('user-left', {
                    userId: socket.id,
                    username: userData.username
                });
                
                console.log(`User ${socket.id} (${userData.username}) left room ${roomId}, ${roomUsers.size} users remaining`);
                
                if (roomUsers.size === 0) {
                    console.log(`Room ${roomId} is now empty, deleting`);
                    rooms.delete(roomId);
                }
            }
        });
    });

    // Handle server creation/management
    socket.on('create-server', ({ serverName, serverDescription }) => {
        console.log(`User ${socket.id} creating server: ${serverName}`);
        
        // In a real implementation, you'd save this to a database
        const serverId = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        socket.emit('server-created', {
            serverId,
            serverName,
            serverDescription,
            owner: socket.id
        });
    });

    // Handle room activity monitoring (for cleaning up inactive rooms)
    socket.on('room-activity', ({ roomId }) => {
        if (rooms.has(roomId)) {
            const roomUsers = rooms.get(roomId);
            if (roomUsers.has(socket.id)) {
                roomUsers.get(socket.id).lastActivity = Date.now();
            }
        }
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

// Clean up inactive users periodically
setInterval(() => {
    const now = Date.now();
    const INACTIVE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
    
    rooms.forEach((roomUsers, roomId) => {
        const inactiveUsers = [];
        
        roomUsers.forEach((userData, userId) => {
            if (now - userData.lastUpdate > INACTIVE_TIMEOUT) {
                inactiveUsers.push(userId);
            }
        });
        
        inactiveUsers.forEach(userId => {
            console.log(`Removing inactive user ${userId} from room ${roomId}`);
            roomUsers.delete(userId);
            
            // Notify other users
            io.to(roomId).emit('user-left', {
                userId,
                username: 'Disconnected User'
            });
        });
        
        if (roomUsers.size === 0) {
            console.log(`Cleaning up empty room ${roomId}`);
            rooms.delete(roomId);
        }
    });
}, 60000); // Check every minute

// API endpoint to get room statistics
app.get('/api/stats', (req, res) => {
    const stats = {
        totalRooms: rooms.size,
        totalUsers: Array.from(rooms.values()).reduce((total, roomUsers) => total + roomUsers.size, 0),
        rooms: Array.from(rooms.entries()).map(([roomId, roomUsers]) => ({
            roomId,
            userCount: roomUsers.size,
            users: Array.from(roomUsers.entries()).map(([userId, userData]) => ({
                userId: userId.slice(0, 8) + '...',
                username: userData.username,
                position: userData.position,
                lastUpdate: new Date(userData.lastUpdate).toISOString()
            }))
        }))
    };
    
    res.json(stats);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        rooms: rooms.size
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Room stats: http://localhost:${PORT}/api/stats`);
});