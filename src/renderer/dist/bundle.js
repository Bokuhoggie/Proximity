/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/renderer/js/audio/AudioManager.js":
/*!***********************************************!*\
  !*** ./src/renderer/js/audio/AudioManager.js ***!
  \***********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   AudioManager: () => (/* binding */ AudioManager)
/* harmony export */ });
// src/renderer/js/audio/AudioManager.js - Fixed version with missing methods
class AudioManager {
    constructor() {
        this.peerConnections = new Map();
        this.localStream = null;
        this.isMuted = false;
        this.initialized = false; // Add this flag
        this.audioContext = null;
        this.micSource = null;
        this.gainNode = null;
        
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ];
    }

    async initialize() {
        try {
            console.log('Initializing audio...');
            
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Setup audio context for gain control
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = 1.0;
            
            this.micSource = this.audioContext.createMediaStreamSource(this.localStream);
            this.micSource.connect(this.gainNode);
            
            this.initialized = true;
            console.log('Audio initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize audio:', error);
            throw new Error('Failed to access microphone: ' + error.message);
        }
    }

    // Add the missing isInitialized method
    isInitialized() {
        return this.initialized;
    }

    async connectToUser(userId, username, userColor) {
        if (this.peerConnections.has(userId)) {
            console.log('Already connected to user:', userId);
            return;
        }

        console.log('Connecting to user:', userId, username);
        
        const peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });
        this.peerConnections.set(userId, peerConnection);

        // Add local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });
        }

        // Handle incoming stream
        peerConnection.ontrack = (event) => {
            console.log('Received remote stream from:', userId);
            const remoteStream = event.streams[0];
            
            // Create audio element
            const audioElement = document.createElement('audio');
            audioElement.autoplay = true;
            audioElement.srcObject = remoteStream;
            audioElement.volume = 1;
            audioElement.style.display = 'none';
            
            // Add to participant
            const participant = document.getElementById(`participant-${userId}`);
            if (participant) {
                participant.appendChild(audioElement);
            }
            
            // Notify app about the audio element for proximity calculations
            if (window.proximityApp && window.proximityApp.proximityMap) {
                window.proximityApp.proximityMap.setUserAudioElement(userId, audioElement);
            }
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && window.proximityApp) {
                window.proximityApp.connectionManager.emit('ice-candidate', {
                    target: userId,
                    candidate: event.candidate
                });
            }
        };

        // Create and send offer
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            if (window.proximityApp) {
                window.proximityApp.connectionManager.emit('offer', {
                    target: userId,
                    offer: offer
                });
            }
        } catch (error) {
            console.error('Error creating offer for user:', userId, error);
            this.peerConnections.delete(userId);
        }
    }

    async handleOffer(offer, from) {
        console.log('Handling offer from:', from);
        
        if (this.peerConnections.has(from)) {
            console.log('Connection already exists for user:', from);
            return;
        }

        const peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });
        this.peerConnections.set(from, peerConnection);

        // Add local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });
        }

        // Handle incoming stream
        peerConnection.ontrack = (event) => {
            console.log('Received remote stream from:', from);
            const remoteStream = event.streams[0];
            
            // Create audio element
            const audioElement = document.createElement('audio');
            audioElement.autoplay = true;
            audioElement.srcObject = remoteStream;
            audioElement.volume = 1;
            audioElement.style.display = 'none';
            
            // Add to participant
            const participant = document.getElementById(`participant-${from}`);
            if (participant) {
                participant.appendChild(audioElement);
            }
            
            // Notify proximity map
            if (window.proximityApp && window.proximityApp.proximityMap) {
                window.proximityApp.proximityMap.setUserAudioElement(from, audioElement);
            }
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && window.proximityApp) {
                window.proximityApp.connectionManager.emit('ice-candidate', {
                    target: from,
                    candidate: event.candidate
                });
            }
        };

        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            if (window.proximityApp) {
                window.proximityApp.connectionManager.emit('answer', {
                    target: from,
                    answer: answer
                });
            }
        } catch (error) {
            console.error('Error handling offer from:', from, error);
            this.peerConnections.delete(from);
        }
    }

    async handleAnswer(answer, from) {
        console.log('Handling answer from:', from);
        
        const peerConnection = this.peerConnections.get(from);
        if (!peerConnection) {
            console.warn('No peer connection found for:', from);
            return;
        }

        try {
            if (peerConnection.signalingState === 'have-local-offer') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            } else {
                console.warn(`Cannot set remote answer in state: ${peerConnection.signalingState}`);
            }
        } catch (error) {
            console.error('Error handling answer from:', from, error);
            this.disconnectFromUser(from);
        }
    }

    async handleIceCandidate(candidate, from) {
        const peerConnection = this.peerConnections.get(from);
        if (!peerConnection) {
            console.warn('No peer connection found for ICE candidate from:', from);
            return;
        }

        try {
            if (peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } else {
                // Queue candidates if remote description not set yet
                if (!peerConnection.queuedCandidates) {
                    peerConnection.queuedCandidates = [];
                }
                peerConnection.queuedCandidates.push(candidate);
            }
        } catch (error) {
            console.error('Error handling ICE candidate from:', from, error);
        }
    }

    disconnectFromUser(userId) {
        const peerConnection = this.peerConnections.get(userId);
        if (peerConnection) {
            peerConnection.close();
            this.peerConnections.delete(userId);
            console.log('Disconnected from user:', userId);
        }
    }

    disconnectAll() {
        console.log('Disconnecting from all users...');
        this.peerConnections.forEach((pc, userId) => {
            pc.close();
        });
        this.peerConnections.clear();
    }

    toggleMute() {
        if (!this.localStream) return;

        this.isMuted = !this.isMuted;
        
        this.localStream.getAudioTracks().forEach(track => {
            track.enabled = !this.isMuted;
        });

        // Update UI
        if (window.proximityApp && window.proximityApp.uiManager) {
            window.proximityApp.uiManager.updateMuteStatus(this.isMuted);
        }

        // Notify server
        if (window.proximityApp) {
            window.proximityApp.updateMicStatus(this.isMuted);
        }

        console.log('Microphone', this.isMuted ? 'muted' : 'unmuted');
    }

    setGain(value) {
        // value: 0-100, map to 0-2
        const gainValue = Math.max(0, Math.min(2, value / 50));
        if (this.gainNode) {
            this.gainNode.gain.value = gainValue;
        }
    }

    async changeInputDevice(deviceId) {
        if (!deviceId) return;

        try {
            // Stop current stream
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }

            // Get new stream with specific device
            const constraints = {
                audio: {
                    deviceId: { exact: deviceId },
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

            // Update audio context
            if (this.micSource) {
                this.micSource.disconnect();
            }
            this.micSource = this.audioContext.createMediaStreamSource(this.localStream);
            this.micSource.connect(this.gainNode);

            // Replace tracks in all peer connections
            this.peerConnections.forEach(pc => {
                const senders = pc.getSenders();
                const audioSender = senders.find(sender => 
                    sender.track && sender.track.kind === 'audio'
                );
                if (audioSender) {
                    audioSender.replaceTrack(this.localStream.getAudioTracks()[0]);
                }
            });

            console.log('Audio input device changed successfully');
        } catch (error) {
            console.error('Error changing audio input device:', error);
            throw error;
        }
    }

    getLocalStream() {
        return this.localStream;
    }

    cleanup() {
        this.disconnectAll();
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }

        this.initialized = false;
    }
}

