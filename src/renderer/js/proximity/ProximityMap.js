// src/renderer/js/proximity/ProximityMap.js - Fixed bot toggle and mini map consistency
export class ProximityMap {
    constructor(canvas, app) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.app = app;
        this.users = new Map(); // userId -> {x, y, username, isSelf, audioElement}
        this.myUserId = null;
        this.proximityRange = 100;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.testBotId = null;
        this.testBotMovementInterval = null;
        this.isMinimapInstance = false; // Track if this is a minimap
        this.syncing = false; // Prevent infinite sync loops
        
        // Audio constants for proximity calculation
        this.EDGE_START = 0.75; // When edge effects begin
        this.OUTER_RANGE = 1.3; // Allow audio to continue beyond visible range
        
        this.setupEventListeners();
        this.startRenderLoop();
        this.resizeCanvas();
        
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    // Set if this is a minimap instance
    setMinimapMode(isMinimapInstance = false) {
        this.isMinimapInstance = isMinimapInstance;
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
            
            // Emit position update to other users and sync with other map instances
            if (this.app && this.app.sendPositionUpdate) {
                this.app.sendPositionUpdate(newX, newY);
            }
            
            // FIXED: Sync position between main map and minimap
            this.syncWithOtherMaps(this.myUserId, newX, newY);
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

    // FIXED: Sync position between main map and minimap
    syncWithOtherMaps(userId, x, y) {
        // Don't create infinite loops
        if (this.syncing) return;
        
        // Sync with main map if this is minimap
        if (this.isMinimapInstance && window.proximityApp?.proximityMap) {
            window.proximityApp.proximityMap.syncing = true;
            window.proximityApp.proximityMap.updateUserPosition(userId, x, y);
            window.proximityApp.proximityMap.updateAudioProximity();
            setTimeout(() => {
                if (window.proximityApp?.proximityMap) {
                    window.proximityApp.proximityMap.syncing = false;
                }
            }, 10);
        }
        
        // Sync with minimap if this is main map
        if (!this.isMinimapInstance && window.proximityApp?.miniProximityMap) {
            window.proximityApp.miniProximityMap.syncing = true;
            window.proximityApp.miniProximityMap.updateUserPosition(userId, x, y);
            window.proximityApp.miniProximityMap.updateAudioProximity();
            setTimeout(() => {
                if (window.proximityApp?.miniProximityMap) {
                    window.proximityApp.miniProximityMap.syncing = false;
                }
            }, 10);
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
        // Center spawn position with slight randomization
        const x = this.canvas.width / 2 + (Math.random() - 0.5) * 100;
        const y = this.canvas.height / 2 + (Math.random() - 0.5) * 100;
        
        let userColor = 'blue';
        if (isSelf && this.app && this.app.settingsManager) {
            userColor = this.app.settingsManager.get('userColor') || 'purple';
        }
        
        this.users.set(userId, {
            x,
            y,
            username: username || `User ${userId.slice(0, 4)}`,
            isSelf,
            audioElement,
            lastUpdate: Date.now(),
            color: userColor
        });

        if (isSelf) {
            this.myUserId = userId;
        }

        this.updateAudioProximity();
        
        // FIXED: Sync user addition between maps
        this.syncUserWithOtherMaps(userId, username, isSelf, audioElement, userColor);
    }

    // FIXED: Sync user operations between main map and minimap
    syncUserWithOtherMaps(userId, username, isSelf, audioElement, userColor) {
        if (this.syncing) return;
        
        const user = this.users.get(userId);
        if (!user) return;
        
        // Sync with main map if this is minimap
        if (this.isMinimapInstance && window.proximityApp?.proximityMap) {
            if (!window.proximityApp.proximityMap.users.has(userId)) {
                window.proximityApp.proximityMap.syncing = true;
                window.proximityApp.proximityMap.users.set(userId, { ...user });
                setTimeout(() => {
                    if (window.proximityApp?.proximityMap) {
                        window.proximityApp.proximityMap.syncing = false;
                    }
                }, 10);
            }
        }
        
        // Sync with minimap if this is main map
        if (!this.isMinimapInstance && window.proximityApp?.miniProximityMap) {
            if (!window.proximityApp.miniProximityMap.users.has(userId)) {
                window.proximityApp.miniProximityMap.syncing = true;
                window.proximityApp.miniProximityMap.users.set(userId, { ...user });
                setTimeout(() => {
                    if (window.proximityApp?.miniProximityMap) {
                        window.proximityApp.miniProximityMap.syncing = false;
                    }
                }, 10);
            }
        }
    }

    removeUser(userId) {
        this.users.delete(userId);
        if (this.myUserId === userId) {
            this.myUserId = null;
        }
        this.updateAudioProximity();
        
        // FIXED: Sync user removal between maps
        if (!this.syncing) {
            if (this.isMinimapInstance && window.proximityApp?.proximityMap) {
                window.proximityApp.proximityMap.syncing = true;
                window.proximityApp.proximityMap.users.delete(userId);
                setTimeout(() => {
                    if (window.proximityApp?.proximityMap) {
                        window.proximityApp.proximityMap.syncing = false;
                    }
                }, 10);
            }
            
            if (!this.isMinimapInstance && window.proximityApp?.miniProximityMap) {
                window.proximityApp.miniProximityMap.syncing = true;
                window.proximityApp.miniProximityMap.users.delete(userId);
                setTimeout(() => {
                    if (window.proximityApp?.miniProximityMap) {
                        window.proximityApp.miniProximityMap.syncing = false;
                    }
                }, 10);
            }
        }
    }

    clearUsers() {
        this.users.clear();
        this.myUserId = null;
        
        // FIXED: Sync clear operation between maps
        if (!this.syncing) {
            if (this.isMinimapInstance && window.proximityApp?.proximityMap) {
                window.proximityApp.proximityMap.syncing = true;
                window.proximityApp.proximityMap.users.clear();
                window.proximityApp.proximityMap.myUserId = null;
                setTimeout(() => {
                    if (window.proximityApp?.proximityMap) {
                        window.proximityApp.proximityMap.syncing = false;
                    }
                }, 10);
            }
            
            if (!this.isMinimapInstance && window.proximityApp?.miniProximityMap) {
                window.proximityApp.miniProximityMap.syncing = true;
                window.proximityApp.miniProximityMap.users.clear();
                window.proximityApp.miniProximityMap.myUserId = null;
                setTimeout(() => {
                    if (window.proximityApp?.miniProximityMap) {
                        window.proximityApp.miniProximityMap.syncing = false;
                    }
                }, 10);
            }
        }
    }

    updateUserPosition(userId, x, y) {
        if (this.users.has(userId)) {
            const user = this.users.get(userId);
            user.x = x;
            user.y = y;
            user.lastUpdate = Date.now();
        }
    }

    updateUserColor(userId, color) {
        if (this.users.has(userId)) {
            this.users.get(userId).color = color;
        }
    }

    setUserAudioElement(userId, audioElement) {
        if (this.users.has(userId)) {
            this.users.get(userId).audioElement = audioElement;
            this.updateAudioProximity();
        }
    }

    centerMyPosition() {
        if (!this.myUserId || !this.users.has(this.myUserId)) return;

        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        this.updateUserPosition(this.myUserId, centerX, centerY);
        this.updateAudioProximity();
        
        // Emit position update
        if (this.app && this.app.sendPositionUpdate) {
            this.app.sendPositionUpdate(centerX, centerY);
        }
        
        // FIXED: Sync center operation between maps
        this.syncWithOtherMaps(this.myUserId, centerX, centerY);
    }

    setProximityRange(range) {
        console.log('Setting proximity range to:', range);
        this.proximityRange = range;
        this.updateAudioProximity();
        
        // FIXED: Sync proximity range between maps
        if (!this.syncing) {
            if (this.isMinimapInstance && window.proximityApp?.proximityMap) {
                window.proximityApp.proximityMap.syncing = true;
                window.proximityApp.proximityMap.proximityRange = range;
                window.proximityApp.proximityMap.updateAudioProximity();
                setTimeout(() => {
                    if (window.proximityApp?.proximityMap) {
                        window.proximityApp.proximityMap.syncing = false;
                    }
                }, 10);
            }
            
            if (!this.isMinimapInstance && window.proximityApp?.miniProximityMap) {
                window.proximityApp.miniProximityMap.syncing = true;
                window.proximityApp.miniProximityMap.proximityRange = range;
                window.proximityApp.miniProximityMap.updateAudioProximity();
                setTimeout(() => {
                    if (window.proximityApp?.miniProximityMap) {
                        window.proximityApp.miniProximityMap.syncing = false;
                    }
                }, 10);
            }
        }
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
            
            const normalizedDistance = distance / this.proximityRange;
            
            if (normalizedDistance <= this.OUTER_RANGE) {
                if (normalizedDistance > this.EDGE_START && normalizedDistance <= 1.0) {
                    // Extra feathering at the edge
                    const edgeFactor = (1 - normalizedDistance) / (1 - this.EDGE_START);
                    volume = Math.pow(edgeFactor, 2) * 0.3;
                } else if (normalizedDistance > 1.0 && normalizedDistance <= this.OUTER_RANGE) {
                    // Extended fadeout beyond visible range
                    const fadeoutFactor = (this.OUTER_RANGE - normalizedDistance) / (this.OUTER_RANGE - 1.0);
                    volume = Math.pow(fadeoutFactor, 3) * 0.1;
                } else {
                    // Normal falloff for closer distances
                    volume = Math.max(0, 1 - normalizedDistance);
                    volume = Math.pow(volume, 0.4);
                }
            }

            // Apply volume with smoothing
            if (user.audioElement) {
                const currentVolume = user.audioElement.volume;
                const smoothedVolume = currentVolume * 0.8 + volume * 0.2;
                user.audioElement.volume = smoothedVolume;
            }
        });
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
                this.drawProximityRange(user.x, user.y, user.color);
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

    drawProximityRange(x, y, color = 'purple') {
        const colorMap = {
            blue: ['rgba(59,130,246,0.3)', 'rgba(59,130,246,0.08)', 'rgba(59,130,246,0.15)'],
            green: ['rgba(16,185,129,0.3)', 'rgba(16,185,129,0.08)', 'rgba(16,185,129,0.15)'],
            purple: ['rgba(139,92,246,0.3)', 'rgba(139,92,246,0.08)', 'rgba(139,92,246,0.15)'],
            red: ['rgba(239,68,68,0.3)', 'rgba(239,68,68,0.08)', 'rgba(239,68,68,0.15)'],
            orange: ['rgba(245,158,11,0.3)', 'rgba(245,158,11,0.08)', 'rgba(245,158,11,0.15)'],
            pink: ['rgba(236,72,153,0.3)', 'rgba(236,72,153,0.08)', 'rgba(236,72,153,0.15)'],
            indigo: ['rgba(99,102,241,0.3)', 'rgba(99,102,241,0.08)', 'rgba(99,102,241,0.15)'],
            cyan: ['rgba(6,182,212,0.3)', 'rgba(6,182,212,0.08)', 'rgba(6,182,212,0.15)']
        };
        
        const [strokeColor, fillColor, extendedStrokeColor] = colorMap[color] || colorMap['purple'];
        
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
        
        const [fillColor, strokeColor] = colorMap[color] || colorMap['purple'];
        
        // Enhanced activity indicator with larger glow
        if (user.isActive) {
            const pulseRadius = 35 + Math.sin(Date.now() * 0.015) * 8;
            const glowColor = colorMap[color] ? colorMap[color][0] : '#8b5cf6';
            
            // Outer glow
            this.ctx.shadowColor = glowColor;
            this.ctx.shadowBlur = 20;
            this.ctx.strokeStyle = glowColor.replace(')', ', 0.4)').replace('rgb', 'rgba');
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.arc(x, y, pulseRadius, 0, Math.PI * 2);
            this.ctx.stroke();
            
            // Inner pulse
            this.ctx.shadowBlur = 10;
            this.ctx.strokeStyle = glowColor.replace(')', ', 0.6)').replace('rgb', 'rgba');
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(x, y, pulseRadius * 0.7, 0, Math.PI * 2);
            this.ctx.stroke();
            
            // Reset shadow
            this.ctx.shadowColor = 'transparent';
            this.ctx.shadowBlur = 0;
        }
        
        // Draw main user circle
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
        this.ctx.fillStyle = isSelf ? strokeColor : '#cbd5e1';
        this.ctx.font = '12px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        const displayName = isSelf ? `${username} (You)` : username;
        this.ctx.fillText(displayName, x, y + 30);
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
            const user = this.users.get(userId);
            user.isActive = isActive;
            
            // Create glow effect when user starts speaking
            if (isActive && userId === this.myUserId) {
                this.createUserGlowEffect(user.x, user.y, user.color);
            }
        }
    }

