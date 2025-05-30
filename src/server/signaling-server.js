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

    socket.on('join-room', (roomId) => {
        console.log(`User ${socket.id} joining room ${roomId}`);
        socket.join(roomId);
        
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        
        // Get existing users before adding new one
        const existingUsers = Array.from(rooms.get(roomId));
        
        // Add new user to room
        rooms.get(roomId).add(socket.id);

        // Notify existing users that new user joined
        socket.to(roomId).emit('user-joined', socket.id);

        // Send list of existing users to the new participant
        socket.emit('room-users', existingUsers);
        
        console.log(`Room ${roomId} now has ${rooms.get(roomId).size} users`);
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
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Find and leave all rooms
        rooms.forEach((users, roomId) => {
            if (users.has(socket.id)) {
                users.delete(socket.id);
                socket.to(roomId).emit('user-left', socket.id);
                
                console.log(`User ${socket.id} left room ${roomId}, ${users.size} users remaining`);
                
                if (users.size === 0) {
                    console.log(`Room ${roomId} is now empty, deleting`);
                    rooms.delete(roomId);
                }
            }
        });
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});