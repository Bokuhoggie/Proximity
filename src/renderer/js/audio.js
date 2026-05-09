// Audio / WebRTC manager for the voice channel.
//
// Design:
//   - Mesh topology (one RTCPeerConnection per remote peer).
//   - Glare avoided by convention: only the *newcomer* offers to existing peers.
//     Existing peers wait for the offer in handleOffer().
//   - ICE candidates received before the remote description is set are queued
//     and applied later (otherwise they're silently dropped).
//
// The owner (app.js) wires this up by passing a `signal` callback that emits
// the right socket.io event.

// STUN handles ~70% of cases; TURN is the fallback when both peers are
// behind symmetric NATs that won't allow direct connections. The Open
// Relay Project provides a free public TURN server for testing — fine
// for friends-only use. If reliability matters later, swap in a paid
// service (Twilio/Xirsys) or run our own coturn.
const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
    },
    {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
    },
    {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
    }
];

export class AudioManager {
    constructor({ signal, onPeerStateChange, onPeerLevel, inputDeviceId, outputDeviceId }) {
        this.signal = signal;                       // (event, data) => void
        this.onPeerStateChange = onPeerStateChange; // (uuid, state) => void
        this.onPeerLevel = onPeerLevel;             // (uuid, level0to1) => void
        this.localStream = null;
        this.muted = false;
        this.peers = new Map();   // userId -> Peer (see ensurePeer)
        this.inputDeviceId = inputDeviceId || null;
        this.outputDeviceId = outputDeviceId || null;
        this.sharedAudioCtx = null;
        // Polling: every ~1s, sample remote audio levels via WebAudio. We
        // could also use receiver.getSynchronizationSources() but the
        // AnalyserNode path matches our mic meter and works in all browsers.
        this.levelLoop = null;
    }

    getAudioContext() {
        if (!this.sharedAudioCtx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            this.sharedAudioCtx = new Ctx();
        }
        return this.sharedAudioCtx;
    }

