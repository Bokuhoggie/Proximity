// Proximity client controller.
// Handles: connect → join → text chat → voice channel → image upload.

import { AudioManager, startMicLevel } from './audio.js';
import * as e2e from './crypto.js';
import { openEmojiPicker } from './emoji.js';
import { ProximityMap } from './proximity.js';

const RAILWAY_URL = 'https://proximityserver-production.up.railway.app';
const LOCAL_URL = 'http://localhost:3000';

const COLORS = ['#7aa2f7', '#9ece6a', '#f7768e', '#e0af68', '#bb9af7', '#7dcfff', '#ff9e64', '#73daca'];

const state = {
    socket: null,
    serverUrl: null,
    me: null,                      // { id, username, color, avatarUrl }
    profiles: new Map(),           // uuid -> profile
    textChannels: new Map(),       // id -> { id, name, messages[] }
    voiceChannels: new Map(),      // id -> { id, name, members: Set<uuid> }
    activeTextChannelId: null,     // currently displayed text channel
    activeVoiceChannelId: null,    // voice channel I'm in, or null
    peerStates: new Map(),         // uuid -> RTCPeerConnection state
    peerLevels: new Map(),         // uuid -> bool (currently speaking)
    proximity: null                // ProximityMap instance, when open
    audio: null
};

function profileOf(uuid) {
    return state.profiles.get(uuid) || { id: uuid, username: 'unknown', color: '#888', avatarUrl: null };
}

// ---------- DOM helpers ----------

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        // dataset and style are read-only getters returning a live object,
        // so we merge into them instead of assigning.
        if (key === 'dataset' && value) {
            for (const [dk, dv] of Object.entries(value)) node.dataset[dk] = dv;
        } else if (key === 'style' && value && typeof value === 'object') {
            Object.assign(node.style, value);
        } else {
            node[key] = value;
        }
    }
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

// Catch every uncaught error on the renderer side and tag it with the
// bomboclat marker. Otherwise async errors from socket.io callbacks just
// surface as red console lines that are easy to overlook.
window.addEventListener('error', (e) => {
    console.error('[uncaught] bomboclat', e.message, e.error?.stack || e.error || '');
    toast('Error bomboclat: ' + (e.message || 'unknown'));
});
window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    const msg = reason?.message || String(reason);
    console.error('[unhandled-rejection] bomboclat', msg, reason?.stack || '');
    toast('Error bomboclat: ' + msg);
});

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

function insertAtCursor(input, text) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const newPos = start + text.length;
    input.setSelectionRange(newPos, newPos);
}

// ---------- Boot ----------

window.addEventListener('DOMContentLoaded', () => {
    const profile = loadOrCreateProfile();
    state.me = profile;
    setupChatComposer();
    setupVoiceLeaveAndMute();
    setupChannelCreation();
    setupSettings();
    renderTextChannels();
    renderVoiceChannels();
    renderMyIdentity();
    connectAndJoin(profile);
});

function loadOrCreateProfile() {
    try {
        const saved = JSON.parse(localStorage.getItem('proximity-profile') || '{}');
        if (saved.id && saved.username && saved.color) {
            return { id: saved.id, username: saved.username, color: saved.color, avatarUrl: saved.avatarUrl || null };
        }
        // Migrate old format (had username + color only) to UUID-based.
        if (saved.username && saved.color) {
            const migrated = { id: makeUuid(), username: saved.username, color: saved.color, avatarUrl: null };
            localStorage.setItem('proximity-profile', JSON.stringify(migrated));
            return migrated;
        }
    } catch {}
    const profile = {
        id: makeUuid(),
        username: 'friend-' + Math.random().toString(36).slice(2, 6),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        avatarUrl: null
    };
    localStorage.setItem('proximity-profile', JSON.stringify(profile));
    return profile;
}

function saveProfile() {
    localStorage.setItem('proximity-profile', JSON.stringify(state.me));
}

function makeUuid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    // Fallback for older runtimes (Electron 28 ships with randomUUID, so this is just in case).
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

// ---------- Connection ----------

