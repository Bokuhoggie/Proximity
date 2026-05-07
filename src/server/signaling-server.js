// Proximity signaling server
// Responsibilities:
//   - relay socket.io events between peers (chat, presence, WebRTC SDP/ICE)
//   - serve uploaded images over HTTP
//   - keep a small in-memory ring buffer of recent chat messages
//
// Designed for ~10 friends. No DB, no auth.

const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const socketIO = require('socket.io');

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_MESSAGES = 200;

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 1e6
});

// ---------- HTTP ----------

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Filename');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

app.get('/', (_req, res) => res.send('Proximity signaling server'));

app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        users: users.size,
        voiceUsers: voiceChannel.size,
        messages: messages.length,
        uptime: process.uptime()
    });
});

app.get('/uploads/:id', (req, res) => {
    const safe = path.basename(req.params.id);
    const p = path.join(UPLOAD_DIR, safe);
    if (!fs.existsSync(p)) return res.sendStatus(404);
    res.sendFile(p);
});

app.post('/upload', (req, res) => {
    const mime = (req.headers['content-type'] || '').split(';')[0].trim();
    if (!ALLOWED_MIME.has(mime)) {
        return res.status(415).json({ error: 'Unsupported file type' });
    }
    const filenameHeader = req.headers['x-filename'] || 'upload';
    const ext = path.extname(filenameHeader).toLowerCase().slice(0, 8) ||
        ('.' + mime.split('/')[1]);

    const chunks = [];
    let total = 0;
    let aborted = false;

    req.on('data', (chunk) => {
        total += chunk.length;
        if (total > MAX_UPLOAD_BYTES) {
            aborted = true;
            res.status(413).json({ error: 'File too large' });
            req.destroy();
            return;
        }
        chunks.push(chunk);
    });
    req.on('end', () => {
        if (aborted) return;
        const id = crypto.randomBytes(12).toString('hex') + ext;
        const filePath = path.join(UPLOAD_DIR, id);
        fs.writeFile(filePath, Buffer.concat(chunks), (err) => {
            if (err) return res.status(500).json({ error: 'Write failed' });
            res.json({ id, url: `/uploads/${id}`, size: total, mime });
        });
    });
    req.on('error', () => { if (!aborted) res.sendStatus(500); });
});

// ---------- State ----------

const users = new Map();           // socketId -> { id, username, color }
const voiceChannel = new Set();    // socketIds currently in voice
const messages = [];               // ring buffer of recent chat messages

function publicUser(u) {
    return { id: u.id, username: u.username, color: u.color };
}

// ---------- Socket.IO ----------

io.on('connection', (socket) => {
    console.log(`[+] ${socket.id} connected`);

    socket.on('join', ({ username, color }) => {
        if (!username || typeof username !== 'string') return;
        const user = {
            id: socket.id,
            username: username.slice(0, 32),
            color: color || '#7aa2f7'
        };
        users.set(socket.id, user);

        // Tell the new user about everyone else + chat history
        socket.emit('hello', {
            you: publicUser(user),
            users: Array.from(users.values()).map(publicUser),
            voiceUsers: Array.from(voiceChannel),
            messages: messages.slice(-MAX_MESSAGES)
        });

        // Tell everyone else about the new user
        socket.broadcast.emit('user-joined', publicUser(user));
        console.log(`    ${user.username} joined`);
    });

    socket.on('chat', ({ text, imageUrl }) => {
        const user = users.get(socket.id);
        if (!user) return;
        const cleanText = (typeof text === 'string') ? text.slice(0, 2000) : '';
        const cleanImage = (typeof imageUrl === 'string' && imageUrl.startsWith('/uploads/'))
            ? imageUrl : null;
        if (!cleanText && !cleanImage) return;

        const msg = {
            id: `${socket.id}-${Date.now()}`,
            userId: socket.id,
            username: user.username,
            color: user.color,
            text: cleanText,
            imageUrl: cleanImage,
            ts: Date.now()
        };
        messages.push(msg);
        if (messages.length > MAX_MESSAGES) messages.shift();
        io.emit('chat', msg);
    });

    // ---- Voice channel ----

    socket.on('voice-join', () => {
        if (!users.get(socket.id) || voiceChannel.has(socket.id)) return;
        voiceChannel.add(socket.id);

        // Tell the joiner who's already there. The joiner will offer to each.
        const others = Array.from(voiceChannel).filter(id => id !== socket.id);
        socket.emit('voice-peers', others);

        // Tell the existing peers someone joined (they should NOT offer).
        socket.broadcast.emit('voice-user-joined', socket.id);
        console.log(`    ${socket.id} joined voice (${voiceChannel.size} total)`);
    });

    socket.on('voice-leave', () => {
        if (!voiceChannel.delete(socket.id)) return;
        socket.broadcast.emit('voice-user-left', socket.id);
        console.log(`    ${socket.id} left voice`);
    });

    // WebRTC signaling — pure relay
    socket.on('rtc-offer', ({ to, offer }) => {
        io.to(to).emit('rtc-offer', { from: socket.id, offer });
    });
    socket.on('rtc-answer', ({ to, answer }) => {
        io.to(to).emit('rtc-answer', { from: socket.id, answer });
    });
    socket.on('rtc-ice', ({ to, candidate }) => {
        io.to(to).emit('rtc-ice', { from: socket.id, candidate });
    });

    socket.on('mic-status', ({ muted }) => {
        if (!users.get(socket.id)) return;
        socket.broadcast.emit('mic-status', { userId: socket.id, muted: !!muted });
    });

    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (voiceChannel.delete(socket.id)) {
            socket.broadcast.emit('voice-user-left', socket.id);
        }
        if (user) {
            socket.broadcast.emit('user-left', socket.id);
            console.log(`[-] ${user.username} disconnected`);
        }
        users.delete(socket.id);
    });
});

// ---------- Boot ----------

if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`Proximity server listening on :${PORT}`);
        console.log(`  health: http://localhost:${PORT}/health`);
    });
}

module.exports = { app, server, io };
