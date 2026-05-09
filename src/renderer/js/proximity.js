// Proximity map — early scaffolding.
//
// Coordinates are normalized 0..1 (server keeps the canonical state in
// these units). Each user in the active voice channel has a position;
// the map renders a colored dot per user. Dragging your own dot emits
// position-update; dragging stops at the canvas edges.
//
// Audio: the client computes distance from "me" to each remote peer
// and sets that peer's audio volume on a smooth falloff curve. Beyond
// MAX_DIST you can't hear them; closer than MIN_DIST you hear at full
// volume. Linear in between for now (simple is fine; we can swap in
// inverse-square later if it sounds bad).
//
// "Start scratching" scope: 2D map, no stereo panning, no custom
// background, no zoom. Fixed canvas. Plenty to iterate on.

const MIN_DIST = 0.05;   // closer than this = full volume
const MAX_DIST = 0.6;    // beyond this = silent

export class ProximityMap {
    constructor({ container, audio, socket, getMyUserId, getProfile, getActiveChannelId }) {
        this.container = container;
        this.audio = audio;
        this.socket = socket;
        this.getMyUserId = getMyUserId;
        this.getProfile = getProfile;
        this.getActiveChannelId = getActiveChannelId;

        this.positions = new Map(); // uuid -> {x, y}
        this.dragging = null;       // userId being dragged (only own)
        this.canvas = null;
        this.ctx = null;
        this.rafHandle = 0;

        this.build();
        this.bindEvents();
    }

    build() {
        this.container.innerHTML = '';
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'proximity-canvas';
        this.canvas.width = 600;
        this.canvas.height = 400;
        this.container.append(this.canvas);
        this.ctx = this.canvas.getContext('2d');
    }

    bindEvents() {
        let pointerId = null;
        this.canvas.addEventListener('pointerdown', (e) => {
            const { x, y } = this.eventToNormalized(e);
            const myId = this.getMyUserId();
            const myPos = this.positions.get(myId);
            // Only let user drag their own dot. Click anywhere snaps you there.
            if (myPos && Math.hypot(myPos.x - x, myPos.y - y) < 0.1) {
                this.dragging = myId;
            } else {
                this.dragging = myId;
                this.applyMyPosition(x, y);
            }
            this.canvas.setPointerCapture(e.pointerId);
            pointerId = e.pointerId;
        });
        this.canvas.addEventListener('pointermove', (e) => {
            if (this.dragging === null) return;
            const { x, y } = this.eventToNormalized(e);
            this.applyMyPosition(x, y);
        });
        const stop = (e) => {
            if (pointerId !== null) this.canvas.releasePointerCapture(pointerId);
            pointerId = null;
            this.dragging = null;
        };
        this.canvas.addEventListener('pointerup', stop);
        this.canvas.addEventListener('pointercancel', stop);
        this.canvas.addEventListener('pointerleave', () => { /* keep capture */ });
    }

    eventToNormalized(e) {
        const r = this.canvas.getBoundingClientRect();
        return {
            x: clamp((e.clientX - r.left) / r.width, 0, 1),
            y: clamp((e.clientY - r.top) / r.height, 0, 1)
        };
    }

    applyMyPosition(x, y) {
        const myId = this.getMyUserId();
        if (!myId) return;
        this.positions.set(myId, { x, y });
        // Throttle outbound emits to ~30 Hz so we don't spam socket.
        if (!this._lastEmit || Date.now() - this._lastEmit > 33) {
            this.socket.emit('position-update', { x, y });
            this._lastEmit = Date.now();
        }
        this.applyVolumes();
        this.render();
    }

    // Called from app.js when a position arrives over the wire.
    setRemotePosition(userId, x, y) {
        this.positions.set(userId, { x, y });
        this.applyVolumes();
        this.render();
    }

    setInitialPositions(positions) {
        this.positions.clear();
        for (const [uuid, pos] of Object.entries(positions || {})) {
            this.positions.set(uuid, pos);
        }
        this.applyVolumes();
        this.render();
    }

    removeUser(userId) {
        this.positions.delete(userId);
        this.render();
    }

    applyVolumes() {
        const myId = this.getMyUserId();
        const myPos = myId ? this.positions.get(myId) : null;
        if (!myPos) return;
        for (const [userId, pos] of this.positions.entries()) {
            if (userId === myId) continue;
            const d = Math.hypot(pos.x - myPos.x, pos.y - myPos.y);
            const vol = distanceToVolume(d);
            this.audio.setPeerVolume(userId, vol);
        }
    }

    render() {
        if (!this.ctx) return;
        const c = this.canvas;
        const ctx = this.ctx;
        const w = c.width;
        const h = c.height;

        ctx.clearRect(0, 0, w, h);
        // Subtle grid
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 10; i++) {
            ctx.beginPath();
            ctx.moveTo((i / 10) * w, 0);
            ctx.lineTo((i / 10) * w, h);
            ctx.moveTo(0, (i / 10) * h);
            ctx.lineTo(w, (i / 10) * h);
            ctx.stroke();
        }

        // Hearing radius around me
        const myId = this.getMyUserId();
        const myPos = myId ? this.positions.get(myId) : null;
        if (myPos) {
            ctx.strokeStyle = 'rgba(122, 162, 247, 0.25)';
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.arc(myPos.x * w, myPos.y * h, MAX_DIST * Math.min(w, h), 0, 2 * Math.PI);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Each user
        for (const [userId, pos] of this.positions.entries()) {
            const profile = this.getProfile(userId);
            const isMe = userId === myId;
            const x = pos.x * w;
            const y = pos.y * h;

            // Outer ring for "me"
            if (isMe) {
                ctx.fillStyle = 'rgba(255,255,255,0.06)';
                ctx.beginPath();
                ctx.arc(x, y, 22, 0, 2 * Math.PI);
                ctx.fill();
            }

            // Dot
            ctx.fillStyle = profile?.color || '#888';
            ctx.beginPath();
            ctx.arc(x, y, isMe ? 14 : 10, 0, 2 * Math.PI);
            ctx.fill();

            // Border
            ctx.strokeStyle = isMe ? '#fff' : 'rgba(255,255,255,0.4)';
            ctx.lineWidth = isMe ? 2 : 1;
            ctx.stroke();

            // Name below
            ctx.fillStyle = '#c0caf5';
            ctx.font = '12px -apple-system, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(profile?.username || '?', x, y + (isMe ? 32 : 26));
        }
    }

    destroy() {
        cancelAnimationFrame(this.rafHandle);
        this.container.innerHTML = '';
    }
}

function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
}

function distanceToVolume(d) {
    if (d <= MIN_DIST) return 1;
    if (d >= MAX_DIST) return 0;
    return 1 - (d - MIN_DIST) / (MAX_DIST - MIN_DIST);
}