async function connectAndJoin(me) {
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

    function emitJoin() {
        socket.emit('join', { id: me.id, username: me.username, color: me.color, avatarUrl: me.avatarUrl });
    }

    socket.on('connect', () => {
        console.log('[socket] connected', socket.id, '→', url);
        emitJoin();
    });

    socket.on('connect_error', (err) => {
        console.error('[socket] connect_error bomboclat', err.message, err.description || '');
        toast('Connect error: ' + err.message);
    });

    socket.on('server-error', ({ event, message }) => {
        console.error('[socket] server-error bomboclat', event, message);
        toast(`Server error (${event}): ${message}`);
    });

    socket.on('hello', (payload) => {
        const { you, profiles, textChannels, voiceChannels } = payload || {};
        if (!you || !Array.isArray(profiles) || !Array.isArray(textChannels) || !Array.isArray(voiceChannels)) {
            console.error('[hello] unexpected payload shape bomboclat', payload);
            toast('Server is on an older version. Wait for redeploy or contact admin.');
            return;
        }
        state.me = { ...state.me, ...you };
        saveProfile();
        renderMyIdentity();

        state.profiles.clear();
        for (const p of profiles) state.profiles.set(p.id, p);

        state.textChannels.clear();
        for (const c of textChannels) {
            state.textChannels.set(c.id, { id: c.id, name: c.name, messages: c.messages || [] });
        }
        state.voiceChannels.clear();
        for (const c of voiceChannels) {
            state.voiceChannels.set(c.id, { id: c.id, name: c.name, members: new Set(c.members || []) });
        }

        // Pick first text channel as active if none selected.
        if (!state.activeTextChannelId || !state.textChannels.has(state.activeTextChannelId)) {
            const first = state.textChannels.values().next().value;
            state.activeTextChannelId = first ? first.id : null;
        }

        renderTextChannels();
        renderVoiceChannels();
        renderMessages();
        showStatus('');
    });

    socket.on('profile-updated', (profile) => {
        state.profiles.set(profile.id, profile);
        if (profile.id === state.me.id) {
            state.me = { ...state.me, ...profile };
            saveProfile();
            renderMyIdentity();
        }
        renderVoiceChannels();
        rerenderMessageProfiles(profile.id);
    });

    socket.on('user-disconnected', (uuid) => {
        // Profile stays cached so old messages still render with their name;
        // we just remove them from any voice channel they were in.
        for (const c of state.voiceChannels.values()) c.members.delete(uuid);
        state.peerStates.delete(uuid);
        renderVoiceChannels();
    });

    socket.on('text-channel-created', (channel) => {
        state.textChannels.set(channel.id, { id: channel.id, name: channel.name, messages: channel.messages || [] });
        renderTextChannels();
        // If we created it, switch to it.
        if (channel.createdBy === state.me.id) switchTextChannel(channel.id);
    });

    socket.on('voice-channel-created', (channel) => {
        state.voiceChannels.set(channel.id, { id: channel.id, name: channel.name, members: new Set(channel.members || []) });
        renderVoiceChannels();
    });

    socket.on('chat', (msg) => {
        const channel = state.textChannels.get(msg.channelId);
        if (!channel) return;
        channel.messages.push(msg);
        if (channel.messages.length > 200) channel.messages.shift();
        if (msg.channelId === state.activeTextChannelId) appendMessageNode(msg);
    });

    socket.on('voice-peers', ({ channelId, peers, positions }) => {
        const channel = state.voiceChannels.get(channelId);
        if (!channel) return;
        for (const id of peers) channel.members.add(id);
        channel.members.add(state.me.id);
        renderVoiceChannels();
        if (state.audio) {
            for (const id of peers) state.audio.offerTo(id);
        }
        if (state.proximity && positions) {
            state.proximity.setInitialPositions(positions);
        }
    });
    socket.on('voice-channel-member-joined', ({ channelId, userId, position }) => {
        const channel = state.voiceChannels.get(channelId);
        if (!channel) return;
        channel.members.add(userId);
        if (state.proximity && position && channelId === state.activeVoiceChannelId) {
            state.proximity.setRemotePosition(userId, position.x, position.y);
        }
        renderVoiceChannels();
    });
    socket.on('voice-channel-member-left', ({ channelId, userId }) => {
        const channel = state.voiceChannels.get(channelId);
        if (channel) channel.members.delete(userId);
        if (state.audio && userId !== state.me.id && channelId === state.activeVoiceChannelId) {
            state.audio.dropPeer(userId);
        }
        state.peerStates.delete(userId);
        if (state.proximity) state.proximity.removeUser(userId);
        renderVoiceChannels();
    });
    socket.on('position-update', ({ channelId, userId, x, y }) => {
        if (channelId !== state.activeVoiceChannelId) return;
        if (state.proximity) state.proximity.setRemotePosition(userId, x, y);
    });

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
        emitJoin();
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

function renderMyIdentity() {
    const host = $('#myIdentity');
    if (!host || !state.me) return;
    host.innerHTML = '';
    const dot = el('span', { className: 'user-dot' });
    dot.style.background = state.me.color;
    host.append(dot, el('span', { className: 'user-name' }, state.me.username));
}

function renderTextChannels() {
    const host = $('#textChannelList');
    host.innerHTML = '';
    for (const c of state.textChannels.values()) {
        const row = el('button', {
            type: 'button',
            className: 'channel-row' + (c.id === state.activeTextChannelId ? ' active' : '')
        }, el('span', { className: 'channel-hash' }, '#'), el('span', { className: 'channel-name' }, c.name));
        row.addEventListener('click', () => switchTextChannel(c.id));
        host.append(row);
    }
}

function renderVoiceChannels() {
    const host = $('#voiceChannelList');
    host.innerHTML = '';
    for (const c of state.voiceChannels.values()) {
        const isActive = c.id === state.activeVoiceChannelId;
        const header = el('button', {
            type: 'button',
            className: 'channel-row' + (isActive ? ' active' : '')
        }, el('span', { className: 'channel-icon' }, '🔊'), el('span', { className: 'channel-name' }, c.name));
        header.addEventListener('click', () => joinVoiceChannel(c.id));
        host.append(header);

        if (c.members.size > 0) {
            const sub = el('div', { className: 'channel-members' });
            for (const id of c.members) {
                const p = profileOf(id);
                const dot = el('span', { className: 'user-dot' });
                dot.style.background = p.color;
                const stateClass = id === state.me?.id ? 'self' : (state.peerStates.get(id) || 'pending');
                const stateDot = el('span', { className: `peer-state ${stateClass}`, title: stateClass });
                sub.append(el('div', {
                    className: 'channel-member',
                    dataset: { voiceUser: id }
                }, dot, el('span', { className: 'user-name' }, p.username), stateDot));
            }
            host.append(sub);
        }
    }
    updateVoiceButtons();
}

function renderMessages() {
    const host = $('#messages');
    host.innerHTML = '';
    const channel = state.textChannels.get(state.activeTextChannelId);
    if (!channel) return;
    $('#chatChannelTitle').textContent = '# ' + channel.name;
    $('#chatInput').placeholder = `Message #${channel.name} — paste images too`;
    for (const m of channel.messages) host.append(renderMessageNode(m));
    host.scrollTop = host.scrollHeight;
}

function appendMessageNode(m) {
    const host = $('#messages');
    const stickToBottom = host.scrollHeight - host.scrollTop - host.clientHeight < 50;
    host.append(renderMessageNode(m));
    if (stickToBottom) host.scrollTop = host.scrollHeight;
}

function switchTextChannel(id) {
    if (!state.textChannels.has(id)) return;
    state.activeTextChannelId = id;
    renderTextChannels();
    renderMessages();
}

function renderMessageNode(m) {
    const p = profileOf(m.userId);
    const author = el('span', { className: 'msg-author' }, p.username);
    author.style.color = p.color;
    const time = el('span', { className: 'msg-time' }, formatTime(m.ts));
    const head = el('div', { className: 'msg-head' }, author, time);
    const body = el('div', { className: 'msg-body' });
    if (m.text) {
        const textEl = el('div', { className: 'msg-text' });
        body.append(textEl);
        if (m.text.startsWith(e2e.CRYPTO_PREFIX)) {
            // Encrypted — decrypt asynchronously and patch the node.
            textEl.classList.add('msg-encrypted');
            textEl.textContent = '🔒 decrypting…';
            e2e.decryptText(m.text)
                .then((plain) => {
                    textEl.classList.remove('msg-encrypted');
                    textEl.textContent = plain;
                })
                .catch(() => {
                    textEl.classList.remove('msg-encrypted');
                    textEl.classList.add('msg-locked');
                    textEl.textContent = '🔒 (encrypted — passphrase mismatch)';
                });
        } else {
            textEl.textContent = m.text;
        }
    }
    if (m.imageUrl) {
        const fullUrl = state.serverUrl + m.imageUrl;
        const img = el('img', { className: 'msg-image', loading: 'lazy' });
        body.append(img);
        if (m.enc) {
            // Encrypted image: fetch ciphertext, decrypt, render via blob URL.
            img.classList.add('msg-encrypted');
            img.alt = '🔒 decrypting…';
            decryptImageInto(img, fullUrl, m.enc);
        } else {
            img.src = fullUrl;
            img.addEventListener('click', () => window.open(fullUrl, '_blank'));
        }
    }
    const node = el('div', { className: 'msg' }, head, body);
    node.dataset.userId = m.userId;
    node.dataset.msgId = m.id;
    return node;
}

async function decryptImageInto(imgEl, url, encMeta) {
    try {
        const r = await fetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const ct = await r.arrayBuffer();
        const blob = await e2e.decryptBytes(ct, encMeta.iv, encMeta.mime);
        const objectUrl = URL.createObjectURL(blob);
        imgEl.src = objectUrl;
        imgEl.alt = '';
        imgEl.classList.remove('msg-encrypted');
        imgEl.addEventListener('click', () => window.open(objectUrl, '_blank'));
    } catch (err) {
        imgEl.classList.remove('msg-encrypted');
        imgEl.classList.add('msg-locked');
        imgEl.alt = '🔒 (encrypted — passphrase mismatch)';
    }
}

// When a profile changes, walk every visible message authored by that user
// and re-render its head (name + color). Cheap: O(messages-on-screen).
function rerenderMessageProfiles(uuid) {
    const p = profileOf(uuid);
    document.querySelectorAll(`.msg[data-user-id="${cssEscape(uuid)}"] .msg-author`).forEach(authorEl => {
        authorEl.textContent = p.username;
        authorEl.style.color = p.color;
    });
}

function cssEscape(s) {
    return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---------- Chat composer ----------

function setupChatComposer() {
    const input = $('#chatInput');
    const fileInput = $('#chatFileInput');

    $('#chatForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        if (!state.activeTextChannelId) {
            notify('No channel selected');
            return;
        }
        try {
            const payload = e2e.hasKey() ? await e2e.encryptText(text) : text;
            state.socket.emit('chat', { channelId: state.activeTextChannelId, text: payload });
            input.value = '';
        } catch (err) {
            notify('Send failed: ' + err.message);
        }
    });

    $('#chatAttachBtn').addEventListener('click', () => fileInput.click());

    $('#chatEmojiBtn').addEventListener('click', () => {
        openEmojiPicker($('#chatEmojiBtn'), (emoji) => {
            insertAtCursor(input, emoji);
            input.focus();
        });
    });

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
    if (!state.activeTextChannelId) {
        notify('No channel selected');
        return;
    }
    try {
        let body, contentType, enc = null;
        if (e2e.hasKey()) {
            // Encrypt the bytes before they leave us.
            const buf = await file.arrayBuffer();
            const { ciphertext, iv } = await e2e.encryptBytes(buf);
            body = ciphertext;
            contentType = 'application/octet-stream';
            enc = { iv: bufToB64(iv), mime: file.type };
        } else {
            body = file;
            contentType = file.type;
        }
        const r = await fetch(state.serverUrl + '/upload', {
            method: 'POST',
            headers: {
                'Content-Type': contentType,
                'X-Filename': file.name || 'image'
            },
            body
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            notify('Upload failed: ' + (err.error || r.status));
            return;
        }
        const { url } = await r.json();
        const payload = { channelId: state.activeTextChannelId, imageUrl: url };
        if (enc) payload.enc = enc;
        state.socket.emit('chat', payload);
    } catch (err) {
        notify('Upload error: ' + err.message);
    }
}

function bufToB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
}

