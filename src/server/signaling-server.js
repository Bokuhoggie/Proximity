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

// ---------- Logging helpers ----------
// Every error log line includes the "bomboclat" marker so you can grep
// Railway logs for it: `railway logs | grep bomboclat`.

const ERR_MARKER = 'bomboclat';

function ts() {
    return new Date().toISOString();
}
function log(...args) {
    console.log(ts(), ...args);
}
function logError(label, err, extra = {}) {
    const detail = err && err.stack ? err.stack : String(err);
    console.error(
        ts(),
        `ERROR ${ERR_MARKER} [${label}]`,
        JSON.stringify(extra),
        '\n' + detail
    );
}

process.on('uncaughtException', (err) => logError('uncaughtException', err));
process.on('unhandledRejection', (err) => logError('unhandledRejection', err));

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 1e6
});

// ---------- HTTP ----------

// Per-request log line: status, method, path, latency, size, IP.
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - start;
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const len = res.getHeader('content-length') || '-';
        const tag = res.statusCode >= 500 ? `${ERR_MARKER} 5xx` : '';
        log(`HTTP ${res.statusCode} ${tag} ${req.method} ${req.url} ${ms}ms ${len}b ${ip}`);
    });
    next();
});

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
        users: uuidToSocket.size,
        profiles: profiles.size,
        voiceUsers: voiceChannel.size,
        messages: messages.length,
        uptime: process.uptime()
    });
});

app.get('/uploads/:id', (req, res, next) => {
    try {
        const safe = path.basename(req.params.id);
        const p = path.join(UPLOAD_DIR, safe);
        if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
        res.sendFile(p);
    } catch (err) {
        next(err);
    }
});

app.post('/upload', (req, res, next) => {
    try {
        const mime = (req.headers['content-type'] || '').split(';')[0].trim();
        if (!ALLOWED_MIME.has(mime)) {
            return res.status(415).json({ error: `Unsupported type: ${mime || 'missing'}` });
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
                res.status(413).json({ error: 'File too large (max 10 MB)' });
                req.destroy();
            } else {
                chunks.push(chunk);
            }
        });
        req.on('end', () => {
            if (aborted) return;
            const id = crypto.randomBytes(12).toString('hex') + ext;
            const filePath = path.join(UPLOAD_DIR, id);
            fs.writeFile(filePath, Buffer.concat(chunks), (err) => {
                if (err) {
                    logError('upload-write', err, { mime, total, filePath });
                    return res.status(500).json({ error: 'Write failed: ' + err.code });
                }
                log(`UPLOAD ok ${id} ${total}b ${mime}`);
                res.json({ id, url: `/uploads/${id}`, size: total, mime });
            });
        });
        req.on('error', (err) => {
            if (!aborted) {
                logError('upload-stream', err, { mime, total });
                res.status(500).json({ error: 'Stream error: ' + err.message });
            }
        });
    } catch (err) {
        next(err);
    }
});

// ---------- State ----------
//
// Identity model: every user has a stable UUID generated on the client
// and persisted to localStorage. The UUID is the *only* identifier used
// in messages, voice membership, and on the wire from the client's POV.
// socket.id is connection-scoped — it changes on reconnect — so we keep
// translation tables to route socket.io events without leaking it to
// clients.
//
// profiles is the source of truth for display info (name, color, avatar).
// Messages reference userId (= UUID) only; clients render by looking up
// the current profile, so renames retroactively update old messages.

const profiles = new Map();        // uuid -> { id, username, color, avatarUrl }
const socketToUuid = new Map();    // socket.id -> uuid (current connection)
const uuidToSocket = new Map();    // uuid -> socket.id (current connection)
const voiceChannel = new Set();    // uuids currently in voice
const messages = [];               // ring buffer { id, userId, text, imageUrl, ts }

function publicProfile(p) {
    return p ? { id: p.id, username: p.username, color: p.color, avatarUrl: p.avatarUrl || null } : null;
}

function uuidOf(socketId) { return socketToUuid.get(socketId); }
function socketOf(uuid) { return uuidToSocket.get(uuid); }

// ---------- HTTP error handler (must be after all routes) ----------

app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});
app.use((err, req, res, _next) => {
    logError('http', err, { method: req.method, url: req.url });
    if (res.headersSent) return;
    res.status(500).json({ error: err.message || 'Internal error' });
});

// ---------- Socket.IO ----------

// Wrap a socket event handler so any thrown error is logged with the
// event name and surfaced back to that client as a server-error event,
// instead of disconnecting them with no explanation.
function safe(socket, event, fn) {
    socket.on(event, async (...args) => {
        try {
            await fn(...args);
        } catch (err) {
            logError('socket-' + event, err, { socketId: socket.id });
            socket.emit('server-error', {
                event,
                message: err.message || 'Server error'
            });
        }
    });
}