/***/ }),

/***/ "./src/renderer/js/chat/ChatManager.js":
/*!*********************************************!*\
  !*** ./src/renderer/js/chat/ChatManager.js ***!
  \*********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ChatManager: () => (/* binding */ ChatManager)
/* harmony export */ });
// src/renderer/js/chat/ChatManager.js
class ChatManager {
    constructor() {
        this.currentRoom = null;
    }

    sendMessage(message) {
        if (!message.trim()) return;

        if (!window.proximityApp || !window.proximityApp.connectionManager.socket) {
            console.error('Not connected to server');
            return;
        }

        if (!window.proximityApp.isInHub) {
            console.error('Not in a channel');
            return;
        }

        const username = window.proximityApp.settingsManager.get('username') || 'Anonymous';
        
        console.log('Sending chat message:', message);

        window.proximityApp.connectionManager.emit('send-chat-message', {
            roomId: 'hub-general',
            message: message,
            username: username
        });
    }

    addMessage(data) {
        if (!window.proximityApp || !window.proximityApp.uiManager) return;

        console.log('Adding chat message:', data);
        
        window.proximityApp.uiManager.addChatMessage(
            data.username,
            data.message,
            data.timestamp || Date.now()
        );
    }

    clearMessages() {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = '';
        }
    }
}

/***/ }),

/***/ "./src/renderer/js/core/ConnectionManager.js":
/*!***************************************************!*\
  !*** ./src/renderer/js/core/ConnectionManager.js ***!
  \***************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ConnectionManager: () => (/* binding */ ConnectionManager)
/* harmony export */ });
// src/renderer/js/core/ConnectionManager.js
class ConnectionManager {
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            if (typeof io === 'undefined') {
                reject(new Error('Socket.IO not loaded'));
                return;
            }

            console.log('Connecting to server:', this.serverUrl);
            
            this.socket = io(this.serverUrl, {
                reconnectionAttempts: this.maxReconnectAttempts,
                timeout: 10000,
                transports: ['websocket', 'polling']
            });

            this.socket.on('connect', () => {
                console.log('Connected to server');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                resolve();
            });

            this.socket.on('disconnect', () => {
                console.log('Disconnected from server');
                this.isConnected = false;
            });

            this.socket.on('connect_error', (error) => {
                console.error('Connection error:', error);
                this.isConnected = false;
                this.reconnectAttempts++;
                
                if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                    reject(new Error('Failed to connect to server after multiple attempts'));
                }
            });
        });
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
        }
    }

    emit(event, data) {
        if (this.socket && this.isConnected) {
            this.socket.emit(event, data);
        } else {
            console.warn('Attempted to emit event while disconnected:', event);
        }
    }

    on(event, callback) {
        if (this.socket) {
            this.socket.on(event, callback);
        }
    }
}

/***/ }),