// ---------- Voice controls ----------

function setupVoiceLeaveAndMute() {
    $('#voiceLeaveBtn').addEventListener('click', leaveVoiceChannel);
    $('#voiceMuteBtn').addEventListener('click', () => {
        if (!state.audio) return;
        const next = !state.audio.muted;
        state.audio.setMuted(next);
        $('#voiceMuteBtn').textContent = next ? '🔇' : '🎤';
        $('#voiceMuteBtn').classList.toggle('muted', next);
        $('#voiceMuteBtn').title = next ? 'Unmute' : 'Mute';
        state.socket.emit('mic-status', { muted: next });
    });
    $('#voiceMapBtn').addEventListener('click', openProximityMap);
    $('#mapCloseBtn').addEventListener('click', closeProximityMap);
}

function openProximityMap() {
    if (!state.activeVoiceChannelId) {
        notify('Join a voice channel first');
        return;
    }
    const overlay = $('#mapOverlay');
    overlay.style.display = 'flex';
    const channel = state.voiceChannels.get(state.activeVoiceChannelId);
    $('#mapTitle').textContent = `🗺  ${channel?.name || 'Map'}`;
    if (!state.proximity) {
        state.proximity = new ProximityMap({
            container: $('#mapStage'),
            audio: state.audio,
            socket: state.socket,
            getMyUserId: () => state.me?.id,
            getProfile: (uuid) => profileOf(uuid),
            getActiveChannelId: () => state.activeVoiceChannelId
        });
        // We don't have positions until the server tells us — rely on the
        // initial voice-peers payload (already delivered when we joined).
        // For now, seed a position for ourselves at center so we render.
        state.proximity.setRemotePosition(state.me.id, 0.5, 0.5);
    }
    state.proximity.render();
}