io.on('connection', (socket) => {
    log(`[+] socket ${socket.id} connected`);

    safe(socket, 'join', ({ id, username, color, avatarUrl }) => {
        if (!id || typeof id !== 'string') throw new Error('join: id (uuid) required');
        if (!username || typeof username !== 'string') {
            throw new Error('join: username required');
        }

        // If this UUID was already connected on a different socket, kick
        // the old connection cleanly. Prevents a "ghost" peer in voice if
        // the client reconnects before the old socket times out.
        const oldSocketId = uuidToSocket.get(id);
        if (oldSocketId && oldSocketId !== socket.id) {
            const oldSocket = io.sockets.sockets.get(oldSocketId);
            if (oldSocket) oldSocket.disconnect(true);
            socketToUuid.delete(oldSocketId);
        }

        const profile = {
            id,
            username: username.slice(0, 32),
            color: color || '#7aa2f7',
            avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : null
        };
        profiles.set(id, profile);
        socketToUuid.set(socket.id, id);
        uuidToSocket.set(id, socket.id);

        socket.emit('hello', {
            you: publicProfile(profile),
            profiles: Array.from(profiles.values()).map(publicProfile),
            voiceUsers: Array.from(voiceChannel),
            messages: messages.slice(-MAX_MESSAGES)
        });

        // Tell others about the (possibly updated) profile.
        socket.broadcast.emit('profile-updated', publicProfile(profile));
        log(`    ${profile.username} joined (${profiles.size} profiles, ${uuidToSocket.size} online)`);
    });

    safe(socket, 'update-profile', ({ username, color, avatarUrl }) => {
        const uuid = uuidOf(socket.id);
        if (!uuid) throw new Error('update-profile: not joined yet');
        const profile = profiles.get(uuid);
        if (!profile) throw new Error('update-profile: profile missing');

        if (typeof username === 'string' && username.trim()) {
            profile.username = username.trim().slice(0, 32);
        }
        if (typeof color === 'string') profile.color = color;
        if (typeof avatarUrl === 'string' || avatarUrl === null) {
            profile.avatarUrl = avatarUrl || null;
        }

        io.emit('profile-updated', publicProfile(profile));
        log(`    profile updated: ${profile.username} (${uuid.slice(0, 8)}…)`);
    });

    safe(socket, 'chat', ({ text, imageUrl }) => {
        const uuid = uuidOf(socket.id);
        if (!uuid) throw new Error('chat: not joined yet');
        const cleanText = (typeof text === 'string') ? text.slice(0, 2000) : '';
        const cleanImage = (typeof imageUrl === 'string' && imageUrl.startsWith('/uploads/'))
            ? imageUrl : null;
        if (!cleanText && !cleanImage) return;

        const msg = {
            id: `${uuid}-${Date.now()}`,
            userId: uuid,
            text: cleanText,
            imageUrl: cleanImage,
            ts: Date.now()
        };
        messages.push(msg);
        if (messages.length > MAX_MESSAGES) messages.shift();
        io.emit('chat', msg);
    });

    safe(socket, 'voice-join', () => {
        const uuid = uuidOf(socket.id);
        if (!uuid) throw new Error('voice-join: not joined yet');
        if (voiceChannel.has(uuid)) return;
        voiceChannel.add(uuid);

        const others = Array.from(voiceChannel).filter(id => id !== uuid);
        socket.emit('voice-peers', others);
        socket.broadcast.emit('voice-user-joined', uuid);
        log(`    voice-join ${uuid.slice(0, 8)}… (${voiceChannel.size} in voice)`);
    });

    safe(socket, 'voice-leave', () => {
        const uuid = uuidOf(socket.id);
        if (!uuid || !voiceChannel.delete(uuid)) return;
        socket.broadcast.emit('voice-user-left', uuid);
        log(`    voice-leave ${uuid.slice(0, 8)}…`);
    });

    // WebRTC signaling — `to` is a UUID, server resolves to socket.id.
    safe(socket, 'rtc-offer', ({ to, offer }) => {
        const fromUuid = uuidOf(socket.id);
        const targetSocket = socketOf(to);
        if (!fromUuid || !targetSocket) return;
        io.to(targetSocket).emit('rtc-offer', { from: fromUuid, offer });
    });
    safe(socket, 'rtc-answer', ({ to, answer }) => {
        const fromUuid = uuidOf(socket.id);
        const targetSocket = socketOf(to);
        if (!fromUuid || !targetSocket) return;
        io.to(targetSocket).emit('rtc-answer', { from: fromUuid, answer });
    });
    safe(socket, 'rtc-ice', ({ to, candidate }) => {
        const fromUuid = uuidOf(socket.id);
        const targetSocket = socketOf(to);
        if (!fromUuid || !targetSocket) return;
        io.to(targetSocket).emit('rtc-ice', { from: fromUuid, candidate });
    });

    safe(socket, 'mic-status', ({ muted }) => {
        const uuid = uuidOf(socket.id);
        if (!uuid) return;
        socket.broadcast.emit('mic-status', { userId: uuid, muted: !!muted });
    });

    socket.on('error', (err) => {
        logError('socket-error', err, { socketId: socket.id });
    });

    socket.on('disconnect', (reason) => {
        const uuid = uuidOf(socket.id);
        socketToUuid.delete(socket.id);
        if (uuid) {
            // Only clear the uuid→socket mapping if this socket is still
            // the one registered for it (a fresh login on a new socket
            // will have already overwritten it).
            if (uuidToSocket.get(uuid) === socket.id) {
                uuidToSocket.delete(uuid);
                if (voiceChannel.delete(uuid)) {
                    socket.broadcast.emit('voice-user-left', uuid);
                }
                socket.broadcast.emit('user-disconnected', uuid);
            }
            const profile = profiles.get(uuid);
            log(`[-] ${profile?.username || uuid.slice(0, 8)}… disconnected (${reason})`);
        } else {
            log(`[-] socket ${socket.id} disconnected (${reason})`);
        }
    });
});

io.engine.on('connection_error', (err) => {
    logError('engine.connection_error', err, {
        code: err.code, message: err.message, context: err.context
    });
});

// ---------- Boot ----------

if (require.main === module) {
    server.listen(PORT, () => {
        log(`Proximity server listening on :${PORT}`);
        log(`  health: http://localhost:${PORT}/health`);
    });
}

module.exports = { app, server, io };