/***/ "./src/renderer/js/proximity/ProximityMap.js":
/*!***************************************************!*\
  !*** ./src/renderer/js/proximity/ProximityMap.js ***!
  \***************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ProximityMap: () => (/* binding */ ProximityMap)
/* harmony export */ });
// src/renderer/js/proximity/ProximityMap.js
class ProximityMap {
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
        
        // Audio constants for proximity calculation
        this.EDGE_START = 0.75; // When edge effects begin
        this.OUTER_RANGE = 1.3; // Allow audio to continue beyond visible range
        
        this.setupEventListeners();
        this.startRenderLoop();
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
            if (this.app && this.app.sendPositionUpdate) {
                this.app.sendPositionUpdate(newX, newY);
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
        // Center spawn position with slight randomization
        const x = this.canvas.width / 2 + (Math.random() - 0.5) * 100;
        const y = this.canvas.height / 2 + (Math.random() - 0.5) * 100;
        
        this.users.set(userId, {
            x,
            y,
            username: username || `User ${userId.slice(0, 4)}`,
            isSelf,
            audioElement,
            lastUpdate: Date.now(),
            color: isSelf ? this.app.settingsManager.get('userColor') || 'purple' : 'blue'
        });

        if (isSelf) {
            this.myUserId = userId;
        }

        this.updateAudioProximity();
    }

    removeUser(userId) {
        this.users.delete(userId);
        if (this.myUserId === userId) {
            this.myUserId = null;
        }
        this.updateAudioProximity();
    }

    clearUsers() {
        this.users.clear();
        this.myUserId = null;
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

            // Apply volume
            if (user.audioElement) {
                const currentVolume = user.audioElement.volume;
                const smoothedVolume = currentVolume * 0.8 + volume * 0.2;
                user.audioElement.volume = smoothedVolume;
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
        
        // Activity indicator (pulsing effect when speaking)
        if (user.isActive) {
            const pulseRadius = 25 + Math.sin(Date.now() * 0.01) * 5;
            const glowColor = colorMap[color] ? colorMap[color][0].replace('1)', '0.6)') : 'rgba(139,92,246,0.6)';
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

    // Test bot functionality
    addTestBot() {
        this.removeTestBot();

        this.testBotId = 'test-bot-' + Date.now();
        
        const audioElement = new Audio('assets/TestNoise.mp3');
        audioElement.loop = true;
        audioElement.volume = 0;
        
        let x, y;
        if (this.myUserId && this.users.has(this.myUserId)) {
            const myUser = this.users.get(this.myUserId);
            const angle = Math.random() * Math.PI * 2;
            const distance = this.proximityRange * 0.9;
            
            x = myUser.x + Math.cos(angle) * distance;
            y = myUser.y + Math.sin(angle) * distance;
            
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
        
        audioElement.play();
        this.updateAudioProximity();
        this.startTestBotMovement();
        
        return this.testBotId;
    }
    
    removeTestBot() {
        if (this.testBotMovementInterval) {
            clearInterval(this.testBotMovementInterval);
            this.testBotMovementInterval = null;
        }
        
        if (this.testBotId && this.users.has(this.testBotId)) {
            const bot = this.users.get(this.testBotId);
            
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
        if (this.testBotMovementInterval) {
            clearInterval(this.testBotMovementInterval);
        }
        
        this.testBotMovementInterval = setInterval(() => {
            if (this.testBotId && this.users.has(this.testBotId)) {
                const bot = this.users.get(this.testBotId);
                
                const targetX = Math.random() * (this.canvas.width - 40) + 20;
                const targetY = Math.random() * (this.canvas.height - 40) + 20;
                
                const startX = bot.x;
                const startY = bot.y;
                const startTime = Date.now();
                const duration = 3000;
                
                const animateMovement = () => {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    
                    const easing = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                    
                    bot.x = startX + (targetX - startX) * easing;
                    bot.y = startY + (targetY - startY) * easing;
                    
                    if (progress < 1) {
                        requestAnimationFrame(animateMovement);
                    }
                    
                    this.updateAudioProximity();
                };
                
                animateMovement();
                
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

/***/ }),

/***/ "./src/renderer/js/server/ServerManager.js":
/*!*************************************************!*\
  !*** ./src/renderer/js/server/ServerManager.js ***!
  \*************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ServerManager: () => (/* binding */ ServerManager)
/* harmony export */ });
// src/renderer/js/server/ServerManager.js
class ServerManager {
    constructor() {
        this.availableServers = [];
        this.myServers = [];
        this.favoriteServers = [];
    }

    async loadServerData() {
        try {
            const savedMyServers = localStorage.getItem('proximity-my-servers');
            if (savedMyServers) {
                this.myServers = JSON.parse(savedMyServers);
            }
            
            const savedFavorites = localStorage.getItem('proximity-favorite-servers');
            if (savedFavorites) {
                this.favoriteServers = JSON.parse(savedFavorites);
            }
        } catch (error) {
            console.error('Error loading server data:', error);
        }
    }

    saveServerData() {
        try {
            localStorage.setItem('proximity-my-servers', JSON.stringify(this.myServers));
            localStorage.setItem('proximity-favorite-servers', JSON.stringify(this.favoriteServers));
        } catch (error) {
            console.error('Error saving server data:', error);
        }
    }

    createServer(name, description) {
        if (!window.proximityApp || !window.proximityApp.connectionManager.socket) {
            throw new Error('Not connected to server');
        }

        window.proximityApp.connectionManager.emit('create-server', {
            serverName: name,
            serverDescription: description
        });
    }

    joinServer(server) {
        // Implementation for joining custom servers
        // For now, we'll focus on the hub
        console.log('Joining server:', server);
    }

    addToFavorites(serverId) {
        if (!this.favoriteServers.includes(serverId)) {
            this.favoriteServers.push(serverId);
            this.saveServerData();
        }
    }

    removeFromFavorites(serverId) {
        this.favoriteServers = this.favoriteServers.filter(id => id !== serverId);
        this.saveServerData();
    }

    addToMyServers(serverId) {
        if (!this.myServers.includes(serverId)) {
            this.myServers.push(serverId);
            this.saveServerData();
        }
    }

    updateAvailableServers(servers) {
        this.availableServers = servers;
        // Could emit event here for UI updates
    }
}

/***/ }),

/***/ "./src/renderer/js/settings/SettingsManager.js":
/*!*****************************************************!*\
  !*** ./src/renderer/js/settings/SettingsManager.js ***!
  \*****************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   SettingsManager: () => (/* binding */ SettingsManager)
/* harmony export */ });
// src/renderer/js/settings/SettingsManager.js
class SettingsManager {
    constructor() {
        this.settings = {
            username: '',
            userColor: 'purple',
            audioGain: 50,
            noiseSupression: true,
            echoCancellation: true,
            autoJoin: false,
            muteHotkey: 'Ctrl+M',
            deafenHotkey: 'Ctrl+D',
            audioOutputDevice: ''
        };
        this.storageKey = 'proximity-settings';
    }