function closeProximityMap() {
    const overlay = $('#mapOverlay');
    overlay.style.display = 'none';
}

async function joinVoiceChannel(channelId) {
    if (!state.voiceChannels.has(channelId)) return;
    if (state.activeVoiceChannelId === channelId) return;

    // If currently in another voice channel, drop peers + mic first.
    if (state.activeVoiceChannelId) {
        state.audio?.dropAll();
        state.peerStates.clear();
        state.peerLevels.clear();
    } else {
        // Cold start: spin up the mic.
        try {
            const devices = loadAudioDevices();
            state.audio = new AudioManager({
                signal: (event, data) => state.socket.emit(event, data),
                inputDeviceId: devices.input,
                outputDeviceId: devices.output,
                onPeerStateChange: (uuid, connectionState) => {
                    state.peerStates.set(uuid, connectionState);
                    renderVoiceChannels();
                    updateVoiceButtons();
                },
                onPeerLevel: (uuid, level) => {
                    const speaking = level > 0.04;
                    const wasSpeaking = state.peerLevels.get(uuid) || false;
                    state.peerLevels.set(uuid, speaking);
                    if (speaking !== wasSpeaking) {
                        const dot = document.querySelector(`[data-voice-user="${cssEscape(uuid)}"] .user-dot`);
                        if (dot) dot.classList.toggle('speaking', speaking);
                    }
                }
            });
            await state.audio.startMic();
        } catch (err) {
            notify('Mic error: ' + err.message);
            state.audio = null;
            return;
        }
    }

    state.activeVoiceChannelId = channelId;
    state.socket.emit('voice-join', { channelId });
    renderVoiceChannels();
    updateVoiceButtons();
}