    async startMic() {
        if (this.localStream) return this.localStream;
        this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: this.inputDeviceId ? { exact: this.inputDeviceId } : undefined,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false
        });
        this.applyMute();
        return this.localStream;
    }

    stopMic() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(t => t.stop());
            this.localStream = null;
        }
    }

    // Swap to a new microphone deviceId. If we're already in voice, replace
    // the outgoing track on every peer connection so remotes hear the new mic
    // without needing to renegotiate.
    async setInputDevice(deviceId) {
        this.inputDeviceId = deviceId || null;
        if (!this.localStream) return;
        const newStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false
        });
        const newTrack = newStream.getAudioTracks()[0];
        // Replace track on every active peer connection.
        for (const { pc } of this.peers.values()) {
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
            if (sender) await sender.replaceTrack(newTrack);
        }
        // Stop the old tracks and adopt the new stream.
        this.localStream.getTracks().forEach(t => t.stop());
        this.localStream = newStream;
        this.applyMute();
    }

    // Apply a new output sink to every remote-audio element.
    async setOutputDevice(deviceId) {
        this.outputDeviceId = deviceId || null;
        for (const peer of this.peers.values()) {
            await this.applySink(peer.audioEl);
        }
    }

    async applySink(audioEl) {
        if (!audioEl || !this.outputDeviceId) return;
        if (typeof audioEl.setSinkId !== 'function') return;
        try {
            await audioEl.setSinkId(this.outputDeviceId);
        } catch (err) {
            console.warn('[audio] setSinkId failed', err);
        }
    }

    setMuted(muted) {
        this.muted = !!muted;
        this.applyMute();
    }

    applyMute() {
        if (!this.localStream) return;
        for (const track of this.localStream.getAudioTracks()) {
            track.enabled = !this.muted;
        }
    }

    // Newcomer side: we just joined and the server gave us the existing peers.
    async offerTo(userId, opts = {}) {
        const peer = this.ensurePeer(userId);
        peer.weOffered = true;
        try {
            const offer = await peer.pc.createOffer({ iceRestart: !!opts.iceRestart });
            await peer.pc.setLocalDescription(offer);
            this.signal('rtc-offer', { to: userId, offer });
        } catch (err) {
            console.error('[audio] offerTo failed', userId, err);
            this.dropPeer(userId);
        }
    }

    // Existing peer side: a newcomer sent us an offer.
    async handleOffer(from, offer) {
        const peer = this.ensurePeer(from);
        // Mark our role (only first time). On an ICE-restart offer, weOffered
        // stays false — we still answer.
        if (peer.weOffered === undefined) peer.weOffered = false;
        try {
            await peer.pc.setRemoteDescription(new RTCSessionDescription(offer));
            await this.flushPendingIce(from);
            const answer = await peer.pc.createAnswer();
            await peer.pc.setLocalDescription(answer);
            this.signal('rtc-answer', { to: from, answer });
        } catch (err) {
            console.error('[audio] handleOffer failed', from, err);
            this.dropPeer(from);
        }
    }

    async handleAnswer(from, answer) {
        const peer = this.peers.get(from);
        if (!peer) return;
        try {
            await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
            await this.flushPendingIce(from);
        } catch (err) {
            console.error('[audio] handleAnswer failed', from, err);
            this.dropPeer(from);
        }
    }

    async handleIce(from, candidate) {
        const peer = this.peers.get(from);
        if (!peer) return;
        const type = parseCandidateType(candidate?.candidate);
        if (type) peer.remoteCandidateTypes.add(type);
        if (!peer.pc.remoteDescription) {
            peer.pendingIce.push(candidate);
            return;
        }
        try {
            await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error('[audio] addIceCandidate failed', from, err);
        }
    }

    async flushPendingIce(from) {
        const peer = this.peers.get(from);
        if (!peer || peer.pendingIce.length === 0) return;
        for (const c of peer.pendingIce) {
            try {
                await peer.pc.addIceCandidate(new RTCIceCandidate(c));
            } catch (err) {
                console.warn('[audio] flushed ICE failed', err);
            }
        }
        peer.pendingIce = [];
    }

    ensurePeer(userId) {
        const existing = this.peers.get(userId);
        if (existing) return existing;

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        const peer = {
            pc,
            audioEl: null,
            pendingIce: [],
            weOffered: undefined,    // set by offerTo (true) / handleOffer (false)
            iceRestartCount: 0,
            localCandidateTypes: new Set(),
            remoteCandidateTypes: new Set(),
            // Voice activity monitoring
            analyser: null,
            levelBuf: null,
            lastLevel: 0
        };
        this.peers.set(userId, peer);

        if (this.localStream) {
            for (const track of this.localStream.getTracks()) {
                pc.addTrack(track, this.localStream);
            }
        }

        pc.onicecandidate = (e) => {
            if (!e.candidate) return;
            const type = parseCandidateType(e.candidate.candidate);
            if (type) peer.localCandidateTypes.add(type);
            this.signal('rtc-ice', { to: userId, candidate: e.candidate });
        };

        pc.ontrack = (e) => {
            const stream = e.streams[0];
            let el = peer.audioEl;
            if (!el) {
                el = document.createElement('audio');
                el.autoplay = true;
                el.dataset.userId = userId;
                document.body.appendChild(el);
                peer.audioEl = el;
            }
            el.srcObject = stream;
            this.applySink(el);
            el.play().catch(err => console.warn('[audio] autoplay blocked', err));
            this.attachLevelMeter(peer, stream);
        };

        pc.onconnectionstatechange = () => {
            console.log(`[audio] peer ${userId} → ${pc.connectionState}`);
            if (this.onPeerStateChange) this.onPeerStateChange(userId, pc.connectionState);

            if (pc.connectionState === 'connected') {
                peer.iceRestartCount = 0;
            }
            if (pc.connectionState === 'failed') {
                // Only the side that originally offered restarts. The other
                // side just waits for the new offer.
                if (peer.weOffered && peer.iceRestartCount < 2) {
                    peer.iceRestartCount += 1;
                    console.warn(`[audio] peer ${userId} failed; ICE-restart attempt ${peer.iceRestartCount}`);
                    this.offerTo(userId, { iceRestart: true });
                } else {
                    console.error(`[audio] peer ${userId} unrecoverable; dropping`);
                    this.dropPeer(userId);
                }
            } else if (pc.connectionState === 'closed') {
                this.dropPeer(userId);
            }
        };
        pc.oniceconnectionstatechange = () => {
            console.log(`[audio] peer ${userId} ICE → ${pc.iceConnectionState}`);
        };
        pc.onicegatheringstatechange = () => {
            console.log(`[audio] peer ${userId} gathering → ${pc.iceGatheringState}`);
        };

        return peer;
    }

    attachLevelMeter(peer, stream) {
        if (peer.analyser) return; // already wired
        try {
            const ctx = this.getAudioContext();
            const src = ctx.createMediaStreamSource(stream);
            const an = ctx.createAnalyser();
            an.fftSize = 512;
            src.connect(an);
            peer.analyser = an;
            peer.levelBuf = new Float32Array(an.fftSize);
            this.startLevelLoop();
        } catch (err) {
            console.warn('[audio] attachLevelMeter failed', err);
        }
    }

    startLevelLoop() {
        if (this.levelLoop) return;
        const tick = () => {
            for (const [userId, peer] of this.peers.entries()) {
                if (!peer.analyser) continue;
                peer.analyser.getFloatTimeDomainData(peer.levelBuf);
                let sumSq = 0;
                for (let i = 0; i < peer.levelBuf.length; i++) {
                    sumSq += peer.levelBuf[i] * peer.levelBuf[i];
                }
                const rms = Math.sqrt(sumSq / peer.levelBuf.length);
                const level = Math.min(1, rms * 8);
                // Smooth + only emit on meaningful change
                peer.lastLevel = peer.lastLevel * 0.6 + level * 0.4;
                if (this.onPeerLevel) this.onPeerLevel(userId, peer.lastLevel);
            }
            this.levelLoop = requestAnimationFrame(tick);
        };
        this.levelLoop = requestAnimationFrame(tick);
    }
    stopLevelLoop() {
        if (this.levelLoop) cancelAnimationFrame(this.levelLoop);
        this.levelLoop = null;
    }

    dropPeer(userId) {
        const peer = this.peers.get(userId);
        if (!peer) return;
        try { peer.pc.close(); } catch {}
        if (peer.audioEl) {
            peer.audioEl.srcObject = null;
            peer.audioEl.remove();
        }
        this.peers.delete(userId);
    }

    dropAll() {
        for (const id of Array.from(this.peers.keys())) this.dropPeer(id);
        this.stopLevelLoop();
        if (this.sharedAudioCtx) {
            try { this.sharedAudioCtx.close(); } catch {}
            this.sharedAudioCtx = null;
        }
    }

    // ---------- Diagnostics ----------
    //
    // Returns a digest of every active peer connection: ICE candidate types,
    // selected pair, RTT, packets/bytes inbound and outbound, audio level.
    // Designed to be paste-friendly when grabbing from DevTools console.

    async diagnose() {
        const peers = [];
        for (const [userId, peer] of this.peers.entries()) {
            const stats = await peer.pc.getStats().catch(() => null);
            const digest = stats ? digestStats(stats) : null;
            peers.push({
                userId: userId.slice(0, 8) + '…',
                state: peer.pc.connectionState,
                ice: peer.pc.iceConnectionState,
                signaling: peer.pc.signalingState,
                weOffered: peer.weOffered,
                restarts: peer.iceRestartCount,
                localCands: Array.from(peer.localCandidateTypes).join(',') || '-',
                remoteCands: Array.from(peer.remoteCandidateTypes).join(',') || '-',
                ...(digest || {}),
                level: peer.lastLevel?.toFixed(3) ?? '-'
            });
        }
        const me = {
            mic: this.localStream ? {
                trackCount: this.localStream.getAudioTracks().length,
                enabled: this.localStream.getAudioTracks()[0]?.enabled,
                muted: this.muted,
                label: this.localStream.getAudioTracks()[0]?.label,
                readyState: this.localStream.getAudioTracks()[0]?.readyState
            } : null,
            inputDevice: this.inputDeviceId || '(default)',
            outputDevice: this.outputDeviceId || '(default)',
            iceServers: ICE_SERVERS.map(s => s.urls)
        };
        return { me, peers };
    }
}