    createUserGlowEffect(x, y, color) {
        // Create glow element
        const glowElement = document.createElement('div');
        glowElement.className = `proximity-user-glow user-glow-${color}`;
        glowElement.style.cssText = `
            position: absolute;
            left: ${x - 40}px;
            top: ${y - 40}px;
            width: 80px;
            height: 80px;
            border-radius: 50%;
            pointer-events: none;
            z-index: 0;
        `;
        
        // Add to canvas container
        const canvasContainer = this.canvas.parentElement;
        if (canvasContainer) {
            canvasContainer.style.position = 'relative';
            canvasContainer.appendChild(glowElement);
            
            // Remove after animation completes
            setTimeout(() => {
                if (glowElement.parentElement) {
                    glowElement.parentElement.removeChild(glowElement);
                }
            }, 500);
        }
    }

    // FIXED: Test bot functionality - proper state management
    addTestBot() {
        console.log('Adding test bot...');
        
        // FIXED: Only allow one test bot per map type
        if (this.testBotId) {
            console.log('Test bot already exists, removing first...');
            this.removeTestBot();
        }

        this.testBotId = 'test-bot-' + Date.now() + (this.isMinimapInstance ? '-mini' : '-main');
        
        // Create audio element for test sound
        const audioElement = new Audio('assets/TestNoise.mp3');
        audioElement.loop = true;
        audioElement.volume = 0; // Start at 0, proximity will adjust
        
        let x, y;
        if (this.myUserId && this.users.has(this.myUserId)) {
            const myUser = this.users.get(this.myUserId);
            const angle = Math.random() * Math.PI * 2;
            const distance = this.proximityRange * 0.9; // 90% of proximity range
            
            x = myUser.x + Math.cos(angle) * distance;
            y = myUser.y + Math.sin(angle) * distance;
            
            // Ensure within canvas bounds
            x = Math.max(20, Math.min(this.canvas.width - 20, x));
            y = Math.max(20, Math.min(this.canvas.height - 20, y));
        } else {
            x = Math.random() * (this.canvas.width - 40) + 20;
            y = Math.random() * (this.canvas.height - 40) + 20;
        }
        
        this.users.set(this.testBotId, {
            x, y,
            username: 'Test Bot',
            isSelf: false,
            audioElement,
            lastUpdate: Date.now(),
            color: 'green',
            isBot: true
        });
        
        // Play the audio
        audioElement.play().catch(error => {
            console.log('Audio autoplay prevented, will work after user interaction');
        });
        
        this.updateAudioProximity();
        this.startTestBotMovement();
        
        // FIXED: Sync test bot addition with other map (only from main map)
        if (!this.isMinimapInstance) {
            this.syncTestBotWithMinimap('add');
        }
        
        console.log('Test bot added successfully');
        return this.testBotId;
    }
    