    async load() {
        try {
            const savedSettings = localStorage.getItem(this.storageKey);
            if (savedSettings) {
                this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
                console.log('Settings loaded:', this.settings);
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
        
        this.applyToUI();
    }

    save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
            console.log('Settings saved');
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    get(key) {
        return this.settings[key];
    }

    set(key, value) {
        this.settings[key] = value;
        this.save();
        this.applyToUI();
    }

    update(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.save();
        this.applyToUI();
    }

    reset() {
        this.settings = {
            username: '',
            userColor: 'purple',
            audioGain: 50,
            noiseSupression: true,
            echoCancellation: true,
            autoJoin: false,
            muteHotkey: 'Ctrl+M',
            deafenHotkey: 'Ctrl+D',
            audioOutputDevice: ''
        };
        this.save();
        this.applyToUI();
    }

    applyToUI() {
        // Username
        const usernameInput = document.getElementById('username');
        if (usernameInput) {
            usernameInput.value = this.settings.username;
        }

        // Audio gain
        const audioGainSlider = document.getElementById('audioGain');
        if (audioGainSlider) {
            audioGainSlider.value = this.settings.audioGain;
            const valueDisplay = document.querySelector('.slider-value');
            if (valueDisplay) {
                valueDisplay.textContent = `${this.settings.audioGain}%`;
            }
        }

        // Checkboxes
        const noiseSupressionCheck = document.getElementById('noiseSupression');
        if (noiseSupressionCheck) {
            noiseSupressionCheck.checked = this.settings.noiseSupression;
        }

        const echoCancellationCheck = document.getElementById('echoCancellation');
        if (echoCancellationCheck) {
            echoCancellationCheck.checked = this.settings.echoCancellation;
        }

        const autoJoinCheck = document.getElementById('autoJoin');
        if (autoJoinCheck) {
            autoJoinCheck.checked = this.settings.autoJoin;
        }

        // Color picker
        const colorOptions = document.querySelectorAll('.color-option');
        colorOptions.forEach(option => {
            option.classList.remove('selected');
            if (option.dataset.color === this.settings.userColor) {
                option.classList.add('selected');
            }
        });

        // Audio output device
        const audioOutputDeviceSelect = document.getElementById('audioOutputDevice');
        if (audioOutputDeviceSelect) {
            audioOutputDeviceSelect.value = this.settings.audioOutputDevice || '';
        }

        // Apply audio gain to audio manager
        if (window.proximityApp && window.proximityApp.audioManager) {
            window.proximityApp.audioManager.setGain(this.settings.audioGain);
        }
    }
}

/***/ }),

/***/ "./src/renderer/js/ui/UIManager.js":
/*!*****************************************!*\
  !*** ./src/renderer/js/ui/UIManager.js ***!
  \*****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   UIManager: () => (/* binding */ UIManager)
/* harmony export */ });
// src/renderer/js/ui/UIManager.js - Fixed version with proper home button setup
class UIManager {
    constructor() {
        this.eventHandlers = {};
        this.elements = {};
    }

    init() {
        this.cacheElements();
        this.setupEventListeners();
        this.addHubToNavigation();
        this.setupHomePageEvents(); // Add this
    }