function leaveVoiceChannel() {
    if (!state.activeVoiceChannelId) return;
    state.socket.emit('voice-leave');
    state.audio?.dropAll();
    state.audio?.stopMic();
    state.audio = null;
    state.peerStates.clear();
    state.peerLevels.clear();
    if (state.proximity) {
        state.proximity.destroy();
        state.proximity = null;
        $('#mapOverlay').style.display = 'none';
    }
    const channel = state.voiceChannels.get(state.activeVoiceChannelId);
    if (channel) channel.members.delete(state.me.id);
    state.activeVoiceChannelId = null;
    updateVoiceButtons();
    renderVoiceChannels();
}

// ---------- Diagnostic helper ----------
//
// In DevTools: `await diagnose()` returns a snapshot AND console.tables
// the peer rows for sharing. Tagged with bomboclat so you can grep
// paired logs. NB: window.proximity is the contextBridge-exposed
// (frozen) updater API from preload.js — we can't attach to it, so
// this lives at the top level as `diagnose`.

window.diagnose = async function diagnose() {
    if (!state.audio) {
        const out = { me: null, peers: [], note: 'not in voice' };
        console.log('[diagnose] bomboclat', out);
        return out;
    }
    const snap = await state.audio.diagnose();
    console.log('[diagnose] bomboclat — me:', snap.me);
    console.table(snap.peers);
    return snap;
};