    removeTestBot() {
        console.log('Removing test bot...');
        
        if (this.testBotMovementInterval) {
            clearInterval(this.testBotMovementInterval);
            this.testBotMovementInterval = null;
        }
        
        if (this.testBotId && this.users.has(this.testBotId)) {
            const bot = this.users.get(this.testBotId);
            
            if (bot.audioElement) {
                bot.audioElement.pause();
                bot.audioElement.currentTime = 0;
                bot.audioElement.srcObject = null;
            }
            
            this.users.delete(this.testBotId);
            this.testBotId = null;
            this.updateAudioProximity();
            
            // FIXED: Sync test bot removal with other map (only from main map)
            if (!this.isMinimapInstance) {
                this.syncTestBotWithMinimap('remove');
            }
            
            console.log('Test bot removed successfully');
        }
    }

    // FIXED: Sync test bot operations between main map and minimap
    syncTestBotWithMinimap(operation) {
        if (this.syncing) return;
        
        if (operation === 'add' && window.proximityApp?.miniProximityMap) {
            const bot = this.users.get(this.testBotId);
            if (bot) {
                window.proximityApp.miniProximityMap.syncing = true;
                
                // Add bot to minimap without audio element (only main map handles audio)
                window.proximityApp.miniProximityMap.testBotId = this.testBotId;
                window.proximityApp.miniProximityMap.users.set(this.testBotId, {
                    ...bot,
                    audioElement: null // No audio for minimap
                });
                
                setTimeout(() => {
                    if (window.proximityApp?.miniProximityMap) {
                        window.proximityApp.miniProximityMap.syncing = false;
                    }
                }, 10);
            }
        } else if (operation === 'remove' && window.proximityApp?.miniProximityMap) {
            window.proximityApp.miniProximityMap.syncing = true;
            window.proximityApp.miniProximityMap.users.delete(window.proximityApp.miniProximityMap.testBotId);
            window.proximityApp.miniProximityMap.testBotId = null;
            
            setTimeout(() => {
                if (window.proximityApp?.miniProximityMap) {
                    window.proximityApp.miniProximityMap.syncing = false;
                }
            }, 10);
        }
    }
    
    startTestBotMovement() {
        if (this.testBotMovementInterval) {
            clearInterval(this.testBotMovementInterval);
        }
        
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
                    
                    // FIXED: Sync bot position with other map during movement
                    if (!this.isMinimapInstance && window.proximityApp?.miniProximityMap) {
                        const miniBot = window.proximityApp.miniProximityMap.users.get(this.testBotId);
                        if (miniBot) {
                            miniBot.x = bot.x;
                            miniBot.y = bot.y;
                        }
                    }
                    
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
        }, 5000); // Move every 5 seconds
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