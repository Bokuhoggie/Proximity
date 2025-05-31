// Proximity Map for handling user positions and audio proximity
class ProximityMap {
    constructor(canvas, proximityApp) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.app = proximityApp;
        this.users = new Map(); // userId -> {x, y, username, isSelf, audioElement}
        this.myUserId = null;
        this.proximityRange = 100;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        
        this.setupEventListeners();
        this.startRenderLoop();
        
        // Set canvas size
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
        this.canvas.addEventListener('mouseleave', () => this.handleMouseUp());
        
        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', () => this.handleMouseUp());
    }

    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (this.myUserId && this.users.has(this.myUserId)) {
            const myUser = this.users.get(this.myUserId);
            const distance = Math.sqrt((x - myUser.x) ** 2 + (y - myUser.y) ** 2);
            
            if (distance <= 20) { // User circle radius is 20px
                this.isDragging = true;
                this.dragOffset = { x: x - myUser.x, y: y - myUser.y };
                this.canvas.style.cursor = 'grabbing';
            }
        }
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (this.isDragging && this.myUserId) {
            const newX = Math.max(20, Math.min(this.canvas.width - 20, x - this.dragOffset.x));
            const newY = Math.max(20, Math.min(this.canvas.height - 20, y - this.dragOffset.y));
            
            this.updateUserPosition(this.myUserId, newX, newY);
            this.updateAudioProximity();
            
            // Emit position update to other users
            if (this.app.socket) {
                this.app.socket.emit('position-update', {
                    roomId: this.app.currentRoom,
                    x: newX,
                    y: newY
                });
            }
        } else {
            // Update cursor based on hover
            let isHovering = false;
            if (this.myUserId && this.users.has(this.myUserId)) {
                const myUser = this.users.get(this.myUserId);
                const distance = Math.sqrt((x - myUser.x) ** 2 + (y - myUser.y) ** 2);
                isHovering = distance <= 20;
            }
            this.canvas.style.cursor = isHovering ? 'grab' : 'crosshair';
        }
    }

    handleMouseUp() {
        this.isDragging = false;
        this.canvas.style.cursor = 'crosshair';
    }

    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.handleMouseDown(mouseEvent);
    }

    handleTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.handleMouseMove(mouseEvent);
    }

    addUser(userId, username, isSelf = false, audioElement = null) {
        // Center spawn position
        const x = this.canvas.width / 2;
        const y = this.canvas.height / 2;
        
        this.users.set(userId, {
            x,
            y,
            username: username || `User ${userId.slice(0, 4)}`,
            isSelf,
            audioElement,
            lastUpdate: Date.now()
        });

        if (isSelf) {
            this.myUserId = userId;
        }

        this.updateAudioProximity();
    }

    // Add center position method
    centerMyPosition() {
        if (!this.myUserId || !this.users.has(this.myUserId)) return;

        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        this.updateUserPosition(this.myUserId, centerX, centerY);
        this.updateAudioProximity();
        
        // Emit position update to other users
        if (this.app.socket) {
            this.app.socket.emit('position-update', {
                roomId: this.app.currentRoom,
                x: centerX,
                y: centerY
            });
        }
    }

    removeUser(userId) {
        this.users.delete(userId);
        if (this.myUserId === userId) {
            this.myUserId = null;
        }
        this.updateAudioProximity();
    }

    updateUserPosition(userId, x, y) {
        if (this.users.has(userId)) {
            const user = this.users.get(userId);
            user.x = x;
            user.y = y;
            user.lastUpdate = Date.now();
        }
    }

    updateRemoteUserPosition(userId, x, y) {
        this.updateUserPosition(userId, x, y);
        this.updateAudioProximity();
    }

    updateAudioProximity() {
        if (!this.myUserId || !this.users.has(this.myUserId)) return;

        const myUser = this.users.get(this.myUserId);
        
        this.users.forEach((user, userId) => {
            if (userId === this.myUserId || !user.audioElement) return;

            const distance = Math.sqrt(
                (myUser.x - user.x) ** 2 + (myUser.y - user.y) ** 2
            );

            // Calculate volume based on proximity (0 to 1)
            let volume = 0;
            if (distance <= this.proximityRange) {
                volume = Math.max(0, 1 - (distance / this.proximityRange));
                volume = Math.pow(volume, 0.5); // Apply curve for more natural falloff
            }

            // Apply volume with some smoothing
            if (user.audioElement) {
                const currentVolume = user.audioElement.volume;
                const smoothedVolume = currentVolume * 0.8 + volume * 0.2;
                user.audioElement.volume = this.app.isDeafened ? 0 : smoothedVolume;
            }
        });
    }

    setProximityRange(range) {
        this.proximityRange = range;
        this.updateAudioProximity();
    }

    startRenderLoop() {
        const render = () => {
            this.render();
            requestAnimationFrame(render);
        };
        render();
    }

    render() {
        // Clear canvas
        this.ctx.fillStyle = '#0f0f23';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid
        this.drawGrid();

        // Draw proximity ranges and users
        this.users.forEach((user, userId) => {
            if (userId === this.myUserId) {
                this.drawProximityRange(user.x, user.y);
            }
        });

        this.users.forEach((user, userId) => {
            this.drawUser(user, userId === this.myUserId);
        });

        // Draw connection lines
        if (this.myUserId && this.users.has(this.myUserId)) {
            this.drawConnectionLines();
        }
    }

    drawGrid() {
        this.ctx.strokeStyle = 'rgba(107, 70, 193, 0.1)';
        this.ctx.lineWidth = 1;
        
        const gridSize = 50;
        
        for (let x = 0; x <= this.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        
        for (let y = 0; y <= this.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }

    drawProximityRange(x, y) {
        this.ctx.strokeStyle = 'rgba(139, 92, 246, 0.3)';
        this.ctx.fillStyle = 'rgba(139, 92, 246, 0.05)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        
        this.ctx.beginPath();
        this.ctx.arc(x, y, this.proximityRange, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    drawUser(user, isSelf) {
        const { x, y, username } = user;
        
        // User circle
        this.ctx.fillStyle = isSelf ? '#8b5cf6' : '#6b46c1';
        this.ctx.strokeStyle = isSelf ? '#a78bfa' : '#8b5cf6';
        this.ctx.lineWidth = 3;
        
        this.ctx.beginPath();
        this.ctx.arc(x, y, 20, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        
        // User initial/icon
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 16px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        const initial = username.charAt(0).toUpperCase();
        this.ctx.fillText(initial, x, y);
        
        // Username label
        this.ctx.fillStyle = isSelf ? '#a78bfa' : '#cbd5e1';
        this.ctx.font = '12px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        
        const displayName = isSelf ? `${username} (You)` : username;
        this.ctx.fillText(displayName, x, y + 30);
        
        // Activity indicator (pulsing effect when speaking)
        if (user.isActive) {
            const pulseRadius = 25 + Math.sin(Date.now() * 0.01) * 5;
            this.ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(x, y, pulseRadius, 0, Math.PI * 2);
            this.ctx.stroke();
        }
    }

    drawConnectionLines() {
        if (!this.myUserId || !this.users.has(this.myUserId)) return;

        const myUser = this.users.get(this.myUserId);
        
        this.users.forEach((user, userId) => {
            if (userId === this.myUserId) return;

            const distance = Math.sqrt(
                (myUser.x - user.x) ** 2 + (myUser.y - user.y) ** 2
            );

            if (distance <= this.proximityRange) {
                const opacity = Math.max(0.1, 1 - (distance / this.proximityRange));
                this.ctx.strokeStyle = `rgba(16, 185, 129, ${opacity * 0.5})`;
                this.ctx.lineWidth = 2;
                
                this.ctx.beginPath();
                this.ctx.moveTo(myUser.x, myUser.y);
                this.ctx.lineTo(user.x, user.y);
                this.ctx.stroke();
            }
        });
    }

    // Called when user speaks to show activity
    setUserActivity(userId, isActive) {
        if (this.users.has(userId)) {
            this.users.get(userId).isActive = isActive;
        }
    }

    // Get current user positions for saving/restoring
    getUserPositions() {
        const positions = {};
        this.users.forEach((user, userId) => {
            positions[userId] = { x: user.x, y: user.y };
        });
        return positions;
    }

    // Restore user positions
    setUserPositions(positions) {
        Object.entries(positions).forEach(([userId, pos]) => {
            if (this.users.has(userId)) {
                this.updateUserPosition(userId, pos.x, pos.y);
            }
        });
        this.updateAudioProximity();
    }
}

export { ProximityMap };