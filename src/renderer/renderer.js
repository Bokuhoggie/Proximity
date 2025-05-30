import { io } from 'socket.io-client';
import 'webrtc-adapter';
import './styles.css';

class WannabeApp {
    constructor() {
        this.socket = null;
        this.peerConnections = {};
        this.localStream = null;
        this.isMuted = false;
        this.isDeafened = false;
        this.currentRoom = null;
        this.peers = {};
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
        this.setupHotkeys();
    }

    initializeUI() {
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
    }

    setupEventListeners() {
        // Navigation
        this.navItems.forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                this.switchPage(page);
            });
        });

        // Room controls
        this.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        this.leaveRoomBtn.addEventListener('click', () => this.leaveRoom());
        this.muteButton.addEventListener('click', () => this.toggleMute());
        this.newRoomBtn.addEventListener('click', () => this.createNewRoom());

        // Allow Enter key to join room
        this.roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !this.joinRoomBtn.disabled) {
                this.joinRoom();
            }
        });

        // Settings controls
        this.audioDeviceSelect.addEventListener('change', (e) => this.changeAudioDevice(e.target.value));
        this.audioGainSlider.addEventListener('input', (e) => this.updateAudioGain(e.target.value));
        this.noiseSupressionCheck.addEventListener('change', (e) => this.updateNoiseSuppression(e.target.checked));
        this.echoCancellationCheck.addEventListener('change', (e) => this.updateEchoCancellation(e.target.checked));
        this.usernameInput.addEventListener('input', (e) => this.updateUsername(e.target.value));
        this.autoJoinCheck.addEventListener('change', (e) => this.updateAutoJoin(e.target.checked));
        this.testMicrophoneBtn.addEventListener('click', () => this.testMicrophone());
        this.resetSettingsBtn.addEventListener('click', () => this.resetSettings());

        // Update slider value display
        this.audioGainSlider.addEventListener('input', (e) => {
            const valueDisplay = document.querySelector('.slider-value');
            if (valueDisplay) {
                valueDisplay.textContent = `${e.target.value}%`;
            }
        });
    }

    switchPage(pageName) {
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
        const savedSettings = localStorage.getItem('wannabe-settings');
        if (savedSettings) {
            this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
        }

        // Apply settings to UI
        this.usernameInput.value = this.settings.username;
        this.audioGainSlider.value = this.settings.audioGain;
        this.noiseSupressionCheck.checked = this.settings.noiseSupression;
        this.echoCancellationCheck.checked = this.settings.echoCancellation;
        this.autoJoinCheck.checked = this.settings.autoJoin;

        // Update slider display
        const valueDisplay = document.querySelector('.slider-value');
        if (valueDisplay) {
            valueDisplay.textContent = `${this.settings.audioGain}%`;
        }
    }

    saveSettings() {
        localStorage.setItem('wannabe-settings', JSON.stringify(this.settings));
    }

    setupHotkeys() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'm') {
                e.preventDefault();
                this.toggleMute();
            }
            if (e.ctrlKey && e.key === 'd') {
                e.preventDefault();
                this.toggleDeafen();
            }
        });
    }

    generateRoomCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    async createNewRoom() {
        const roomCode = this.generateRoomCode();
        this.roomIdInput.value = roomCode;
        await this.joinRoom();
    }

    async joinRoom() {
        const roomId = this.roomIdInput.value.trim();
        if (!roomId) {
            this.showNotification('Please enter a room ID', 'warning');
            return;
        }

        try {
            await this.initializeMedia();
            this.connectToSignalingServer(roomId);
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
            this.showNotification('Failed to join room. Please check your microphone permissions.', 'error');
        }
    }

    async initializeMedia() {
        try {
            const constraints = {
                audio: {
                    echoCancellation: this.settings.echoCancellation,
                    noiseSuppression: this.settings.noiseSupression,
                    autoGainControl: true
                },
                video: false
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            await this.populateAudioDevices();
            this.applyAudioGain();
        } catch (error) {
            console.error('Error accessing media devices:', error);
            throw error;
        }
    }

    async populateAudioDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');
            
            // Clear existing options except the first placeholder
            this.audioDeviceSelect.innerHTML = '<option value="">Select Audio Device</option>';
            
            audioInputs.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Microphone ${index + 1}`;
                this.audioDeviceSelect.appendChild(option);
            });

            // Set current device as selected if we have a stream
            if (this.localStream) {
                const currentTrack = this.localStream.getAudioTracks()[0];
                if (currentTrack) {
                    const currentDeviceId = currentTrack.getSettings().deviceId;
                    this.audioDeviceSelect.value = currentDeviceId;
                }
            }
        } catch (error) {
            console.error('Error populating audio devices:', error);
        }
    }

    connectToSignalingServer(roomId) {
        this.socket = io('http://localhost:3000');

        this.socket.on('connect', () => {
            console.log('Connected to signaling server');
            this.socket.emit('join-room', roomId);
            this.addParticipant(this.socket.id, this.localStream, true);
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
            console.log('Received ICE candidate from:', from);
            await this.handleIceCandidate(candidate, from);
        });

        this.socket.on('user-left', (userId) => {
            console.log('User left:', userId);
            this.removePeerConnection(userId);
        });

        this.socket.on('user-mic-status', ({ userId, isMuted }) => {
            this.updateMicStatus(userId, isMuted);
        });

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from signaling server');
        });
    }

    async connectToNewUser(userId) {
        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        });

        this.peerConnections[userId] = peerConnection;

        // Add local stream
        this.localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, this.localStream);
        });

        // Handle incoming streams
        peerConnection.ontrack = (event) => {
            console.log('Received remote stream from:', userId);
            this.addParticipant(userId, event.streams[0], false);
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('ice-candidate', {
                    target: userId,
                    candidate: event.candidate
                });
            }
        };

        // Create and send offer
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
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        });

        this.peerConnections[from] = peerConnection;

        // Add local stream
        this.localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, this.localStream);
        });

        // Handle incoming streams
        peerConnection.ontrack = (event) => {
            console.log('Received remote stream from:', from);
            this.addParticipant(from, event.streams[0], false);
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
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
            (this.settings.username || `User ${userId.slice(0, 4)}`);
        name.textContent = displayName;
        
        participant.appendChild(micStatus);
        participant.appendChild(name);
        
        // Add audio element for remote participants
        if (!isSelf && stream) {
            const audioElement = document.createElement('audio');
            audioElement.autoplay = true;
            audioElement.srcObject = stream;
            audioElement.volume = this.isDeafened ? 0 : 1;
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
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        Object.values(this.peerConnections).forEach(pc => pc.close());
        this.peerConnections = {};

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        this.participantsList.innerHTML = '';
        this.currentRoom = null;
        this.isMuted = false;
        this.isDeafened = false;
        
        // Reset UI
        this.joinRoomBtn.disabled = false;
        this.roomIdInput.disabled = false;
        this.newRoomBtn.disabled = false;
        this.currentRoomSection.style.display = 'none';
        this.muteButton.querySelector('.text').textContent = 'Mute';
        this.muteButton.classList.remove('muted');
        
        this.showNotification('Left the room', 'info');
    }

    toggleMute() {
        if (this.localStream) {
            this.isMuted = !this.isMuted;
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !this.isMuted;
            });
            
            const button = this.muteButton;
            button.querySelector('.text').textContent = this.isMuted ? 'Unmute' : 'Mute';
            button.querySelector('.icon').textContent = this.isMuted ? '🔇' : '🎤';
            button.classList.toggle('muted', this.isMuted);
            
            this.updateMicStatus(this.socket?.id, this.isMuted);
            
            if (this.socket && this.currentRoom) {
                this.socket.emit('mic-status', { roomId: this.currentRoom, isMuted: this.isMuted });
            }
        }
    }

    toggleDeafen() {
        this.isDeafened = !this.isDeafened;
        
        // Mute/unmute all remote audio elements
        const audioElements = this.participantsList.querySelectorAll('audio');
        audioElements.forEach(audio => {
            audio.volume = this.isDeafened ? 0 : 1;
        });
        
        // If deafened, also mute microphone
        if (this.isDeafened && !this.isMuted) {
            this.toggleMute();
        }
        
        this.showNotification(
            this.isDeafened ? 'Deafened' : 'Undeafened', 
            'info'
        );
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
        if (!deviceId || !this.localStream) {
            return;
        }

        try {
            const oldStream = this.localStream;
            
            // Get new stream with selected device and current settings
            const constraints = {
                audio: {
                    deviceId: { exact: deviceId },
                    echoCancellation: this.settings.echoCancellation,
                    noiseSuppression: this.settings.noiseSupression,
                    autoGainControl: true
                },
                video: false
            };
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

            // Update all peer connections with new stream
            Object.values(this.peerConnections).forEach(pc => {
                const senders = pc.getSenders();
                const audioSender = senders.find(sender => 
                    sender.track && sender.track.kind === 'audio'
                );
                if (audioSender) {
                    audioSender.replaceTrack(this.localStream.getAudioTracks()[0]);
                }
            });

            // Apply current settings to new stream
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !this.isMuted;
            });
            this.applyAudioGain();

            // Stop old stream
            oldStream.getTracks().forEach(track => track.stop());
            
            this.showNotification('Audio device changed successfully', 'success');
        } catch (error) {
            console.error('Error changing audio device:', error);
            this.showNotification('Failed to change audio device', 'error');
        }
    }

    updateAudioGain(value) {
        this.settings.audioGain = parseInt(value);
        this.applyAudioGain();
        this.saveSettings();
    }

    applyAudioGain() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack && audioTrack.getSettings) {
                // Note: Direct gain control via MediaStreamTrack is limited
                // This is a placeholder for future implementation
                console.log(`Audio gain set to: ${this.settings.audioGain}%`);
            }
        }
    }

    updateNoiseSuppression(enabled) {
        this.settings.noiseSupression = enabled;
        this.saveSettings();
        // Would need to restart stream with new constraints in full implementation
    }

    updateEchoCancellation(enabled) {
        this.settings.echoCancellation = enabled;
        this.saveSettings();
        // Would need to restart stream with new constraints in full implementation
    }

    updateUsername(username) {
        this.settings.username = username.trim();
        this.saveSettings();
    }

    updateAutoJoin(enabled) {
        this.settings.autoJoin = enabled;
        this.saveSettings();
    }

    async testMicrophone() {
        try {
            if (!this.localStream) {
                await this.initializeMedia();
            }
            
            this.showNotification('Microphone test - speak now!', 'info');
            
            // Simple microphone test implementation
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(this.localStream);
            const analyser = audioContext.createAnalyser();
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            
            source.connect(analyser);
            
            let testDuration = 3000; // 3 seconds
            const testInterval = setInterval(() => {
                analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                
                if (average > 10) {
                    this.showNotification('Microphone is working! 🎤', 'success');
                    clearInterval(testInterval);
                    audioContext.close();
                    return;
                }
                
                testDuration -= 100;
                if (testDuration <= 0) {
                    this.showNotification('No audio detected. Check your microphone.', 'warning');
                    clearInterval(testInterval);
                    audioContext.close();
                }
            }, 100);
            
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
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new WannabeApp();
});