function updateVoiceButtons() {
    const inVoice = !!state.activeVoiceChannelId;
    const dock = $('#voiceDock');
    dock.style.display = inVoice ? '' : 'none';
    if (!inVoice) return;

    const channel = state.voiceChannels.get(state.activeVoiceChannelId);
    $('#voiceDockChannel').textContent = channel?.name || 'Voice';

    // Aggregate peer state for the dock subtitle.
    const peerStates = Array.from(state.peerStates.values());
    const others = peerStates.filter(s => s !== 'self');
    let label;
    if (others.length === 0) label = 'Connected (alone)';
    else if (others.every(s => s === 'connected')) label = 'Connected';
    else if (others.some(s => s === 'failed' || s === 'closed' || s === 'disconnected')) label = 'Connection issue';
    else label = 'Connecting…';
    $('#voiceDockStatus').textContent = label;
}

// ---------- Channel creation ----------

function setupChannelCreation() {
    $('#addTextChannelBtn').addEventListener('click', async () => {
        const name = await promptDialog('New text channel', 'e.g. memes, planning, dev');
        if (!name) return;
        state.socket.emit('create-text-channel', { name });
    });
    $('#addVoiceChannelBtn').addEventListener('click', async () => {
        const name = await promptDialog('New voice channel', 'e.g. Lounge, AFK, Game');
        if (!name) return;
        state.socket.emit('create-voice-channel', { name });
    });
}

// Replacement for window.prompt() (which Electron disables). Returns the
// trimmed string on submit, or null on cancel. Resolves on Enter / Submit
// click, rejects/null on Esc / Cancel / backdrop click.
function promptDialog(title, placeholder = '') {
    return new Promise((resolve) => {
        const input = el('input', { className: 'join-input', type: 'text', maxLength: 32, placeholder });
        const cancelBtn = el('button', { type: 'button', className: 'btn ghost' }, 'Cancel');
        const okBtn = el('button', { type: 'submit', className: 'btn primary' }, 'Create');
        const form = el('form', { className: 'modal-card prompt-card' },
            el('div', { className: 'modal-header' }, el('h2', {}, title)),
            input,
            el('div', { className: 'prompt-actions' }, cancelBtn, okBtn)
        );
        const backdrop = el('div', { className: 'modal' }, form);

        const close = (value) => {
            backdrop.remove();
            document.removeEventListener('keydown', onKey);
            resolve(value);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') close(null);
        };
        cancelBtn.addEventListener('click', () => close(null));
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) close(null);
        });
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const v = input.value.trim().slice(0, 32);
            close(v || null);
        });
        document.addEventListener('keydown', onKey);

        document.body.append(backdrop);
        input.focus();
    });
}

// ---------- Settings ----------

function loadAudioDevices() {
    try {
        return JSON.parse(localStorage.getItem('proximity-audio') || '{}');
    } catch {
        return {};
    }
}

function saveAudioDevices(d) {
    localStorage.setItem('proximity-audio', JSON.stringify(d));
}

