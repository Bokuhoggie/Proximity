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

const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
];

export class AudioManager {
    constructor({ signal, onPeerStateChange }) {
        this.signal = signal;                       // (event, data) => void
        this.onPeerStateChange = onPeerStateChange; // optional UI callback
        this.localStream = null;
        this.muted = false;
        this.peers = new Map();   // userId -> { pc, audioEl, pendingIce: [] }
    }

    async startMic() {
        if (this.localStream) return this.localStream;
        this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false
        });
        // Apply current mute state to the new track.
        this.applyMute();
        return this.localStream;
    }

    stopMic() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(t => t.stop());
            this.localStream = null;
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
            el.play().catch(err => console.warn('[audio] autoplay blocked', err));
        };

        pc.onconnectionstatechange = () => {
            if (this.onPeerStateChange) this.onPeerStateChange(userId, pc.connectionState);
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                this.dropPeer(userId);
            }
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
