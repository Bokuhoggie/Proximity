// Proximity client controller.
// Handles: connect → join → text chat → voice channel → image upload.

import { AudioManager } from './audio.js';

const RAILWAY_URL = 'https://proximityserver-production.up.railway.app';
const LOCAL_URL = 'http://localhost:3000';

const COLORS = ['#7aa2f7', '#9ece6a', '#f7768e', '#e0af68', '#bb9af7', '#7dcfff', '#ff9e64', '#73daca'];

const state = {
    socket: null,
    serverUrl: null,
    me: null,            // { id, username, color }
    users: new Map(),    // userId -> { id, username, color }
    inVoice: false,
    voicePeers: new Set(),
    audio: null
};

// ---------- DOM helpers ----------

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    for (const c of children) {
        if (c == null) continue;
        node.append(c.nodeType ? c : document.createTextNode(c));
    }
    return node;
};

function notify(msg) {
    console.log('[app]', msg);
    toast(msg);
}

function toast(msg, ttlMs = 4500) {
    let host = $('#toastHost');
    if (!host) {
        host = el('div', { id: 'toastHost', className: 'toast-host' });
        document.body.append(host);
    }
    const t = el('div', { className: 'toast' }, String(msg));
    host.append(t);
    setTimeout(() => t.remove(), ttlMs);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- Boot ----------

window.addEventListener('DOMContentLoaded', () => {
    const profile = loadOrCreateProfile();
    setupChatComposer();
    setupVoiceControls();
    renderUserList();
    renderVoiceList();
    connectAndJoin(profile.username, profile.color);
});

function loadOrCreateProfile() {
    try {
        const saved = JSON.parse(localStorage.getItem('proximity-profile') || '{}');
        if (saved.username && saved.color) return saved;
    } catch {}
    const profile = {
        username: 'friend-' + Math.random().toString(36).slice(2, 6),
        color: COLORS[Math.floor(Math.random() * COLORS.length)]
    };
    localStorage.setItem('proximity-profile', JSON.stringify(profile));
    return profile;
}

// ---------- Connection ----------

async function connectAndJoin(username, color) {
    showStatus('Connecting…');
    let url = await pickServer();
    while (!url) {
        showStatus('Server unreachable. Retrying in 5s…\n(Run "npm run server" in another terminal if you\'re local.)');
        await sleep(5000);
        url = await pickServer();
    }
    state.serverUrl = url;

    const socket = io(url, { transports: ['websocket', 'polling'], timeout: 8000 });
    state.socket = socket;

    socket.on('connect', () => {
        console.log('[socket] connected', socket.id, '→', url);
        socket.emit('join', { username, color });
    });

    socket.on('connect_error', (err) => {
        console.error('[socket] connect_error bomboclat', err.message, err.description || '');
        toast('Connect error: ' + err.message);
    });

    socket.on('server-error', ({ event, message }) => {
        console.error('[socket] server-error bomboclat', event, message);
        toast(`Server error (${event}): ${message}`);
    });

    socket.on('hello', ({ you, users, voiceUsers, messages }) => {
        state.me = you;
        state.users.clear();
        for (const u of users) state.users.set(u.id, u);
        state.voicePeers = new Set(voiceUsers);
        renderUserList();
        renderVoiceList();
        $('#messages').innerHTML = '';
        for (const m of messages) appendMessage(m);
        showStatus('');
    });

    socket.on('user-joined', (u) => {
        state.users.set(u.id, u);
        renderUserList();
    });
    socket.on('user-left', (id) => {
        state.users.delete(id);
        state.voicePeers.delete(id);
        renderUserList();
        renderVoiceList();
    });

    socket.on('chat', appendMessage);

    // Voice room presence
    socket.on('voice-peers', (peers) => {
        for (const id of peers) state.voicePeers.add(id);
        renderVoiceList();
        // Newcomer offers to each existing peer.
        if (state.audio) {
            for (const id of peers) state.audio.offerTo(id);
        }
    });
    socket.on('voice-user-joined', (id) => {
        state.voicePeers.add(id);
        renderVoiceList();
    });
    socket.on('voice-user-left', (id) => {
        state.voicePeers.delete(id);
        renderVoiceList();
        if (state.audio) state.audio.dropPeer(id);
    });

    // WebRTC signaling
    socket.on('rtc-offer', ({ from, offer }) => state.audio?.handleOffer(from, offer));
    socket.on('rtc-answer', ({ from, answer }) => state.audio?.handleAnswer(from, answer));
    socket.on('rtc-ice', ({ from, candidate }) => state.audio?.handleIce(from, candidate));

    socket.on('mic-status', ({ userId, muted }) => {
        const node = document.querySelector(`[data-voice-user="${userId}"] .mic-icon`);
        if (node) node.textContent = muted ? '🔇' : '🎤';
    });

    socket.on('disconnect', (reason) => {
        console.warn('[socket] disconnected:', reason);
        showStatus('Disconnected (' + reason + '). Will retry…');
    });

    socket.on('reconnect', (n) => {
        console.log('[socket] reconnected after', n, 'attempts');
        showStatus('');
        socket.emit('join', { username, color });
    });
}

async function pickServer() {
    // Prefer local in dev, otherwise Railway.
    const order = isDev() ? [LOCAL_URL, RAILWAY_URL] : [RAILWAY_URL, LOCAL_URL];
    for (const url of order) {
        if (await ping(url)) return url;
    }
    return null;
}

function isDev() {
    return location.protocol === 'file:' && (window.process?.argv?.includes?.('--dev')
        || navigator.userAgent.includes('Electron'));
    // Heuristic: in packaged builds we still try Railway first because LOCAL_URL ping fails fast.
}

async function ping(url) {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3000);
        const r = await fetch(url + '/health', { signal: ctrl.signal });
        clearTimeout(t);
        return r.ok;
    } catch {
        return false;
    }
}

