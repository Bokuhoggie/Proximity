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
    constructor({ signal, onPeerStateChange, inputDeviceId, outputDeviceId }) {
        this.signal = signal;                       // (event, data) => void
        this.onPeerStateChange = onPeerStateChange; // optional UI callback
        this.localStream = null;
        this.muted = false;
        this.peers = new Map();   // userId -> { pc, audioEl, pendingIce: [] }
        this.inputDeviceId = inputDeviceId || null;
        this.outputDeviceId = outputDeviceId || null;
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
    async offerTo(userId) {
        const peer = this.ensurePeer(userId);
        try {
            const offer = await peer.pc.createOffer();
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
        const peer = { pc, audioEl: null, pendingIce: [] };
        this.peers.set(userId, peer);

        if (this.localStream) {
            for (const track of this.localStream.getTracks()) {
                pc.addTrack(track, this.localStream);
            }
        }

        pc.onicecandidate = (e) => {
            if (e.candidate) this.signal('rtc-ice', { to: userId, candidate: e.candidate });
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
        };

        pc.onconnectionstatechange = () => {
            console.log(`[audio] peer ${userId} → ${pc.connectionState}`);
            if (this.onPeerStateChange) this.onPeerStateChange(userId, pc.connectionState);
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
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
    }
}

// Simple input-level meter for the settings panel. Returns a stop() function.
// onLevel receives a number 0..1 every animation frame.
export async function startMicLevel(deviceId, onLevel) {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: deviceId ? { exact: deviceId } : undefined },
        video: false
    });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    let raf = 0;
    let stopped = false;

    const tick = () => {
        if (stopped) return;
        analyser.getByteTimeDomainData(buf);
        // Peak deviation from 128 (silence) → 0..1.
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
            const d = Math.abs(buf[i] - 128);
            if (d > peak) peak = d;
        }
        onLevel(Math.min(1, peak / 128));
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
