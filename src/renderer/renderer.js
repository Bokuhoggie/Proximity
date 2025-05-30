// Enhanced version with mic visualizer and room management
console.log('Enhanced Renderer.js starting...');

class AudioVisualizer {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.dataArray = null;
        this.isActive = false;
        this.callbacks = [];
    }

    async initialize(stream) {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            this.microphone.connect(this.analyser);
            this.isActive = true;
            
            this.startAnalyzing();
            console.log('Audio visualizer initialized');
        } catch (error) {
            console.error('Error initializing audio visualizer:', error);
        }
    }

    startAnalyzing() {
        if (!this.isActive) return;
        
        this.analyser.getByteFrequencyData(this.dataArray);
        
        // Calculate volume level (0-100)
        const average = this.dataArray.reduce((a, b) => a + b) / this.dataArray.length;
        const volume = Math.min(100, (average / 128) * 100);
        
        // Notify all callbacks
        this.callbacks.forEach(callback => callback(volume, this.dataArray));
        
        requestAnimationFrame(() => this.startAnalyzing());
    }

    addCallback(callback) {
        this.callbacks.push(callback);
    }

    removeCallback(callback) {
        this.callbacks = this.callbacks.filter(cb => cb !== callback);
    }

    stop() {
        this.isActive = false;
        if (this.audioContext) {
            this.audioContext.close();
        }
        this.callbacks = [];
    }
}

class MicrophoneInput {
    constructor() {
        this.stream = null;
        this.visualizer = null;
        this.isRecording = false;
        this.constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false
        };
    }

    async initialize(constraints = {}) {
        this.constraints = { ...this.constraints, ...constraints };
        
        try {
            this.stream = await navigator.mediaDevices.getUserMedia(this.constraints);
            this.visualizer = new AudioVisualizer();
            await this.visualizer.initialize(this.stream);
            this.isRecording = true;
            console.log('Microphone input initialized');
            return this.stream;
        } catch (error) {
            console.error('Error initializing microphone:', error);
            throw error;
        }
    }

    getStream() {
        return this.stream;
    }

    getVisualizer() {
        return this.visualizer;
    }

    addVolumeCallback(callback) {
        if (this.visualizer) {
            this.visualizer.addCallback(callback);
        }
    }

    removeVolumeCallback(callback) {
        if (this.visualizer) {
            this.visualizer.removeCallback(callback);
        }
    }

    stop() {
        this.isRecording = false;
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        if (this.visualizer) {
            this.visualizer.stop();
        }
    }

    async changeDevice(deviceId) {
        if (this.stream) {
            this.stop();
        }
        
        const newConstraints = {
            ...this.constraints,
            audio: {
                ...this.constraints.audio,
                deviceId: { exact: deviceId }
            }
        };
        
        return await this.initialize(newConstraints);
    }
}

class WannabeApp {
    constructor() {
        console.log('WannabeApp constructor called');
        this.socket = null;
        this.peerConnections = {};
        this.micInput = new MicrophoneInput();
        this.isMuted = false;
        this.isDeafened = false;
        this.currentRoom = null;
        this.createdRooms = []; // Track created rooms
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
        console.log('WannabeApp initialized');
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
        
        // Create mic test visualizer
        this.createMicTestVisualizer();
        
        // Create created rooms container
        this.createCreatedRoomsContainer();
        
        console.log('UI elements found:', {
            navItems: this.navItems.length,
            joinBtn: !!this.joinRoomBtn,
            newRoomBtn: !!this.newRoomBtn
        });
    }