function showStatus(text) {
    const overlay = $('#statusOverlay');
    const banner = $('#statusBanner');
    banner.textContent = text;
    overlay.style.display = text ? 'flex' : 'none';
}

// ---------- Render ----------

function renderUserList() {
    const host = $('#userList');
    host.innerHTML = '';
    for (const u of state.users.values()) {
        const dot = el('span', { className: 'user-dot' });
        dot.style.background = u.color;
        const name = el('span', { className: 'user-name' }, u.username);
        host.append(el('div', { className: 'user-row' }, dot, name));
    }
}

function renderVoiceList() {
    const host = $('#voiceList');
    host.innerHTML = '';
    if (state.voicePeers.size === 0) {
        host.append(el('div', { className: 'voice-empty' }, 'No one in voice'));
        return;
    }
    for (const id of state.voicePeers) {
        const u = state.users.get(id);
        if (!u) continue;
        const dot = el('span', { className: 'user-dot' });
        dot.style.background = u.color;
        host.append(el('div', {
            className: 'user-row',
            dataset: { voiceUser: id }
        }, dot, el('span', { className: 'user-name' }, u.username), el('span', { className: 'mic-icon' }, '🎤')));
    }
}

function appendMessage(m) {
    const host = $('#messages');
    const stickToBottom = host.scrollHeight - host.scrollTop - host.clientHeight < 50;

    const author = el('span', { className: 'msg-author' }, m.username);
    author.style.color = m.color;
    const time = el('span', { className: 'msg-time' }, formatTime(m.ts));

    const head = el('div', { className: 'msg-head' }, author, time);
    const body = el('div', { className: 'msg-body' });
    if (m.text) body.append(el('div', { className: 'msg-text' }, m.text));
    if (m.imageUrl) {
        const fullUrl = state.serverUrl + m.imageUrl;
        const img = el('img', { className: 'msg-image', src: fullUrl, loading: 'lazy' });
        img.addEventListener('click', () => window.open(fullUrl, '_blank'));
        body.append(img);
    }

    host.append(el('div', { className: 'msg' }, head, body));
    if (stickToBottom) host.scrollTop = host.scrollHeight;
}

function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---------- Chat composer ----------

function setupChatComposer() {
    const input = $('#chatInput');
    const fileInput = $('#chatFileInput');

    $('#chatForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        state.socket.emit('chat', { text });
        input.value = '';
    });

    $('#chatAttachBtn').addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (!file) return;
        await uploadAndSend(file);
    });

    // Paste image support
    input.addEventListener('paste', async (e) => {
        const item = Array.from(e.clipboardData?.items || [])
            .find(i => i.type.startsWith('image/'));
        if (!item) return;
        e.preventDefault();
        const file = item.getAsFile();
        if (file) await uploadAndSend(file);
    });
}

async function uploadAndSend(file) {
    if (!file.type.startsWith('image/')) {
        notify('Only images are supported');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        notify('Image too large (max 10 MB)');
        return;
    }
    try {
        const r = await fetch(state.serverUrl + '/upload', {
            method: 'POST',
            headers: {
                'Content-Type': file.type,
                'X-Filename': file.name || 'image'
            },
            body: file
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            notify('Upload failed: ' + (err.error || r.status));
            return;
        }
        const { url } = await r.json();
        state.socket.emit('chat', { imageUrl: url });
    } catch (err) {
        notify('Upload error: ' + err.message);
    }
}

// ---------- Voice controls ----------

function setupVoiceControls() {
    const joinBtn = $('#voiceJoinBtn');
    const leaveBtn = $('#voiceLeaveBtn');
    const muteBtn = $('#voiceMuteBtn');

    joinBtn.addEventListener('click', joinVoice);
    leaveBtn.addEventListener('click', leaveVoice);
    muteBtn.addEventListener('click', () => {
        if (!state.audio) return;
        const next = !state.audio.muted;
        state.audio.setMuted(next);
        muteBtn.textContent = next ? 'Unmute' : 'Mute';
        muteBtn.classList.toggle('muted', next);
        state.socket.emit('mic-status', { muted: next });
    });

    updateVoiceButtons();
}

async function joinVoice() {
    if (state.inVoice) return;
    try {
        state.audio = new AudioManager({
            signal: (event, data) => state.socket.emit(event, data)
        });
        await state.audio.startMic();
        state.socket.emit('voice-join');
        state.inVoice = true;
        updateVoiceButtons();
    } catch (err) {
        notify('Mic error: ' + err.message);
        state.audio = null;
    }
}

function leaveVoice() {
    if (!state.inVoice) return;
    state.socket.emit('voice-leave');
    state.audio?.dropAll();
    state.audio?.stopMic();
    state.audio = null;
    state.inVoice = false;
    state.voicePeers.delete(state.me.id);
    updateVoiceButtons();
    renderVoiceList();
}

function updateVoiceButtons() {
    $('#voiceJoinBtn').style.display = state.inVoice ? 'none' : '';
    $('#voiceLeaveBtn').style.display = state.inVoice ? '' : 'none';
    $('#voiceMuteBtn').style.display = state.inVoice ? '' : 'none';
}