// Parse the ICE candidate string returned by RTCIceCandidate.candidate.
// Format example:
//   "candidate:842163049 1 udp 1677729535 192.0.2.1 38968 typ srflx ..."
// We pull out the "typ <type>" token which is one of host/srflx/prflx/relay.
function parseCandidateType(candStr) {
    if (!candStr) return null;
    const m = /\btyp\s+(host|srflx|prflx|relay)\b/.exec(candStr);
    return m ? m[1] : null;
}

// Digest a getStats() RTCStatsReport into a flat record. Keys we care about:
//   pair: "<localType>↔<remoteType>" of the selected candidate pair
//   rtt: round-trip time in ms
//   recv: packets received
//   recvLost: packets lost
//   sent: packets sent
//   audio: audioLevel of the inbound audio (0..1, sender's peak)
function digestStats(stats) {
    let selectedPairId = null;
    for (const r of stats.values()) {
        if (r.type === 'transport' && r.selectedCandidatePairId) {
            selectedPairId = r.selectedCandidatePairId;
            break;
        }
    }
    let pair = null;
    let inbound = null;
    let outbound = null;
    for (const r of stats.values()) {
        if (r.type === 'candidate-pair') {
            const isSel = selectedPairId ? r.id === selectedPairId : (r.selected || r.nominated);
            if (isSel) pair = r;
        }
        if (r.type === 'inbound-rtp' && r.kind === 'audio') inbound = r;
        if (r.type === 'outbound-rtp' && r.kind === 'audio') outbound = r;
    }
    const local = pair ? stats.get(pair.localCandidateId) : null;
    const remote = pair ? stats.get(pair.remoteCandidateId) : null;
    return {
        pair: pair && local && remote
            ? `${local.candidateType}↔${remote.candidateType} (${local.protocol})`
            : '-',
        rtt: pair?.currentRoundTripTime != null
            ? Math.round(pair.currentRoundTripTime * 1000) + 'ms'
            : '-',
        recv: inbound?.packetsReceived ?? 0,
        recvLost: inbound?.packetsLost ?? 0,
        sent: outbound?.packetsSent ?? 0,
        audio: inbound?.audioLevel?.toFixed(3) ?? '-'
    };
}

