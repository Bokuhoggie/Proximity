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
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_MESSAGES_PER_CHANNEL = 200;
const MAX_TEXT_CHANNELS = 10;
const MAX_VOICE_CHANNELS = 5;
const MAX_CHANNEL_NAME = 32;
const STATE_WRITE_DEBOUNCE_MS = 1500;

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

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
    let totalMessages = 0;
    let totalVoice = 0;
    for (const c of textChannels.values()) totalMessages += c.messages.length;
    for (const c of voiceChannels.values()) totalVoice += c.members.size;
    res.json({
        status: 'ok',
        online: uuidToSocket.size,
        profiles: profiles.size,
        textChannels: textChannels.size,
        voiceChannels: voiceChannels.size,
        voiceUsers: totalVoice,
        messages: totalMessages,
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
//
// Channels: text and voice channels are independent collections. Each
// text channel owns a ring buffer of messages. Each voice channel owns
// a Set of UUIDs currently in it. A user can be in at most one voice
// channel at a time.
//
// Persistence: profiles + channels (incl. messages) are written to
// data/state.json on a debounce. uploads/ holds image files. Both
// directories should be on a Railway Volume to survive redeploys.

const profiles = new Map();        // uuid -> profile
const socketToUuid = new Map();    // socket.id -> uuid
const uuidToSocket = new Map();    // uuid -> socket.id
const userVoiceChannel = new Map(); // uuid -> voiceChannelId

// channelId -> { id, name, messages[], createdBy, createdAt }
const textChannels = new Map();
// channelId -> { id, name, members: Set<uuid>, createdBy, createdAt }
const voiceChannels = new Map();

function publicProfile(p) {
    return p ? { id: p.id, username: p.username, color: p.color, avatarUrl: p.avatarUrl || null } : null;
}

function publicTextChannel(c) {
    return {
        id: c.id, name: c.name, createdBy: c.createdBy, createdAt: c.createdAt,
        messages: c.messages.slice(-MAX_MESSAGES_PER_CHANNEL)
    };
}
function publicVoiceChannel(c) {
    return {
        id: c.id, name: c.name, createdBy: c.createdBy, createdAt: c.createdAt,
        members: Array.from(c.members)
    };
}

function uuidOf(socketId) { return socketToUuid.get(socketId); }
function socketOf(uuid) { return uuidToSocket.get(uuid); }

function makeChannelId(prefix) {
    return prefix + '-' + crypto.randomBytes(6).toString('hex');
}

// ---------- Persistence ----------

let stateWriteTimer = null;
function scheduleStateWrite() {
    if (stateWriteTimer) return;
    stateWriteTimer = setTimeout(() => {
        stateWriteTimer = null;
        writeStateNow();
    }, STATE_WRITE_DEBOUNCE_MS);
}
function writeStateNow() {
    const snapshot = {
        version: 1,
        profiles: Array.from(profiles.values()),
        textChannels: Array.from(textChannels.values()).map(c => ({
            id: c.id, name: c.name, createdBy: c.createdBy, createdAt: c.createdAt,
            messages: c.messages.slice(-MAX_MESSAGES_PER_CHANNEL)
        })),
        voiceChannels: Array.from(voiceChannels.values()).map(c => ({
            id: c.id, name: c.name, createdBy: c.createdBy, createdAt: c.createdAt
        }))
    };
    const tmp = STATE_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(snapshot), (err) => {
        if (err) return logError('state-write', err, { path: tmp });
        fs.rename(tmp, STATE_FILE, (err2) => {
            if (err2) logError('state-rename', err2, { from: tmp, to: STATE_FILE });
        });
    });
}
function loadState() {
    try {
        if (!fs.existsSync(STATE_FILE)) return false;
        const snapshot = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        if (snapshot.version !== 1) return false;
        for (const p of snapshot.profiles || []) profiles.set(p.id, p);
        for (const c of snapshot.textChannels || []) {
            textChannels.set(c.id, { ...c, messages: c.messages || [] });
        }
        for (const c of snapshot.voiceChannels || []) {
            voiceChannels.set(c.id, { ...c, members: new Set() });
        }
        log(`loaded state: ${profiles.size} profiles, ${textChannels.size} text, ${voiceChannels.size} voice`);
        return true;
    } catch (err) {
        logError('state-load', err);
        return false;
    }
}

function ensureDefaultChannels() {
    if (textChannels.size === 0) {
        const id = 'general';
        textChannels.set(id, {
            id, name: 'general', messages: [],
            createdBy: null, createdAt: Date.now()
        });
    }
    if (voiceChannels.size === 0) {
        const id = 'voice';
        voiceChannels.set(id, {
            id, name: 'Voice', members: new Set(),
            createdBy: null, createdAt: Date.now()
        });
    }
}

loadState();
ensureDefaultChannels();

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
            textChannels: Array.from(textChannels.values()).map(publicTextChannel),
            voiceChannels: Array.from(voiceChannels.values()).map(publicVoiceChannel)
        });

        socket.broadcast.emit('profile-updated', publicProfile(profile));
        scheduleStateWrite();
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
        scheduleStateWrite();
        log(`    profile updated: ${profile.username} (${uuid.slice(0, 8)}…)`);
    });

    safe(socket, 'chat', ({ channelId, text, imageUrl }) => {
        const uuid = uuidOf(socket.id);
        if (!uuid) throw new Error('chat: not joined yet');
        const channel = textChannels.get(channelId);
        if (!channel) throw new Error(`chat: unknown text channel ${channelId}`);

        const cleanText = (typeof text === 'string') ? text.slice(0, 2000) : '';
        const cleanImage = (typeof imageUrl === 'string' && imageUrl.startsWith('/uploads/'))
            ? imageUrl : null;
        if (!cleanText && !cleanImage) return;

        const msg = {
            id: `${uuid}-${Date.now()}`,
            channelId,
            userId: uuid,
            text: cleanText,
            imageUrl: cleanImage,
            ts: Date.now()
        };
        channel.messages.push(msg);
        if (channel.messages.length > MAX_MESSAGES_PER_CHANNEL) channel.messages.shift();
        io.emit('chat', msg);
        scheduleStateWrite();
    });

    safe(socket, 'create-text-channel', ({ name }) => {
        const uuid = uuidOf(socket.id);
        if (!uuid) throw new Error('not joined');
        if (textChannels.size >= MAX_TEXT_CHANNELS) {
            throw new Error(`Text channel limit reached (${MAX_TEXT_CHANNELS})`);
        }
        const cleanName = sanitizeChannelName(name);
        const id = makeChannelId('t');
        const channel = {
            id, name: cleanName, messages: [],
            createdBy: uuid, createdAt: Date.now()
        };
        textChannels.set(id, channel);
        io.emit('text-channel-created', publicTextChannel(channel));
        scheduleStateWrite();
        log(`    text channel created: #${cleanName} (${id})`);
    });

    safe(socket, 'create-voice-channel', ({ name }) => {
        const uuid = uuidOf(socket.id);
        if (!uuid) throw new Error('not joined');
        if (voiceChannels.size >= MAX_VOICE_CHANNELS) {
            throw new Error(`Voice channel limit reached (${MAX_VOICE_CHANNELS})`);
        }
        const cleanName = sanitizeChannelName(name);
        const id = makeChannelId('v');
        const channel = {
            id, name: cleanName, members: new Set(),
            createdBy: uuid, createdAt: Date.now()
        };
        voiceChannels.set(id, channel);
        io.emit('voice-channel-created', publicVoiceChannel(channel));
        scheduleStateWrite();
        log(`    voice channel created: ${cleanName} (${id})`);
    });

    safe(socket, 'voice-join', ({ channelId }) => {
        const uuid = uuidOf(socket.id);
        if (!uuid) throw new Error('voice-join: not joined yet');
        const channel = voiceChannels.get(channelId);
        if (!channel) throw new Error(`voice-join: unknown channel ${channelId}`);

        // Leave previous voice channel first.
        const prevId = userVoiceChannel.get(uuid);
        if (prevId && prevId !== channelId) {
            const prev = voiceChannels.get(prevId);
            if (prev) {
                prev.members.delete(uuid);
                io.emit('voice-channel-member-left', { channelId: prevId, userId: uuid });
            }
        }

        if (channel.members.has(uuid)) return;
        channel.members.add(uuid);
        userVoiceChannel.set(uuid, channelId);

        const others = Array.from(channel.members).filter(id => id !== uuid);
        socket.emit('voice-peers', { channelId, peers: others });
        io.emit('voice-channel-member-joined', { channelId, userId: uuid });
        log(`    voice-join ${uuid.slice(0, 8)}… → ${channel.name} (${channel.members.size})`);
    });

    safe(socket, 'voice-leave', () => {
        const uuid = uuidOf(socket.id);
        if (!uuid) return;
        const channelId = userVoiceChannel.get(uuid);
        if (!channelId) return;
        const channel = voiceChannels.get(channelId);
        userVoiceChannel.delete(uuid);
        if (channel) {
            channel.members.delete(uuid);
            io.emit('voice-channel-member-left', { channelId, userId: uuid });
        }
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
        if (uuid && uuidToSocket.get(uuid) === socket.id) {
            uuidToSocket.delete(uuid);
            const channelId = userVoiceChannel.get(uuid);
            if (channelId) {
                userVoiceChannel.delete(uuid);
                const channel = voiceChannels.get(channelId);
                if (channel) {
                    channel.members.delete(uuid);
                    socket.broadcast.emit('voice-channel-member-left', { channelId, userId: uuid });
                }
            }
            socket.broadcast.emit('user-disconnected', uuid);
        }
        const profile = uuid ? profiles.get(uuid) : null;
        log(`[-] ${profile?.username || socket.id} disconnected (${reason})`);
    });
});

function sanitizeChannelName(name) {
    if (typeof name !== 'string') throw new Error('channel name required');
    const trimmed = name.trim().slice(0, MAX_CHANNEL_NAME);
    if (!trimmed) throw new Error('channel name required');
    return trimmed;
}

io.engine.on('connection_error', (err) => {
    logError('engine.connection_error', err, {
        code: err.code, message: err.message, context: err.context
    });
});

// ---------- Boot ----------

function shutdown(signal) {
    log(`Received ${signal}, flushing state…`);
    if (stateWriteTimer) {
        clearTimeout(stateWriteTimer);
        stateWriteTimer = null;
    }
    writeStateNow();
    setTimeout(() => process.exit(0), 200);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (require.main === module) {
    server.listen(PORT, () => {
        log(`Proximity server listening on :${PORT}`);
        log(`  health: http://localhost:${PORT}/health`);
    });
}

module.exports = { app, server, io };
