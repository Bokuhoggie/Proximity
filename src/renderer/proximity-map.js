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
        this.testBotId = null;
        this.testBotMovementInterval = null;
        
        // Define audio constants for proximity calculation
        this.EDGE_START = 0.75; // When edge effects begin (80% of max range)
        this.OUTER_RANGE = 1.3; // Allow audio to continue beyond visible range (120%)
        
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
            lastUpdate: Date.now(),
            color: isSelf ? (this.app.settings.userColor || 'purple') : undefined
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
            
            // Calculate normalized distance
            const normalizedDistance = distance / this.proximityRange;
            
            if (normalizedDistance <= this.OUTER_RANGE) {
                // Improved feathering with extended fade beyond visible range
                if (normalizedDistance > this.EDGE_START && normalizedDistance <= 1.0) {
                    // Extra feathering at the edge (last 20% of visible range)
                    const edgeFactor = (1 - normalizedDistance) / (1 - this.EDGE_START);
                    volume = Math.pow(edgeFactor, 2) * 0.3;
                } else if (normalizedDistance > 1.0 && normalizedDistance <= this.OUTER_RANGE) {
                    // Extended fadeout beyond visible range
                    const fadeoutFactor = (this.OUTER_RANGE - normalizedDistance) / (this.OUTER_RANGE - 1.0);
                    volume = Math.pow(fadeoutFactor, 3) * 0.1; // Very quiet, just audible
                } else {
                    // Normal falloff for closer distances
                    volume = Math.max(0, 1 - normalizedDistance);
                    volume = Math.pow(volume, 0.4); // Gentler curve for more natural falloff
                }
            }

            // Apply volume with some smoothing
            if (user.audioElement) {
                const currentVolume = user.audioElement.volume;
                const smoothedVolume = currentVolume * 0.8 + volume * 0.2;
                user.audioElement.volume = this.app.isDeafened ? 0 : smoothedVolume;
                
                // Apply audio effects if the user is a bot (for testing)
                if (user.isBot && user.audioElement) {
                    // Apply reverb based on distance, with smoothing beyond visible range
                    const isNearEdge = normalizedDistance > this.EDGE_START && normalizedDistance <= this.OUTER_RANGE;

                    try {
                        // Set up audio effects if not already done
                        if (!user.audioEffectsApplied) {
                            // Create audio context if not already present
                            if (!this.audioContext) {
                                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                            }
                            
                            // Create audio nodes for reverb effect
                            const source = this.audioContext.createMediaElementSource(user.audioElement);
                            const reverbNode = this.audioContext.createConvolver();
                            
                            // Create reverb impulse response
                            const reverbTime = 2.5; // seconds
                            const sampleRate = this.audioContext.sampleRate;
                            const impulseLength = sampleRate * reverbTime;
                            const impulseResponse = this.audioContext.createBuffer(2, impulseLength, sampleRate);
                            
                            // Fill impulse response with decaying white noise
                            for (let channel = 0; channel < 2; channel++) {
                                const impulseData = impulseResponse.getChannelData(channel);
                                for (let i = 0; i < impulseLength; i++) {
                                    // Exponential decay
                                    impulseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impulseLength, 1.5);
                                }
                            }
                            
                            reverbNode.buffer = impulseResponse;
                            
                            // Create gain nodes for dry/wet mix
                            const dryGain = this.audioContext.createGain();
                            const wetGain = this.audioContext.createGain();
                            
                            // Initialize with no reverb to fix initial audio issues
                            dryGain.gain.value = 1;
                            wetGain.gain.value = 0;
                            
                            // Connect the nodes
                            source.connect(dryGain);
                            source.connect(reverbNode);
                            reverbNode.connect(wetGain);
                            dryGain.connect(this.audioContext.destination);
                            wetGain.connect(this.audioContext.destination);
                            
                            // Save references to avoid garbage collection
                            user.audioNodes = {
                                source,
                                reverbNode,
                                dryGain,
                                wetGain
                            };
                            
                            user.audioEffectsApplied = true;
                        }
                        
                        // Dynamically adjust reverb mix based on distance
                        if (user.audioNodes) {
                            if (isNearEdge) {
                                let reverbAmount = 0;
                                
                                if (normalizedDistance > this.EDGE_START && normalizedDistance <= 1.0) {
                                    // Gradual increase of reverb as we reach the visible edge
                                    const edgeFactor = (normalizedDistance - this.EDGE_START) / (1.0 - this.EDGE_START);
                                    reverbAmount = Math.min(0.7, edgeFactor * 0.7); // max 70% wet at visible edge
                                } else if (normalizedDistance > 1.0 && normalizedDistance <= this.OUTER_RANGE) {
                                    // Maximum reverb in the fadeout zone beyond visible range
                                    const fadeoutFactor = (this.OUTER_RANGE - normalizedDistance) / (this.OUTER_RANGE - 1.0);
                                    reverbAmount = 0.7 + (0.2 * (1 - fadeoutFactor)); // 70-90% wet in fadeout zone
                                }
                                
                                // Apply with smooth transition
                                const audioCtx = this.audioContext;
                                user.audioNodes.dryGain.gain.setTargetAtTime(1 - reverbAmount, audioCtx.currentTime, 0.1);
                                user.audioNodes.wetGain.gain.setTargetAtTime(reverbAmount, audioCtx.currentTime, 0.1);
                            } else {
                                // No reverb when not at the edge
                                const audioCtx = this.audioContext;
                                user.audioNodes.dryGain.gain.setTargetAtTime(1, audioCtx.currentTime, 0.1);
                                user.audioNodes.wetGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
                            }
                        }
                    } catch (error) {
                        console.error('Error applying audio effects:', error);
                    }
                }
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
        // Use user's color for the proximity range
        let strokeColor = 'rgba(139, 92, 246, 0.3)';
        let fillColor = 'rgba(139, 92, 246, 0.05)';
        let extendedStrokeColor = 'rgba(139, 92, 246, 0.15)';
        
        if (this.myUserId && this.users.has(this.myUserId)) {
            const user = this.users.get(this.myUserId);
            if (user.color) {
                const colorMap = {
                    blue: [
                        'rgba(59,130,246,0.3)', 
                        'rgba(59,130,246,0.08)',
                        'rgba(59,130,246,0.15)'
                    ],
                    green: [
                        'rgba(16,185,129,0.3)', 
                        'rgba(16,185,129,0.08)',
                        'rgba(16,185,129,0.15)'
                    ],
                    purple: [
                        'rgba(139,92,246,0.3)', 
                        'rgba(139,92,246,0.08)',
                        'rgba(139,92,246,0.15)'
                    ],
                    red: [
                        'rgba(239,68,68,0.3)', 
                        'rgba(239,68,68,0.08)',
                        'rgba(239,68,68,0.15)'
                    ],
                    orange: [
                        'rgba(245,158,11,0.3)', 
                        'rgba(245,158,11,0.08)',
                        'rgba(245,158,11,0.15)'
                    ],
                    pink: [
                        'rgba(236,72,153,0.3)', 
                        'rgba(236,72,153,0.08)',
                        'rgba(236,72,153,0.15)'
                    ],
                    indigo: [
                        'rgba(99,102,241,0.3)', 
                        'rgba(99,102,241,0.08)',
                        'rgba(99,102,241,0.15)'
                    ],
                    cyan: [
                        'rgba(6,182,212,0.3)', 
                        'rgba(6,182,212,0.08)',
                        'rgba(6,182,212,0.15)'
                    ]
                };
                [strokeColor, fillColor, extendedStrokeColor] = colorMap[user.color] || [strokeColor, fillColor, extendedStrokeColor];
            }
        }
        
        // Draw extended audible range (faded)
        this.ctx.strokeStyle = extendedStrokeColor;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([2, 4]);
        this.ctx.beginPath();
        this.ctx.arc(x, y, this.proximityRange * this.OUTER_RANGE, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // Draw main proximity range
        this.ctx.strokeStyle = strokeColor;
        this.ctx.fillStyle = fillColor;
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.arc(x, y, this.proximityRange, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    drawUser(user, isSelf) {
        const { x, y, username, color } = user;
        // Use user.color if present, otherwise fallback
        let fillColor = '#8b5cf6';
        let strokeColor = '#a78bfa';
        if (color) {
            const colorMap = {
                blue: ['#3b82f6', '#60a5fa'],
                green: ['#10b981', '#34d399'],
                purple: ['#8b5cf6', '#a78bfa'],
                red: ['#ef4444', '#f87171'],
                orange: ['#f59e0b', '#fbbf24'],
                pink: ['#ec4899', '#f472b6'],
                indigo: ['#6366f1', '#818cf8'],
                cyan: ['#06b6d4', '#22d3ee']
            };
            const [fill, stroke] = colorMap[color] || ['#8b5cf6', '#a78bfa'];
            fillColor = fill;
            strokeColor = stroke;
        }
        this.ctx.fillStyle = fillColor;
        this.ctx.strokeStyle = strokeColor;
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
        let nameColor = isSelf && color ? color : null;
        if (nameColor) {
            const colorMap = {
                blue: '#3b82f6',
                green: '#10b981',
                purple: '#8b5cf6',
                red: '#ef4444',
                orange: '#f59e0b',
                pink: '#ec4899',
                indigo: '#6366f1',
                cyan: '#06b6d4'
            };
            this.ctx.fillStyle = colorMap[nameColor] || '#a78bfa';
        } else {
            this.ctx.fillStyle = isSelf ? '#a78bfa' : '#cbd5e1';
        }
        this.ctx.font = '12px sans-serif';
        this.ctx.textAlign = 'center';
        this.textBaseline = 'top';
        const displayName = isSelf ? `${username} (You)` : username;
        this.ctx.fillText(displayName, x, y + 30);
        
        // Activity indicator (pulsing effect when speaking)
        if (user.isActive) {
            const pulseRadius = 25 + Math.sin(Date.now() * 0.01) * 5;
            let glowColor = 'rgba(16, 185, 129, 0.6)';
            if (color) {
                const colorMap = {
                    blue: 'rgba(59,130,246,0.6)',
                    green: 'rgba(16,185,129,0.6)',
                    purple: 'rgba(139,92,246,0.6)',
                    red: 'rgba(239,68,68,0.6)',
                    orange: 'rgba(245,158,11,0.6)',
                    pink: 'rgba(236,72,153,0.6)',
                    indigo: 'rgba(99,102,241,0.6)',
                    cyan: 'rgba(6,182,212,0.6)'
                };
                glowColor = colorMap[color] || glowColor;
            }
            this.ctx.strokeStyle = glowColor;
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

    // Add this method to allow updating a user's color
    updateUserColor(userId, color) {
        if (this.users.has(userId)) {
            this.users.get(userId).color = color;
        }
    }

    addTestBot() {
        // Remove existing test bot if there is one
        this.removeTestBot();

        // Create a test bot ID
        this.testBotId = 'test-bot-' + Date.now();
        
        // Create audio element for test sound
        const audioElement = new Audio('assets/TestNoise.mp3');
        audioElement.loop = true;
        
        // Initially set volume to 0 to prevent being heard before proximity is applied
        audioElement.volume = 0;
        
        // Position the bot at a distance away from the user 
        // to avoid being immediately heard at full volume
        let x, y;
        
        if (this.myUserId && this.users.has(this.myUserId)) {
            // Position at a safe distance from user
            const myUser = this.users.get(this.myUserId);
            const angle = Math.random() * Math.PI * 2;
            const distance = this.proximityRange * 0.9; // 90% of proximity range
            
            x = myUser.x + Math.cos(angle) * distance;
            y = myUser.y + Math.sin(angle) * distance;
            
            // Ensure within canvas bounds
            x = Math.max(20, Math.min(this.canvas.width - 20, x));
            y = Math.max(20, Math.min(this.canvas.height - 20, y));
        } else {
            // Random position if no user exists
            x = Math.random() * (this.canvas.width - 40) + 20;
            y = Math.random() * (this.canvas.height - 40) + 20;
        }
        
        // Add bot to users map
        this.users.set(this.testBotId, {
            x,
            y,
            username: 'Test Bot',
            isSelf: false,
            audioElement,
            lastUpdate: Date.now(),
            color: 'green',
            isBot: true,
            audioEffectsApplied: false
        });
        
        // Play the audio
        audioElement.play();
        
        // Update audio proximity before animation starts
        this.updateAudioProximity();
        
        // Start bot movement
        this.startTestBotMovement();
        
        return this.testBotId;
    }
    
    removeTestBot() {
        // Stop the movement interval
        if (this.testBotMovementInterval) {
            clearInterval(this.testBotMovementInterval);
            this.testBotMovementInterval = null;
        }
        
        // Remove the bot and stop audio
        if (this.testBotId && this.users.has(this.testBotId)) {
            const bot = this.users.get(this.testBotId);
            
            // Clean up audio processing nodes if they exist
            if (bot.audioNodes) {
                try {
                    bot.audioNodes.source.disconnect();
                    bot.audioNodes.reverbNode.disconnect();
                    bot.audioNodes.dryGain.disconnect();
                    bot.audioNodes.wetGain.disconnect();
                } catch (error) {
                    console.error('Error disconnecting audio nodes:', error);
                }
                bot.audioNodes = null;
            }
            
            if (bot.audioElement) {
                bot.audioElement.pause();
                bot.audioElement.srcObject = null;
            }
            
            this.users.delete(this.testBotId);
            this.testBotId = null;
            this.updateAudioProximity();
        }
    }
    
    startTestBotMovement() {
        // Stop any existing movement interval
        if (this.testBotMovementInterval) {
            clearInterval(this.testBotMovementInterval);
        }
        
        // Move the bot randomly every 3 seconds
        this.testBotMovementInterval = setInterval(() => {
            if (this.testBotId && this.users.has(this.testBotId)) {
                const bot = this.users.get(this.testBotId);
                
                // Random movement direction
                const targetX = Math.random() * (this.canvas.width - 40) + 20;
                const targetY = Math.random() * (this.canvas.height - 40) + 20;
                
                // Animate the movement over 3 seconds
                const startX = bot.x;
                const startY = bot.y;
                const startTime = Date.now();
                const duration = 3000;
                
                const animateMovement = () => {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    
                    // Ease-in-out movement
                    const easing = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                    
                    bot.x = startX + (targetX - startX) * easing;
                    bot.y = startY + (targetY - startY) * easing;
                    
                    if (progress < 1) {
                        requestAnimationFrame(animateMovement);
                    }
                    
                    // Update audio proximity after each movement step
                    this.updateAudioProximity();
                };
                
                animateMovement();
                
                // Show speaking activity for half a second
                bot.isActive = true;
                setTimeout(() => {
                    if (this.testBotId && this.users.has(this.testBotId)) {
                        this.users.get(this.testBotId).isActive = false;
                    }
                }, 500);
            }
        }, 5000);
    }
}

export { ProximityMap };