    createMicTestVisualizer() {
        // Find the test microphone button and add visualizer after it
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
        visualizerTitle.textContent = 'Microphone Level';
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
        // Find the room controls and add created rooms container after it
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
        // Add glow styles to document
        const style = document.createElement('style');
        style.textContent = `
            .mic-status.glowing {
                box-shadow: 0 0 var(--glow-size, 8px) var(--glow-color, rgba(16, 185, 129, 0.6));
                transition: box-shadow 0.1s ease;
            }
            
            .participant {
                position: relative;
            }
        `;
        document.head.appendChild(style);
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // Navigation
        this.navItems.forEach((item, index) => {
            console.log(`Adding click listener to nav item ${index}:`, item.dataset.page);
            item.addEventListener('click', (e) => {
                console.log('Nav item clicked:', item.dataset.page);
                const page = item.dataset.page;
                this.switchPage(page);
            });
        });

        // Room controls
        if (this.joinRoomBtn) {
            this.joinRoomBtn.addEventListener('click', () => {
                console.log('Join room button clicked');
                this.joinRoom();
            });
        }
        
        if (this.leaveRoomBtn) {
            this.leaveRoomBtn.addEventListener('click', () => {
                console.log('Leave room button clicked');
                this.leaveRoom();
            });
        }
        
        if (this.muteButton) {
            this.muteButton.addEventListener('click', () => {
                console.log('Mute button clicked');
                this.toggleMute();
            });
        }
        
        if (this.newRoomBtn) {
            this.newRoomBtn.addEventListener('click', () => {
                console.log('New room button clicked');
                this.createNewRoom();
            });
        }

        // Allow Enter key to join room
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
        
        // Update navigation
        this.navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.page === pageName);
        });

        // Update pages
        this.pages.forEach(page => {
            page.classList.toggle('active', page.id === `${pageName}-page`);
        });

        // Initialize audio devices when switching to settings
        if (pageName === 'settings') {
            this.populateAudioDevices();
        }
    }

    loadSettings() {
        // Load settings from localStorage or use defaults
        try {
            const savedSettings = localStorage.getItem('wannabe-settings');
            if (savedSettings) {
                this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }

        // Apply settings to UI
        if (this.usernameInput) this.usernameInput.value = this.settings.username;
        if (this.audioGainSlider) this.audioGainSlider.value = this.settings.audioGain;
        if (this.noiseSupressionCheck) this.noiseSupressionCheck.checked = this.settings.noiseSupression;
        if (this.echoCancellationCheck) this.echoCancellationCheck.checked = this.settings.echoCancellation;
        if (this.autoJoinCheck) this.autoJoinCheck.checked = this.settings.autoJoin;

        // Update slider display
        const valueDisplay = document.querySelector('.slider-value');
        if (valueDisplay) {
            valueDisplay.textContent = `${this.settings.audioGain}%`;
        }
    }

    saveSettings() {
        try {
            localStorage.setItem('wannabe-settings', JSON.stringify(this.settings));
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
        
        // Add to created rooms list
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
        
        // Show container if we have rooms
        container.style.display = this.createdRooms.length > 0 ? 'block' : 'none';
        
        // Clear existing rooms
        list.innerHTML = '';
        
        // Add each room
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

    async joinRoom() {
        const roomId = this.roomIdInput.value.trim();
        if (!roomId) {
            this.showNotification('Please enter a room ID', 'warning');
            return;
        }

        console.log('Attempting to join room:', roomId);
        
        try {
            // Initialize microphone input
            await this.initializeMedia();
            
            this.currentRoom = roomId;
            
            // Update UI
            this.joinRoomBtn.disabled = true;
            this.roomIdInput.disabled = true;
            this.newRoomBtn.disabled = true;
            this.currentRoomSection.style.display = 'block';
            this.roomCodeElement.textContent = roomId;
            
            this.showNotification(`Joined room: ${roomId}`, 'success');
            
        } catch (error) {
            console.error('Error joining room:', error);
            this.showNotification('Failed to join room. Check microphone permissions.', 'error');
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
            this.addParticipant('self', this.micInput.getStream(), true);
            
            // Setup microphone glow callback
            this.micInput.addVolumeCallback((volume, frequencyData) => {
                this.updateMicrophoneGlow('self', volume);
            });
            
        } catch (error) {
            console.error('Error accessing media devices:', error);
            throw error;
        }
    }

    updateMicrophoneGlow(userId, volume) {
        const participant = document.getElementById(`participant-${userId}`);
        if (participant) {
            const micStatus = participant.querySelector('.mic-status');
            if (micStatus && !this.isMuted) {
                // Calculate glow intensity based on volume
                const intensity = Math.min(volume / 50, 1); // Normalize to 0-1
                const glowSize = 4 + (intensity * 12); // 4px to 16px
                const glowOpacity = 0.3 + (intensity * 0.5); // 0.3 to 0.8
                
                micStatus.style.setProperty('--glow-size', `${glowSize}px`);
                micStatus.style.setProperty('--glow-color', `rgba(16, 185, 129, ${glowOpacity})`);
                micStatus.classList.add('glowing');
                
                // Remove glow if volume is very low
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
            
            console.log('Audio devices found:', audioInputs.length);
            
            // Clear existing options except the first placeholder
            this.audioDeviceSelect.innerHTML = '<option value="">Select Audio Device</option>';
            
            audioInputs.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Microphone ${index + 1}`;
                this.audioDeviceSelect.appendChild(option);
            });

            // Set current device as selected if we have a stream
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
        // Check if participant already exists
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
        
        this.participantsList.appendChild(participant);
    }

    async leaveRoom() {
        console.log('Leaving room...');
        
        this.micInput.stop();

        this.participantsList.innerHTML = '';
        this.currentRoom = null;
        this.isMuted = false;
        this.isDeafened = false;
        
        // Reset UI
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
            
            this.updateMicStatus('self', this.isMuted);
            
            // Remove glow when muted
            if (this.isMuted) {
                const micStatus = document.querySelector('#participant-self .mic-status');
                if (micStatus) {
                    micStatus.classList.remove('glowing');
                }
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
        if (!deviceId || !this.micInput.getStream()) {
            return;
        }

        try {
            await this.micInput.changeDevice(deviceId);
            
            // Re-setup glow callback for new stream
            this.micInput.addVolumeCallback((volume, frequencyData) => {
                this.updateMicrophoneGlow('self', volume);
            });
            
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
            
            // Show visualizer
            visualizerContainer.style.display = 'block';
            this.showNotification('Microphone test - speak now!', 'info');
            
            let testCallback = (volume, frequencyData) => {
                // Update volume bar
                levelFill.style.width = `${volume}%`;
                volumeText.textContent = `${Math.round(volume)}%`;
            };
            
            this.micInput.addVolumeCallback(testCallback);
            
            // Stop test after 10 seconds
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
            localStorage.removeItem('wannabe-settings');
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
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Style the notification
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
        
        // Set background color based on type
        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#6b46c1'
        };
        notification.style.backgroundColor = colors[type] || colors.info;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 10);
        
        // Remove after 3 seconds
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
        window.wannabeApp = new WannabeApp();
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