    cacheElements() {
        // Navigation
        this.elements.navItems = document.querySelectorAll('.nav-item');
        this.elements.pages = document.querySelectorAll('.page');
        
        // Connection status
        this.elements.connectionIndicator = document.getElementById('connectionIndicator');
        this.elements.connectionText = document.getElementById('connectionText');
        
        // Server view
        this.elements.currentServerName = document.getElementById('currentServerName');
        this.elements.serverInviteDisplay = document.getElementById('serverInviteDisplay');
        this.elements.participantsList = document.getElementById('participantsList');
        
        // Chat
        this.elements.chatMessages = document.getElementById('chatMessages');
        this.elements.messageInput = document.getElementById('messageInput');
        this.elements.sendMessageBtn = document.getElementById('sendMessageBtn');
        
        // Voice controls
        this.elements.muteButton = document.getElementById('muteButton');
        this.elements.mapMuteButton = document.getElementById('mapMuteButton');
        this.elements.leaveChannelBtn = document.getElementById('leaveChannelBtn');
        this.elements.leaveChannelServerBtn = document.getElementById('leaveChannelServerBtn');
        
        // Audio devices
        this.elements.audioDeviceSelect = document.getElementById('audioDevice');
        this.elements.audioOutputDeviceSelect = document.getElementById('audioOutputDevice');
        
        // Home page elements
        this.elements.joinHubBtn = document.getElementById('joinHubBtn');
    }