function setupSettings() {
    const modal = $('#settingsModal');
    const inputSel = $('#inputDeviceSelect');
    const outputSel = $('#outputDeviceSelect');
    const meterFill = $('#micMeterFill');
    const testBtn = $('#micTestBtn');
    let micTestStop = null;

    setupUpdatesSection();

    $('#settingsBtn').addEventListener('click', () => openSettings());
    $('#settingsCloseBtn').addEventListener('click', closeSettings);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeSettings();
    });

    inputSel.addEventListener('change', async () => {
        const d = loadAudioDevices();
        d.input = inputSel.value;
        saveAudioDevices(d);
        if (state.audio) {
            try {
                await state.audio.setInputDevice(d.input);
            } catch (err) {
                notify('Could not switch mic: ' + err.message);
            }
        }
        // If a mic test is running, restart it on the new device.
        if (micTestStop) {
            await stopMicTest();
            await startMicTest();
        }
    });

    outputSel.addEventListener('change', async () => {
        const d = loadAudioDevices();
        d.output = outputSel.value;
        saveAudioDevices(d);
        if (state.audio) {
            try {
                await state.audio.setOutputDevice(d.output);
            } catch (err) {
                notify('Could not switch output: ' + err.message);
            }
        }
    });

    testBtn.addEventListener('click', async () => {
        if (micTestStop) await stopMicTest();
        else await startMicTest();
    });

    setupIdentityEditor();
    setupTestSoundButton();
    setupE2ESection();

    async function startMicTest() {
        try {
            const d = loadAudioDevices();
            micTestStop = await startMicLevel(d.input, (level) => {
                meterFill.style.width = (level * 100).toFixed(0) + '%';
            });
            testBtn.textContent = 'Stop test';
            testBtn.classList.add('muted');
        } catch (err) {
            notify('Mic test failed: ' + err.message);
        }
    }
    async function stopMicTest() {
        if (micTestStop) micTestStop();
        micTestStop = null;
        meterFill.style.width = '0%';
        testBtn.textContent = 'Test mic';
        testBtn.classList.remove('muted');
    }

    // When the modal closes, always stop the mic test.
    function closeSettings() {
        modal.style.display = 'none';
        stopMicTest();
    }

    async function openSettings() {
        modal.style.display = 'flex';
        renderIdentity();
        // Browsers won't surface device labels until the user has granted
        // microphone permission at least once. Trigger a quick getUserMedia
        // so the labels become visible.
        try {
            const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
            tmp.getTracks().forEach(t => t.stop());
        } catch {
            // Permission denied — we'll still list devices, just without labels.
        }
        await refreshDeviceLists();
    }

    async function refreshDeviceLists() {
        const all = await navigator.mediaDevices.enumerateDevices();
        const inputs = all.filter(d => d.kind === 'audioinput');
        const outputs = all.filter(d => d.kind === 'audiooutput');
        const saved = loadAudioDevices();

        fillSelect(inputSel, inputs, 'Microphone', saved.input);
        fillSelect(outputSel, outputs, 'Output', saved.output);
    }

    function fillSelect(sel, devices, fallbackLabel, currentId) {
        sel.innerHTML = '';
        if (devices.length === 0) {
            sel.append(el('option', { value: '', textContent: '(none available)' }));
            sel.disabled = true;
            return;
        }
        sel.disabled = false;
        for (const d of devices) {
            const opt = el('option', {
                value: d.deviceId,
                textContent: d.label || `${fallbackLabel} (${d.deviceId.slice(0, 8)}…)`
            });
            if (d.deviceId === currentId) opt.selected = true;
            sel.append(opt);
        }
    }

    function renderIdentity() {
        // Refresh the input + selected swatch each time the modal opens.
        $('#displayNameInput').value = state.me?.username || '';
        renderColorSwatches();
    }

    function renderColorSwatches() {
        const host = $('#colorSwatches');
        host.innerHTML = '';
        for (const c of COLORS) {
            const s = el('button', {
                type: 'button',
                className: 'swatch' + (c === state.me?.color ? ' active' : ''),
                title: c
            });
            s.style.background = c;
            s.addEventListener('click', () => {
                if (!state.me) return;
                state.me.color = c;
                saveProfile();
                renderColorSwatches();
                state.socket?.emit('update-profile', { color: c });
            });
            host.append(s);
        }
    }

    function setupIdentityEditor() {
        $('#saveNameBtn').addEventListener('click', () => {
            const name = $('#displayNameInput').value.trim();
            if (!name || !state.me) return;
            if (name === state.me.username) return;
            state.me.username = name.slice(0, 32);
            saveProfile();
            state.socket?.emit('update-profile', { username: state.me.username });
        });
    }

    function setupE2ESection() {
        const status = $('#e2eStatus');
        const input = $('#e2ePassphrase');
        const saveBtn = $('#e2eSaveBtn');
        const clearBtn = $('#e2eClearBtn');

        function refreshStatus() {
            const on = e2e.hasKey();
            status.textContent = on ? '🔒 Encryption enabled' : 'Encryption disabled';
            status.className = 'e2e-status ' + (on ? 'on' : 'off');
            input.value = '';
            clearBtn.style.display = on ? '' : 'none';
        }
        refreshStatus();
        // Re-run when modal opens too (handled by openSettings calling renderIdentity, but we also patch here):
        const modal = $('#settingsModal');
        const observer = new MutationObserver(() => {
            if (modal.style.display === 'flex') refreshStatus();
        });
        observer.observe(modal, { attributes: true, attributeFilter: ['style'] });

        saveBtn.addEventListener('click', async () => {
            const pp = input.value;
            if (!pp) {
                notify('Enter a passphrase');
                return;
            }
            try {
                await e2e.setPassphrase(pp);
                refreshStatus();
                notify('Encryption enabled. Re-render messages to see decrypted content.');
                // Re-render the active channel to apply decryption to existing visible messages.
                renderMessages();
            } catch (err) {
                notify('Failed to set passphrase: ' + err.message);
            }
        });
        clearBtn.addEventListener('click', () => {
            e2e.clearKey();
            refreshStatus();
            notify('Encryption disabled. Future messages will be sent in plaintext.');
            renderMessages();
        });
    }

    function setupTestSoundButton() {
        const btn = $('#testSoundBtn');
        let audio = null;
        btn.addEventListener('click', async () => {
            if (audio) {
                audio.pause();
                audio = null;
                btn.textContent = 'Play test sound';
                btn.classList.remove('muted');
                return;
            }
            audio = new Audio('assets/test-sound.mp3');
            const out = loadAudioDevices().output;
            if (out && typeof audio.setSinkId === 'function') {
                audio.setSinkId(out).catch(() => {});
            }
            btn.textContent = 'Stop';
            btn.classList.add('muted');
            audio.addEventListener('ended', () => {
                audio = null;
                btn.textContent = 'Play test sound';
                btn.classList.remove('muted');
            });
            audio.play().catch((err) => {
                notify('Test sound failed: ' + err.message);
                audio = null;
                btn.textContent = 'Play test sound';
                btn.classList.remove('muted');
            });
        });
    }

    // React to devices being plugged/unplugged while the modal is open.
    navigator.mediaDevices.addEventListener('devicechange', () => {
        if (modal.style.display === 'flex') refreshDeviceLists();
    });
}

