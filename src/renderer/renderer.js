// Fixed renderer with persistent visualizer and username handling
console.log('Fixed Renderer.js starting...');

// Import audio classes
import { AudioVisualizer, MicrophoneInput } from './audio';

class ProximityApp {
    constructor() {
        console.log('ProximityApp constructor called');
        this.socket = null;
        this.peerConnections = {};
        this.micInput = new MicrophoneInput();
        this.isMuted = false;
        this.isDeafened = false;
        this.currentRoom = null;
        this.createdRooms = [];
        this.myUserId = null;
        this.persistentVisualizerActive = false;
        this.settings = {
            username: '',
            audioGain: 50,
            noiseSupression: true,
            echoCancellation: true,
            autoJoin: false,
            muteHotkey: 'Ctrl+M',
            deafenHotkey: 'Ctrl+D'
        };

        this.initializeUI();
        this.setupEventListeners();
        this.loadSettings();
        this.setupMicrophoneGlow();
        console.log('ProximityApp initialized');
    }

    initializeUI() {
        console.log('Initializing UI...');
        
        // Navigation elements
        this.navItems = document.querySelectorAll('.nav-item');
        this.pages = document.querySelectorAll('.page');

        // Room elements
        this.roomIdInput = document.getElementById('roomId');
        this.joinRoomBtn = document.getElementById('joinRoom');
        this.leaveRoomBtn = document.getElementById('leaveRoom');
        this.muteButton = document.getElementById('muteButton');
        this.participantsList = document.getElementById('participantsList');
        this.roomCodeElement = document.getElementById('roomCode');
        this.newRoomBtn = document.getElementById('newRoomBtn');
        this.currentRoomSection = document.getElementById('currentRoom');

        // Settings elements
        this.audioDeviceSelect = document.getElementById('audioDevice');
        this.audioGainSlider = document.getElementById('audioGain');
        this.noiseSupressionCheck = document.getElementById('noiseSupression');
        this.echoCancellationCheck = document.getElementById('echoCancellation');
        this.usernameInput = document.getElementById('username');
        this.autoJoinCheck = document.getElementById('autoJoin');
        this.testMicrophoneBtn = document.getElementById('testMicrophone');
        this.resetSettingsBtn = document.getElementById('resetSettings');

        // Persistent visualizer elements
        this.persistentMicLevelFill = document.getElementById('persistentMicLevelFill');
        this.persistentVolumeLevel = document.getElementById('persistentVolumeLevel');
        this.micStatusText = document.getElementById('micStatusText');
        
        // Create mic test visualizer
        this.createMicTestVisualizer();
        
        // Create created rooms container
        this.createCreatedRoomsContainer();
        
        console.log('UI elements found');
    }

    createMicTestVisualizer() {
        const testMicContainer = this.testMicrophoneBtn.parentElement;
        
        const visualizerContainer = document.createElement('div');
        visualizerContainer.id = 'micTestVisualizer';
        visualizerContainer.style.cssText = `
            margin-top: 1rem;
            padding: 1rem;
            background: var(--dark-bg);
            border-radius: 8px;
            border: 1px solid var(--border);
            display: none;
        `;
        
        const visualizerTitle = document.createElement('h4');
        visualizerTitle.textContent = 'Microphone Test (10 seconds)';
        visualizerTitle.style.cssText = `
            color: var(--text-secondary);
            margin-bottom: 0.5rem;
            font-size: 0.9rem;
        `;
        
        const visualizerBar = document.createElement('div');
        visualizerBar.id = 'micLevelBar';
        visualizerBar.style.cssText = `
            width: 100%;
            height: 20px;
            background: var(--border);
            border-radius: 10px;
            overflow: hidden;
            position: relative;
        `;
        
        const visualizerFill = document.createElement('div');
        visualizerFill.id = 'micLevelFill';
        visualizerFill.style.cssText = `
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, var(--success) 0%, var(--warning) 70%, var(--danger) 100%);
            transition: width 0.1s ease;
            border-radius: 10px;
        `;
        
        const volumeText = document.createElement('span');
        volumeText.id = 'volumeLevel';
        volumeText.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 0.8rem;
            font-weight: bold;
            color: var(--text-primary);
            text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
        `;
        volumeText.textContent = '0%';
        
        visualizerBar.appendChild(visualizerFill);
        visualizerBar.appendChild(volumeText);
        visualizerContainer.appendChild(visualizerTitle);
        visualizerContainer.appendChild(visualizerBar);
        
        testMicContainer.appendChild(visualizerContainer);
    }

    createCreatedRoomsContainer() {
        const roomControls = document.querySelector('.room-controls');
        
        const createdRoomsContainer = document.createElement('div');
        createdRoomsContainer.id = 'createdRoomsContainer';
        createdRoomsContainer.style.cssText = `
            margin-top: 1rem;
            display: none;
        `;
        
        const createdRoomsTitle = document.createElement('h3');
        createdRoomsTitle.textContent = 'Your Created Rooms';
        createdRoomsTitle.style.cssText = `
            color: var(--text-secondary);
            margin-bottom: 1rem;
            font-size: 1.1rem;
        `;
        
        const roomsList = document.createElement('div');
        roomsList.id = 'createdRoomsList';
        roomsList.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        `;
        
        createdRoomsContainer.appendChild(createdRoomsTitle);
        createdRoomsContainer.appendChild(roomsList);
        
        roomControls.parentNode.insertBefore(createdRoomsContainer, roomControls.nextSibling);
    }