    setupEventListeners() {
        // Navigation
        this.elements.navItems.forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                this.switchPage(page);
                this.emit('page-change', page);
            });
        });

        // Chat
        if (this.elements.sendMessageBtn) {
            this.elements.sendMessageBtn.addEventListener('click', () => {
                this.sendChatMessage();
            });
        }

        if (this.elements.messageInput) {
            this.elements.messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendChatMessage();
                }
            });
        }

        // Voice controls
        [this.elements.muteButton, this.elements.mapMuteButton].forEach(btn => {
            if (btn) {
                btn.addEventListener('click', () => {
                    this.emit('mute-toggle');
                });
            }
        });

        [this.elements.leaveChannelBtn, this.elements.leaveChannelServerBtn].forEach(btn => {
            if (btn) {
                btn.addEventListener('click', () => {
                    this.emit('leave-channel');
                });
            }
        });
    }

    setupHomePageEvents() {
        // Home page hub button
        if (this.elements.joinHubBtn) {
            this.elements.joinHubBtn.addEventListener('click', () => {
                console.log('Home page hub button clicked');
                this.emit('join-hub');
            });
        }
    }

    addHubToNavigation() {
        // Add Community Hub to navigation
        const hubNavItem = document.createElement('div');
        hubNavItem.className = 'nav-item';
        hubNavItem.dataset.page = 'hub';
        hubNavItem.innerHTML = `
            <div class="nav-icon">🏢</div>
            <span class="nav-text">Community Hub</span>
        `;
        
        hubNavItem.addEventListener('click', () => {
            console.log('Navigation hub button clicked');
            this.switchPage('server-view');
            this.emit('join-hub');
        });

        // Insert after the home nav item
        const homeNavItem = document.querySelector('.nav-item[data-page="home"]');
        if (homeNavItem && homeNavItem.parentNode) {
            homeNavItem.parentNode.insertBefore(hubNavItem, homeNavItem.nextSibling);
            
            // Update cached nav items
            this.elements.navItems = document.querySelectorAll('.nav-item');
        }
    }

    switchPage(pageName) {
        console.log('Switching to page:', pageName);
        
        // Update navigation
        this.elements.navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.page === pageName);
        });

        // Update pages
        this.elements.pages.forEach(page => {
            page.classList.toggle('active', page.id === `${pageName}-page`);
        });

        // Special hub handling
        if (pageName === 'hub') {
            // Show server view but mark hub as active
            document.getElementById('server-view-page').classList.add('active');
            const hubNavItem = document.querySelector('.nav-item[data-page="hub"]');
            if (hubNavItem) {
                hubNavItem.classList.add('active');
            }
        }
    }

    showServerView(server) {
        this.switchPage('server-view');
        
        if (this.elements.currentServerName) {
            this.elements.currentServerName.textContent = server.name;
        }
        
        if (this.elements.serverInviteDisplay) {
            this.elements.serverInviteDisplay.textContent = server.id === 'hub' ? 'COMMUNITY-HUB' : server.id;
        }

        // Set up hub channels
        if (server.id === 'hub') {
            this.setupHubChannels();
        }
    }

    setupHubChannels() {
        const textChannelsList = document.getElementById('textChannelsList');
        const voiceChannelsList = document.getElementById('voiceChannelsList');
        
        if (textChannelsList) {
            textChannelsList.innerHTML = `
                <div class="channel-item active" data-channel-type="text" data-channel-id="general">
                    <span class="channel-icon">#</span>
                    <span class="channel-name">general</span>
                </div>
            `;
        }
        
        if (voiceChannelsList) {
            voiceChannelsList.innerHTML = `
                <div class="channel-item" data-channel-type="voice" data-channel-id="general-voice">
                    <span class="channel-icon">🔊</span>
                    <span class="channel-name">General Voice</span>
                    <div class="voice-participants" id="voiceParticipants"></div>
                </div>
            `;
        }

        // Auto-join voice channel
        setTimeout(() => {
            this.switchToChannel('general-voice', 'voice');
        }, 100);
    }

    switchToChannel(channelId, channelType) {
        // Update channel selection
        document.querySelectorAll('.channel-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeChannel = document.querySelector(`[data-channel-id="${channelId}"]`);
        if (activeChannel) {
            activeChannel.classList.add('active');
        }
        
        // Switch content view
        document.querySelectorAll('.content-view').forEach(view => {
            view.classList.remove('active');
        });
        
        if (channelType === 'text') {
            const textView = document.getElementById('text-chat-view');
            if (textView) textView.classList.add('active');
        } else if (channelType === 'voice') {
            const voiceView = document.getElementById('voice-channel-view');
            if (voiceView) voiceView.classList.add('active');
        }
    }

    addParticipant(userId, stream, isSelf = false, username = 'Anonymous', userColor = 'purple') {
        if (document.getElementById(`participant-${userId}`)) {
            return; // Already exists
        }

        const participant = document.createElement('div');
        participant.className = 'participant';
        participant.id = `participant-${userId}`;
        
        const micStatus = document.createElement('div');
        micStatus.className = 'mic-status active';
        
        const avatar = document.createElement('span');
        avatar.className = 'participant-avatar';
        avatar.style.cssText = 'margin-right: 8px; font-size: 16px;';
        avatar.textContent = this.getColorEmoji(userColor);
        
        const name = document.createElement('span');
        name.textContent = isSelf ? `${username} (You)` : username;
        name.style.fontWeight = isSelf ? 'bold' : 'normal';
        name.classList.add(`user-color-${userColor}`);
        
        participant.appendChild(micStatus);
        participant.appendChild(avatar);
        participant.appendChild(name);
        
        // Add audio element for remote users
        if (!isSelf && stream) {
            const audioElement = document.createElement('audio');
            audioElement.autoplay = true;
            audioElement.srcObject = stream;
            audioElement.volume = 1;
            audioElement.style.display = 'none';
            participant.appendChild(audioElement);
        }
        
        if (this.elements.participantsList) {
            this.elements.participantsList.appendChild(participant);
        }
    }

    removeParticipant(userId) {
        const participant = document.getElementById(`participant-${userId}`);
        if (participant) {
            participant.remove();
        }
    }

    clearParticipants() {
        if (this.elements.participantsList) {
            this.elements.participantsList.innerHTML = '';
        }
    }

    updateMuteStatus(isMuted) {
        [this.elements.muteButton, this.elements.mapMuteButton].forEach(button => {
            if (button) {
                const textSpan = button.querySelector('.text');
                const iconSpan = button.querySelector('.icon');
                
                if (textSpan) textSpan.textContent = isMuted ? 'Unmute' : 'Mute';
                if (iconSpan) iconSpan.textContent = isMuted ? '🔇' : '🎤';
                
                button.classList.toggle('muted', isMuted);
            }
        });
    }

    updateConnectionStatus(status, text) {
        if (this.elements.connectionIndicator && this.elements.connectionText) {
            this.elements.connectionIndicator.classList.remove('online', 'offline', 'connecting');
            this.elements.connectionIndicator.classList.add(status);
            this.elements.connectionText.textContent = text;
        }
    }

    sendChatMessage() {
        if (!this.elements.messageInput) return;
        
        const message = this.elements.messageInput.value.trim();
        if (!message) return;
        
        this.emit('send-message', message);
        this.elements.messageInput.value = '';
    }

    addChatMessage(username, message, timestamp) {
        if (!this.elements.chatMessages) return;

        const messageElement = document.createElement('div');
        messageElement.className = 'message';

        const messageHeader = document.createElement('div');
        messageHeader.className = 'message-header';

        const author = document.createElement('span');
        author.className = 'message-author';
        author.textContent = username;

        const time = document.createElement('span');
        time.className = 'message-timestamp';
        time.textContent = new Date(timestamp).toLocaleTimeString();

        messageHeader.appendChild(author);
        messageHeader.appendChild(time);

        const content = document.createElement('div');
        content.className = 'message-content';
        content.textContent = message;

        messageElement.appendChild(messageHeader);
        messageElement.appendChild(content);

        this.elements.chatMessages.appendChild(messageElement);
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }

    async populateAudioDevices() {
        if (!this.elements.audioDeviceSelect || !this.elements.audioOutputDeviceSelect) return;
        
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');
            const audioOutputs = devices.filter(device => device.kind === 'audiooutput');

            this.elements.audioDeviceSelect.innerHTML = '<option value="">Select Audio Device</option>';
            this.elements.audioOutputDeviceSelect.innerHTML = '<option value="">Select Output Device</option>';

            audioInputs.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Microphone ${index + 1}`;
                this.elements.audioDeviceSelect.appendChild(option);
            });

            audioOutputs.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Speaker ${index + 1}`;
                this.elements.audioOutputDeviceSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error populating audio devices:', error);
        }
    }

    showNotification(message, type = 'info') {
        console.log(`Notification [${type}]: ${message}`);
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '12px 20px',
            borderRadius: '8px',
            color: 'white',
            fontWeight: '500',
            zIndex: '9999',
            opacity: '0',
            transform: 'translateX(100%)',
            transition: 'all 0.3s ease'
        });
        
        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#6b46c1'
        };
        notification.style.backgroundColor = colors[type] || colors.info;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 10);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    getColorEmoji(color) {
        const colorEmojis = {
            blue: '🔵',
            green: '🟢', 
            purple: '🟣',
            red: '🔴',
            orange: '🟠',
            pink: '🩷',
            indigo: '💜',
            cyan: '🔹'
        };
        return colorEmojis[color] || colorEmojis['purple'];
    }

    // Event system
    on(event, callback) {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(callback);
    }

    emit(event, data) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach(callback => callback(data));
        }
    }
}

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!********************************!*\
  !*** ./src/renderer/js/app.js ***!
  \********************************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _core_ConnectionManager_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./core/ConnectionManager.js */ "./src/renderer/js/core/ConnectionManager.js");