// Simple input-level meter for the settings panel. Returns a stop() function.
// onLevel receives a number 0..1 every animation frame.
//
// Disables AGC/noise-suppression/echo-cancellation so the user sees the
// raw mic level — the in-voice path keeps those processing on.
//
// We use RMS (averaged energy) rather than peak, then apply a gain so
// normal speech reads in the 30-80% range instead of barely registering.
export async function startMicLevel(deviceId, onLevel) {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            autoGainControl: false,
            noiseSuppression: false,
            echoCancellation: false
        },
        video: false
    });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let raf = 0;
    let stopped = false;
    let smoothed = 0;

    const tick = () => {
        if (stopped) return;
        analyser.getFloatTimeDomainData(buf);
        // RMS over the buffer.
        let sumSq = 0;
        for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
        const rms = Math.sqrt(sumSq / buf.length);
        // Apply a gain so a normal speaking voice (~ -25 dBFS rms ≈ 0.05)
        // reads about 50%, then clamp.
        const target = Math.min(1, rms * 8);
        // Fast attack, slow release for a natural-feeling needle.
        smoothed = target > smoothed ? target : smoothed * 0.85 + target * 0.15;
        onLevel(smoothed);
        raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
        stopped = true;
        cancelAnimationFrame(raf);
        stream.getTracks().forEach(t => t.stop());
        ctx.close();
    };
}