    setupMicrophoneGlow() {
        const style = document.createElement('style');
        style.textContent = `
            .mic-status.glowing {
                box-shadow: 0 0 var(--glow-size, 8px) var(--glow-color, rgba(16, 185, 129, 0.6));
                transition: box-shadow 0.1s ease;
            }
        `;
        document.head.appendChild(style);
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // Navigation
        this.navItems.forEach((item) => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                this.switchPage(page);
            });
        });

        // Room controls
        if (this.joinRoomBtn) {
            this.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        }
        
        if (this.leaveRoomBtn) {
            this.leaveRoomBtn.addEventListener('click', () => this.leaveRoom());
        }
        
        if (this.muteButton) {
            this.muteButton.addEventListener('click', () => this.toggleMute());
        }
        
        if (this.newRoomBtn) {
            this.newRoomBtn.addEventListener('click', () => this.createNewRoom());
        }

        if (this.roomIdInput) {
            this.roomIdInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !this.joinRoomBtn.disabled) {
                    this.joinRoom();
                }
            });
        }

        // Settings controls
        if (this.audioDeviceSelect) {
            this.audioDeviceSelect.addEventListener('change', (e) => this.changeAudioDevice(e.target.value));
        }
        
        if (this.audioGainSlider) {
            this.audioGainSlider.addEventListener('input', (e) => {
                this.updateAudioGain(e.target.value);
                const valueDisplay = document.querySelector('.slider-value');
                if (valueDisplay) {
                    valueDisplay.textContent = `${e.target.value}%`;
                }
            });
        }

        // Username input with real-time saving
        if (this.usernameInput) {
            this.usernameInput.addEventListener('input', (e) => {
                this.settings.username = e.target.value.trim();
                this.saveSettings();
                this.updateParticipantName();
            });
        }

        // Audio setting checkboxes
        if (this.noiseSupressionCheck) {
            this.noiseSupressionCheck.addEventListener('change', (e) => {
                this.settings.noiseSupression = e.target.checked;
                this.saveSettings();
            });
        }

        if (this.echoCancellationCheck) {
            this.echoCancellationCheck.addEventListener('change', (e) => {
                this.settings.echoCancellation = e.target.checked;
                this.saveSettings();
            });
        }

        if (this.autoJoinCheck) {
            this.autoJoinCheck.addEventListener('change', (e) => {
                this.settings.autoJoin = e.target.checked;
                this.saveSettings();
            });
        }
        
        if (this.testMicrophoneBtn) {
            this.testMicrophoneBtn.addEventListener('click', () => this.testMicrophone());
        }
        
        if (this.resetSettingsBtn) {
            this.resetSettingsBtn.addEventListener('click', () => this.resetSettings());
        }

        console.log('Event listeners set up complete');
    }

    switchPage(pageName) {
        console.log('Switching to page:', pageName);
        
        this.navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.page === pageName);
        });

        this.pages.forEach(page => {
            page.classList.toggle('active', page.id === `${pageName}-page`);
        });

        if (pageName === 'settings') {
            this.populateAudioDevices();
            this.startPersistentVisualizer();
        } else {
            this.stopPersistentVisualizer();
        }
    }

    async startPersistentVisualizer() {
        if (this.persistentVisualizerActive) return;

        try {
            if (!this.micInput.getStream()) {
                await this.initializeMedia();
            }
            
            this.persistentVisualizerActive = true;
            this.micStatusText.textContent = 'Monitoring microphone...';
            
            let persistentCallback = (volume, frequencyData) => {
                if (this.persistentMicLevelFill && this.persistentVolumeLevel) {
                    this.persistentMicLevelFill.style.width = `${volume}%`;
                    this.persistentVolumeLevel.textContent = `${Math.round(volume)}%`;
                }
            };
            
            this.micInput.addVolumeCallback(persistentCallback);
            this.persistentVisualizerCallback = persistentCallback;
            
        } catch (error) {
            console.error('Error starting persistent visualizer:', error);
            this.micStatusText.textContent = 'Microphone access denied';
        }
    }

    stopPersistentVisualizer() {
        if (this.persistentVisualizerCallback) {
            this.micInput.removeVolumeCallback(this.persistentVisualizerCallback);
            this.persistentVisualizerCallback = null;
        }
        this.persistentVisualizerActive = false;
        
        if (this.persistentMicLevelFill && this.persistentVolumeLevel) {
            this.persistentMicLevelFill.style.width = '0%';
            this.persistentVolumeLevel.textContent = '0%';
        }
        if (this.micStatusText) {
            this.micStatusText.textContent = 'Click "Test Microphone" to start monitoring';
        }
    }

    updateParticipantName() {
        // Update your own participant name if you're in a room
        const selfParticipant = document.getElementById(`participant-${this.myUserId || 'self'}`);
        if (selfParticipant) {
            const nameSpan = selfParticipant.querySelector('span');
            if (nameSpan) {
                nameSpan.textContent = this.settings.username || 'You';
            }
        }
    }

    loadSettings() {
        try {
            const savedSettings = localStorage.getItem('proximity-settings');
            if (savedSettings) {
                this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }

        if (this.usernameInput) this.usernameInput.value = this.settings.username;
        if (this.audioGainSlider) this.audioGainSlider.value = this.settings.audioGain;
        if (this.noiseSupressionCheck) this.noiseSupressionCheck.checked = this.settings.noiseSupression;
        if (this.echoCancellationCheck) this.echoCancellationCheck.checked = this.settings.echoCancellation;
        if (this.autoJoinCheck) this.autoJoinCheck.checked = this.settings.autoJoin;

        const valueDisplay = document.querySelector('.slider-value');
        if (valueDisplay) {
            valueDisplay.textContent = `${this.settings.audioGain}%`;
        }
    }

    saveSettings() {
        try {
            localStorage.setItem('proximity-settings', JSON.stringify(this.settings));
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    generateRoomCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    createNewRoom() {
        console.log('Creating new room...');
        const roomCode = this.generateRoomCode();
        
        this.createdRooms.push({
            code: roomCode,
            created: new Date(),
            participants: 0
        });
        
        this.updateCreatedRoomsList();
        this.showNotification(`New room created: ${roomCode}`, 'success');
    }

    updateCreatedRoomsList() {
        const container = document.getElementById('createdRoomsContainer');
        const list = document.getElementById('createdRoomsList');
        
        if (!container || !list) return;
        
        container.style.display = this.createdRooms.length > 0 ? 'block' : 'none';
        list.innerHTML = '';
        
        this.createdRooms.forEach((room, index) => {
            const roomCard = document.createElement('div');
            roomCard.style.cssText = `
                background: var(--card-bg);
                border: 1px solid var(--border);
                border-radius: 8px;
                padding: 1rem;
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;
            
            const roomInfo = document.createElement('div');
            roomInfo.innerHTML = `
                <div style="color: var(--text-primary); font-weight: 600; margin-bottom: 0.25rem;">
                    Room: ${room.code}
                </div>
                <div style="color: var(--text-muted); font-size: 0.8rem;">
                    Created: ${room.created.toLocaleTimeString()} • ${room.participants} participants
                </div>
            `;
            
            const roomActions = document.createElement('div');
            roomActions.style.cssText = 'display: flex; gap: 0.5rem;';
            
            const joinBtn = document.createElement('button');
            joinBtn.className = 'btn primary';
            joinBtn.style.cssText = 'padding: 0.5rem 1rem; font-size: 0.9rem;';
            joinBtn.textContent = 'Join';
            joinBtn.onclick = () => {
                this.roomIdInput.value = room.code;
                this.joinRoom();
            };
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn danger';
            deleteBtn.style.cssText = 'padding: 0.5rem 1rem; font-size: 0.9rem;';
            deleteBtn.textContent = 'Delete';
            deleteBtn.onclick = () => {
                this.deleteCreatedRoom(index);
            };
            
            roomActions.appendChild(joinBtn);
            roomActions.appendChild(deleteBtn);
            
            roomCard.appendChild(roomInfo);
            roomCard.appendChild(roomActions);
            
            list.appendChild(roomCard);
        });
    }

    deleteCreatedRoom(index) {
        if (confirm('Are you sure you want to delete this room?')) {
            this.createdRooms.splice(index, 1);
            this.updateCreatedRoomsList();
            this.showNotification('Room deleted', 'info');
        }
    }

    connectToSignalingServer(roomId) {
        // Check if Socket.IO is available
        if (typeof io === 'undefined') {
            this.showNotification('Socket.IO not loaded. Please check your internet connection.', 'error');
            return;
        }

        console.log('Connecting to signaling server...');
        this.socket = io('http://localhost:3000');

        this.socket.on('connect', () => {
            console.log('Connected to signaling server');
            this.myUserId = this.socket.id;
            this.socket.emit('join-room', roomId);
            this.addParticipant(this.myUserId, this.micInput.getStream(), true);
        });

        this.socket.on('user-joined', (userId) => {
            console.log('User joined:', userId);
            this.connectToNewUser(userId);
        });

        this.socket.on('room-users', (users) => {
            console.log('Room users:', users);
            users.forEach(userId => {
                this.connectToNewUser(userId);
            });
        });

        this.socket.on('offer', async ({ offer, from }) => {
            console.log('Received offer from:', from);
            await this.handleOffer(offer, from);
        });

        this.socket.on('answer', async ({ answer, from }) => {
            console.log('Received answer from:', from);
            await this.handleAnswer(answer, from);
        });

        this.socket.on('ice-candidate', async ({ candidate, from }) => {
            await this.handleIceCandidate(candidate, from);
        });

        this.socket.on('user-left', (userId) => {
            console.log('User left:', userId);
            this.removePeerConnection(userId);
        });

        this.socket.on('user-mic-status', ({ userId, isMuted }) => {
            this.updateMicStatus(userId, isMuted);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from signaling server');
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.showNotification('Failed to connect to server. Make sure server is running on port 3000.', 'error');
        });
    }

    async connectToNewUser(userId) {
        const peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        this.peerConnections[userId] = peerConnection;

        this.micInput.getStream().getTracks().forEach(track => {
            peerConnection.addTrack(track, this.micInput.getStream());
        });

        peerConnection.ontrack = (event) => {
            console.log('Received remote stream from:', userId);
            this.addParticipant(userId, event.streams[0], false);
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.socket) {
                this.socket.emit('ice-candidate', {
                    target: userId,
                    candidate: event.candidate
                });
            }
        };

        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            this.socket.emit('offer', { target: userId, offer });
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }

    async handleOffer(offer, from) {
        const peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        this.peerConnections[from] = peerConnection;

        this.micInput.getStream().getTracks().forEach(track => {
            peerConnection.addTrack(track, this.micInput.getStream());
        });

        peerConnection.ontrack = (event) => {
            console.log('Received remote stream from:', from);
            this.addParticipant(from, event.streams[0], false);
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.socket) {
                this.socket.emit('ice-candidate', {
                    target: from,
                    candidate: event.candidate
                });
            }
        };

        try {
            await peerConnection.setRemoteDescription(offer);
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            this.socket.emit('answer', { target: from, answer });
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }

    async handleAnswer(answer, from) {
        const peerConnection = this.peerConnections[from];
        if (peerConnection) {
            try {
                await peerConnection.setRemoteDescription(answer);
            } catch (error) {
                console.error('Error handling answer:', error);
            }
        }
    }

    async handleIceCandidate(candidate, from) {
        const peerConnection = this.peerConnections[from];
        if (peerConnection) {
            try {
                await peerConnection.addIceCandidate(candidate);
            } catch (error) {
                console.error('Error handling ICE candidate:', error);
            }
        }
    }

    async joinRoom() {
        const roomId = this.roomIdInput.value.trim();
        if (!roomId) {
            this.showNotification('Please enter a room ID', 'warning');
            return;
        }

        console.log('Attempting to join room:', roomId);
        
        try {
            await this.initializeMedia();
            this.connectToSignalingServer(roomId);
            this.currentRoom = roomId;
            
            this.joinRoomBtn.disabled = true;
            this.roomIdInput.disabled = true;
            this.newRoomBtn.disabled = true;
            this.currentRoomSection.style.display = 'block';
            this.roomCodeElement.textContent = roomId;
            
            this.showNotification(`Joined room: ${roomId}`, 'success');
            
        } catch (error) {
            console.error('Error joining room:', error);
            this.showNotification('Failed to join room. Please allow microphone access.', 'error');
        }
    }

    async initializeMedia() {
        try {
            console.log('Requesting microphone access...');
            const constraints = {
                audio: {
                    echoCancellation: this.settings.echoCancellation,
                    noiseSuppression: this.settings.noiseSupression,
                    autoGainControl: true
                }
            };

            await this.micInput.initialize(constraints);
            console.log('Microphone access granted');
            
            await this.populateAudioDevices();
            
            // Setup microphone glow callback
            this.micInput.addVolumeCallback((volume, frequencyData) => {
                this.updateMicrophoneGlow(this.myUserId || 'self', volume);
            });
            
        } catch (error) {
            console.error('Error accessing media devices:', error);
            if (error.name === 'NotAllowedError') {
                throw new Error('Microphone access denied. Please allow microphone permissions.');
            } else if (error.name === 'NotFoundError') {
                throw new Error('No microphone found. Please connect a microphone.');
            } else {
                throw new Error('Failed to access microphone: ' + error.message);
            }
        }
    }

    updateMicrophoneGlow(userId, volume) {
        const participant = document.getElementById(`participant-${userId}`);
        if (participant) {
            const micStatus = participant.querySelector('.mic-status');
            if (micStatus && !this.isMuted) {
                const intensity = Math.min(volume / 50, 1);
                const glowSize = 4 + (intensity * 12);
                const glowOpacity = 0.3 + (intensity * 0.5);
                
                micStatus.style.setProperty('--glow-size', `${glowSize}px`);
                micStatus.style.setProperty('--glow-color', `rgba(16, 185, 129, ${glowOpacity})`);
                micStatus.classList.add('glowing');
                
                if (volume < 5) {
                    micStatus.classList.remove('glowing');
                }
            }
        }
    }

    async populateAudioDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');
            
            this.audioDeviceSelect.innerHTML = '<option value="">Select Audio Device</option>';
            
            audioInputs.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Microphone ${index + 1}`;
                this.audioDeviceSelect.appendChild(option);
            });

            if (this.micInput.getStream()) {
                const currentTrack = this.micInput.getStream().getAudioTracks()[0];
                if (currentTrack && currentTrack.getSettings) {
                    const currentDeviceId = currentTrack.getSettings().deviceId;
                    this.audioDeviceSelect.value = currentDeviceId;
                }
            }
        } catch (error) {
            console.error('Error populating audio devices:', error);
        }
    }

    addParticipant(userId, stream, isSelf = false) {
        const existingParticipant = document.getElementById(`participant-${userId}`);
        if (existingParticipant) {
            return;
        }

        const participant = document.createElement('div');
        participant.className = 'participant';
        participant.id = `participant-${userId}`;
        
        const micStatus = document.createElement('div');
        micStatus.className = 'mic-status';
        micStatus.classList.add(this.isMuted && isSelf ? 'muted' : 'active');
        
        const name = document.createElement('span');
        const displayName = isSelf ? 
            (this.settings.username || 'You') : 
            `User ${userId.slice(0, 4)}`;
        name.textContent = displayName;
        
        participant.appendChild(micStatus);
        participant.appendChild(name);
        
        if (!isSelf && stream) {
            const audioElement = document.createElement('audio');
            audioElement.autoplay = true;
            audioElement.srcObject = stream;
            audioElement.volume = this.isDeafened ? 0 : 1;
            audioElement.style.display = 'none';
            participant.appendChild(audioElement);
        }
        
        this.participantsList.appendChild(participant);
    }

    removePeerConnection(userId) {
        if (this.peerConnections[userId]) {
            this.peerConnections[userId].close();
            delete this.peerConnections[userId];
        }
        
        const participantElement = document.getElementById(`participant-${userId}`);
        if (participantElement) {
            participantElement.remove();
        }
    }

    async leaveRoom() {
        console.log('Leaving room...');
        
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        Object.values(this.peerConnections).forEach(pc => pc.close());
        this.peerConnections = {};

        // Don't stop mic input if persistent visualizer is active
        if (!this.persistentVisualizerActive) {
            this.micInput.stop();
        }

        this.participantsList.innerHTML = '';
        this.currentRoom = null;
        this.isMuted = false;
        this.isDeafened = false;
        
        this.joinRoomBtn.disabled = false;
        this.roomIdInput.disabled = false;
        this.newRoomBtn.disabled = false;
        this.currentRoomSection.style.display = 'none';
        if (this.muteButton) {
            this.muteButton.querySelector('.text').textContent = 'Mute';
            this.muteButton.classList.remove('muted');
        }
        
        this.showNotification('Left the room', 'info');
    }

    toggleMute() {
        if (this.micInput.getStream()) {
            this.isMuted = !this.isMuted;
            this.micInput.getStream().getAudioTracks().forEach(track => {
                track.enabled = !this.isMuted;
            });
            
            const button = this.muteButton;
            button.querySelector('.text').textContent = this.isMuted ? 'Unmute' : 'Mute';
            button.querySelector('.icon').textContent = this.isMuted ? '🔇' : '🎤';
            button.classList.toggle('muted', this.isMuted);
            
            this.updateMicStatus(this.myUserId || 'self', this.isMuted);
            
            if (this.isMuted) {
                const micStatus = document.querySelector(`#participant-${this.myUserId || 'self'} .mic-status`);
                if (micStatus) {
                    micStatus.classList.remove('glowing');
                }
            }
            
            if (this.socket && this.currentRoom) {
                this.socket.emit('mic-status', { roomId: this.currentRoom, isMuted: this.isMuted });
            }
        }
    }

    updateMicStatus(userId, isMuted) {
        const participant = document.getElementById(`participant-${userId}`);
        if (participant) {
            const micStatus = participant.querySelector('.mic-status');
            micStatus.classList.toggle('muted', isMuted);
            micStatus.classList.toggle('active', !isMuted);
        }
    }

    async changeAudioDevice(deviceId) {
        if (!deviceId) {
            return;
        }

        try {
            const wasInCall = !!this.currentRoom;
            
            await this.micInput.changeDevice(deviceId);
            
            // Update all peer connections with new stream if in a call
            if (wasInCall) {
                Object.values(this.peerConnections).forEach(pc => {
                    const senders = pc.getSenders();
                    const audioSender = senders.find(sender => 
                        sender.track && sender.track.kind === 'audio'
                    );
                    if (audioSender) {
                        audioSender.replaceTrack(this.micInput.getStream().getAudioTracks()[0]);
                    }
                });
            }
            
            // Re-setup glow callback for new stream
            this.micInput.addVolumeCallback((volume, frequencyData) => {
                this.updateMicrophoneGlow(this.myUserId || 'self', volume);
            });

            // Re-setup persistent visualizer callback if active
            if (this.persistentVisualizerActive) {
                this.stopPersistentVisualizer();
                this.startPersistentVisualizer();
            }
            
            this.showNotification('Audio device changed successfully', 'success');
        } catch (error) {
            console.error('Error changing audio device:', error);
            this.showNotification('Failed to change audio device', 'error');
        }
    }

    updateAudioGain(value) {
        this.settings.audioGain = parseInt(value);
        this.saveSettings();
    }

    async testMicrophone() {
        try {
            const visualizerContainer = document.getElementById('micTestVisualizer');
            const volumeText = document.getElementById('volumeLevel');
            const levelFill = document.getElementById('micLevelFill');
            
            if (!this.micInput.getStream()) {
                await this.initializeMedia();
            }
            
            visualizerContainer.style.display = 'block';
            this.showNotification('Microphone test - speak now!', 'info');
            
            let testCallback = (volume, frequencyData) => {
                levelFill.style.width = `${volume}%`;
                volumeText.textContent = `${Math.round(volume)}%`;
            };
            
            this.micInput.addVolumeCallback(testCallback);
            
            setTimeout(() => {
                this.micInput.removeVolumeCallback(testCallback);
                visualizerContainer.style.display = 'none';
                this.showNotification('Microphone test complete! 🎤', 'success');
            }, 10000);
            
        } catch (error) {
            console.error('Error testing microphone:', error);
            this.showNotification('Failed to test microphone', 'error');
        }
    }

    resetSettings() {
        if (confirm('Are you sure you want to reset all settings to defaults?')) {
            localStorage.removeItem('proximity-settings');
            this.settings = {
                username: '',
                audioGain: 50,
                noiseSupression: true,
                echoCancellation: true,
                autoJoin: false,
                muteHotkey: 'Ctrl+M',
                deafenHotkey: 'Ctrl+D'
            };
            this.loadSettings();
            this.showNotification('Settings reset to defaults', 'success');
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
}

// Initialize the application when the DOM is loaded
console.log('Setting up DOMContentLoaded listener...');

function initApp() {
    console.log('DOM ready, initializing app...');
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