/* harmony import */ var _ui_UIManager_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./ui/UIManager.js */ "./src/renderer/js/ui/UIManager.js");
/* harmony import */ var _audio_AudioManager_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./audio/AudioManager.js */ "./src/renderer/js/audio/AudioManager.js");
/* harmony import */ var _proximity_ProximityMap_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./proximity/ProximityMap.js */ "./src/renderer/js/proximity/ProximityMap.js");
/* harmony import */ var _server_ServerManager_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./server/ServerManager.js */ "./src/renderer/js/server/ServerManager.js");
/* harmony import */ var _chat_ChatManager_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./chat/ChatManager.js */ "./src/renderer/js/chat/ChatManager.js");
/* harmony import */ var _settings_SettingsManager_js__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./settings/SettingsManager.js */ "./src/renderer/js/settings/SettingsManager.js");
// src/renderer/js/main.js - Main entry point for the renderer process








const SERVER_URL = 'https://myserver2-production.up.railway.app';

class ProximityApp {
    constructor() {
        console.log('ProximityApp initializing...');
        
        // Core managers
        this.connectionManager = new _core_ConnectionManager_js__WEBPACK_IMPORTED_MODULE_0__.ConnectionManager(SERVER_URL);
        this.uiManager = new _ui_UIManager_js__WEBPACK_IMPORTED_MODULE_1__.UIManager();
        this.audioManager = new _audio_AudioManager_js__WEBPACK_IMPORTED_MODULE_2__.AudioManager();
        this.settingsManager = new _settings_SettingsManager_js__WEBPACK_IMPORTED_MODULE_6__.SettingsManager();
        this.serverManager = new _server_ServerManager_js__WEBPACK_IMPORTED_MODULE_4__.ServerManager();
        this.chatManager = new _chat_ChatManager_js__WEBPACK_IMPORTED_MODULE_5__.ChatManager();
        this.proximityMap = null;
        
        // State
        this.currentServer = null;
        this.currentChannel = null;
        this.myUserId = null;
        this.isInHub = false;
        
        this.init();
    }