// ---------- Updates section ----------

function setupUpdatesSection() {
    const versionEl = $('#updatesVersion');
    const statusEl = $('#updatesStatus');
    const progress = $('#updatesProgress');
    const progressFill = $('#updatesProgressFill');
    const checkBtn = $('#updatesCheckBtn');
    const installBtn = $('#updatesInstallBtn');

    // window.proximity is exposed by preload.js. If it's missing we're
    // running in a plain browser context (shouldn't happen for users, but
    // safe-guard so the rest of settings still works).
    const api = window.proximity?.updater;
    if (!api) {
        versionEl.textContent = '?';
        statusEl.textContent = 'Updater not available in this context';
        checkBtn.disabled = true;
        return;
    }

    window.proximity.appVersion().then((v) => { versionEl.textContent = v; });

    function applyEvent(ev) {
        progress.style.display = 'none';
        installBtn.style.display = 'none';
        checkBtn.disabled = false;

        switch (ev.type) {
            case 'idle':
                statusEl.textContent = 'Idle';
                break;
            case 'disabled':
                statusEl.textContent = 'Disabled (running in dev mode)';
                checkBtn.disabled = true;
                break;
            case 'checking':
                statusEl.textContent = 'Checking for updates…';
                checkBtn.disabled = true;
                break;
            case 'up-to-date':
                statusEl.textContent = `Up to date (${ev.version})`;
                break;
            case 'available':
                statusEl.textContent = `Update available: ${ev.version}. Downloading…`;
                checkBtn.disabled = true;
                break;
            case 'downloading':
                statusEl.textContent = `Downloading… ${ev.percent.toFixed(0)}%`;
                progress.style.display = 'block';
                progressFill.style.width = ev.percent.toFixed(0) + '%';
                checkBtn.disabled = true;
                break;
            case 'downloaded':
                statusEl.textContent = `Update ${ev.version} ready to install`;
                installBtn.style.display = '';
                break;
            case 'error':
                statusEl.textContent = 'Error: ' + ev.message;
                break;
            default:
                statusEl.textContent = ev.type;
        }
    }

    api.getState().then(({ last }) => applyEvent(last || { type: 'idle' }));
    api.onEvent(applyEvent);

    checkBtn.addEventListener('click', async () => {
        statusEl.textContent = 'Checking…';
        checkBtn.disabled = true;
        const r = await api.check();
        if (!r.ok) {
            statusEl.textContent = r.reason === 'disabled-in-dev'
                ? 'Disabled (running in dev mode)'
                : 'Error: ' + r.reason;
            checkBtn.disabled = r.reason === 'disabled-in-dev';
        }
    });

    installBtn.addEventListener('click', () => api.installNow());
}