    async init() {
        try {
            // Initialize settings first
            await this.settingsManager.load();
            
            // Initialize UI
            this.uiManager.init();
            this.setupEventListeners();
            
            // Initialize proximity map
            this.proximityMap = new _proximity_ProximityMap_js__WEBPACK_IMPORTED_MODULE_3__.ProximityMap(
                document.getElementById('proximityMap'), 
                this
            );
            
            // Connect to server
            await this.connectionManager.connect();
            this.myUserId = this.connectionManager.socket.id;
            
            // Setup connection event handlers
            this.setupConnectionHandlers();
            
            console.log('ProximityApp initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.uiManager.showNotification('Failed to initialize app', 'error');
        }
    }

    setupEventListeners() {
        // Navigation
        this.uiManager.on('page-change', (page) => this.handlePageChange(page));
        this.uiManager.on('join-hub', () => this.joinHub());
        this.uiManager.on('leave-channel', () => this.leaveCurrentChannel());
        this.uiManager.on('mute-toggle', () => this.audioManager.toggleMute());
        
        // Chat
        this.uiManager.on('send-message', (message) => this.chatManager.sendMessage(message));
        
        // Settings
        this.uiManager.on('settings-change', (settings) => this.settingsManager.update(settings));
    }

    setupConnectionHandlers() {
        const socket = this.connectionManager.socket;
        
        socket.on('connect', () => {
            console.log('Connected to server');
            this.myUserId = socket.id;
            this.uiManager.updateConnectionStatus('online', 'Connected');
            this.uiManager.showNotification('Connected to server', 'success');
        });

        socket.on('disconnect', () => {
            this.uiManager.updateConnectionStatus('offline', 'Disconnected');
            this.uiManager.showNotification('Disconnected from server', 'warning');
        });

        // Hub events
        socket.on('hub-users', (users) => {
            console.log('Hub users received:', users);
            this.handleHubUsers(users);
        });

        socket.on('user-joined-hub', (user) => {
            console.log('User joined hub:', user);
            this.uiManager.showNotification(`${user.username} joined the hub`, 'info');
            this.handleUserJoined(user);
        });

        socket.on('user-left-hub', (user) => {
            console.log('User left hub:', user);
            this.uiManager.showNotification(`${user.username} left the hub`, 'info');
            this.handleUserLeft(user);
        });

        // Voice events
        socket.on('offer', ({ offer, from }) => this.audioManager.handleOffer(offer, from));
        socket.on('answer', ({ answer, from }) => this.audioManager.handleAnswer(answer, from));
        socket.on('ice-candidate', ({ candidate, from }) => this.audioManager.handleIceCandidate(candidate, from));
        
        // Chat events
        socket.on('chat-message', (data) => this.chatManager.addMessage(data));
        
        // Position events
        socket.on('position-update', ({ userId, x, y }) => {
            if (this.proximityMap) {
                this.proximityMap.updateUserPosition(userId, x, y);
            }
        });
    }

    async joinHub() {
        try {
            console.log('Joining hub...');
            
            // Initialize audio if needed
            if (!this.audioManager.isInitialized()) {
                await this.audioManager.initialize();
            }
            
            const username = this.settingsManager.get('username') || 'Anonymous';
            const userColor = this.settingsManager.get('userColor') || 'purple';
            
            // Join the hub room
            this.connectionManager.socket.emit('join-hub', {
                username,
                userColor
            });
            
            this.isInHub = true;
            this.currentServer = { id: 'hub', name: 'Community Hub' };
            this.currentChannel = { id: 'general-voice', type: 'voice' };
            
            // Update UI
            this.uiManager.showServerView(this.currentServer);
            this.uiManager.switchToChannel('general-voice', 'voice');
            
            // Add self to proximity map
            if (this.proximityMap) {
                this.proximityMap.addUser(this.myUserId, username, true);
                this.proximityMap.updateUserColor(this.myUserId, userColor);
            }
            
            this.uiManager.showNotification('Joined Community Hub', 'success');
            
        } catch (error) {
            console.error('Failed to join hub:', error);
            this.uiManager.showNotification('Failed to join hub', 'error');
        }
    }

    handleHubUsers(users) {
        // Clear existing participants
        this.uiManager.clearParticipants();
        if (this.proximityMap) {
            this.proximityMap.clearUsers();
        }
        
        // Add self first
        const username = this.settingsManager.get('username') || 'Anonymous';
        const userColor = this.settingsManager.get('userColor') || 'purple';
        
        this.uiManager.addParticipant(this.myUserId, null, true, username, userColor);
        if (this.proximityMap) {
            this.proximityMap.addUser(this.myUserId, username, true);
            this.proximityMap.updateUserColor(this.myUserId, userColor);
        }
        
        // Add other users and establish WebRTC connections
        users.forEach(user => {
            if (user.userId !== this.myUserId) {
                this.handleUserJoined(user);
                this.audioManager.connectToUser(user.userId, user.username, user.userColor);
            }
        });
    }

    handleUserJoined(user) {
        this.uiManager.addParticipant(user.userId, null, false, user.username, user.userColor);
        
        if (this.proximityMap) {
            this.proximityMap.addUser(user.userId, user.username, false);
            this.proximityMap.updateUserColor(user.userId, user.userColor);
        }
        
        // Establish WebRTC connection if we're in the same channel
        if (this.isInHub) {
            this.audioManager.connectToUser(user.userId, user.username, user.userColor);
        }
    }

    handleUserLeft(user) {
        this.uiManager.removeParticipant(user.userId);
        
        if (this.proximityMap) {
            this.proximityMap.removeUser(user.userId);
        }
        
        this.audioManager.disconnectFromUser(user.userId);
    }

    handlePageChange(page) {
        if (page === 'map' && this.proximityMap) {
            this.proximityMap.resizeCanvas();
        }
        
        if (page === 'settings') {
            this.uiManager.populateAudioDevices();
        }
    }

    leaveCurrentChannel() {
        if (!this.isInHub) return;
        
        console.log('Leaving current channel...');
        
        // Disconnect from all users
        this.audioManager.disconnectAll();
        
        // Clear UI
        this.uiManager.clearParticipants();
        if (this.proximityMap) {
            this.proximityMap.clearUsers();
        }
        
        // Leave the hub
        this.connectionManager.socket.emit('leave-hub');
        
        this.isInHub = false;
        this.currentServer = null;
        this.currentChannel = null;
        
        // Return to home
        this.uiManager.switchPage('home');
        this.uiManager.showNotification('Left the channel', 'info');
    }

    // Public methods for other managers to use
    sendPositionUpdate(x, y) {
        if (this.connectionManager.socket && this.isInHub) {
            this.connectionManager.socket.emit('position-update', {
                roomId: 'hub-general-voice',
                x, y
            });
        }
    }

    updateMicStatus(isMuted) {
        if (this.connectionManager.socket && this.isInHub) {
            this.connectionManager.socket.emit('mic-status', {
                roomId: 'hub-general-voice',
                isMuted
            });
        }
    }
}

// Initialize app when DOM is ready
function initApp() {
    try {
        window.proximityApp = new ProximityApp();
        console.log('App initialized successfully');
    } catch (error) {
        console.error('Error initializing app:', error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
})();

/******/ })()
;
//# sourceMappingURL=bundle.js.map