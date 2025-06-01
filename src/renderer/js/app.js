// src/renderer/js/app.js - Updated with fixed functionality
import { ConnectionManager } from './core/ConnectionManager.js';
import { UIManager } from './ui/UIManager.js';
import { AudioManager } from './audio/AudioManager.js';
import { ProximityMap } from './proximity/ProximityMap.js';
import { ServerManager } from './server/ServerManager.js';
import { ChatManager } from './chat/ChatManager.js';
import { SettingsManager } from './settings/SettingsManager.js';

const SERVER_URL = 'https://myserver2-production.up.railway.app';

class ProximityApp {
    constructor() {
        console.log('ProximityApp initializing...');
        
        // Core managers
        this.connectionManager = new ConnectionManager(SERVER_URL);
        this.uiManager = new UIManager();
        this.audioManager = new AudioManager();
        this.settingsManager = new SettingsManager();
        this.serverManager = new ServerManager();
        this.chatManager = new ChatManager();
        this.proximityMap = null;
        
        // State
        this.currentServer = null;
        this.currentChannel = null;
        this.myUserId = null;
        this.isInHub = false;
        this.isInVoiceChannel = false;
        
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
            this.proximityMap = new ProximityMap(
                document.getElementById('proximityMap'), 
                this
            );
            
            // Setup map controls
            this.setupMapControls();
            
            // Setup settings controls
            this.setupSettingsControls();
            
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

    setupMapControls() {
        // Proximity slider
        const proximitySlider = document.getElementById('proximitySlider');
        const proximityRangeDisplay = document.getElementById('proximityRange');
        
        if (proximitySlider && proximityRangeDisplay) {
            proximitySlider.addEventListener('input', (e) => {
                const range = parseInt(e.target.value);
                proximityRangeDisplay.textContent = `${range}px`;
                if (this.proximityMap) {
                    this.proximityMap.setProximityRange(range);
                }
            });
        }

        // Center map button
        const centerMapBtn = document.getElementById('centerMapBtn');
        if (centerMapBtn) {
            centerMapBtn.addEventListener('click', () => {
                if (this.proximityMap) {
                    this.proximityMap.centerMyPosition();
                }
            });
        }
        
        // Test bot toggle
        const toggleTestBotBtn = document.getElementById('toggleTestBot');
        if (toggleTestBotBtn) {
            toggleTestBotBtn.addEventListener('click', () => {
                if (this.proximityMap) {
                    if (this.proximityMap.testBotId) {
                        this.proximityMap.removeTestBot();
                        toggleTestBotBtn.innerHTML = '<span class="icon">🤖</span><span class="text">Add Test Bot</span>';
                        this.uiManager.showNotification('Test bot removed', 'info');
                    } else {
                        this.proximityMap.addTestBot();
                        toggleTestBotBtn.innerHTML = '<span class="icon">🤖</span><span class="text">Remove Test Bot</span>';
                        this.uiManager.showNotification('Test bot added - move around to test proximity!', 'success');
                    }
                }
            });
        }
    }

    setupSettingsControls() {
        // Username input
        const usernameInput = document.getElementById('username');
        if (usernameInput) {
            usernameInput.addEventListener('input', (e) => {
                this.settingsManager.set('username', e.target.value.trim());
                this.updateParticipantName();
            });
        }

        // Audio device selectors
        const audioDeviceSelect = document.getElementById('audioDevice');
        if (audioDeviceSelect) {
            audioDeviceSelect.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.audioManager.changeInputDevice(e.target.value)
                        .then(() => this.uiManager.showNotification('Audio input device changed', 'success'))
                        .catch(() => this.uiManager.showNotification('Failed to change audio input device', 'error'));
                }
            });
        }

        const audioOutputDeviceSelect = document.getElementById('audioOutputDevice');
        if (audioOutputDeviceSelect) {
            audioOutputDeviceSelect.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.audioManager.changeOutputDevice(e.target.value)
                        .then(() => this.uiManager.showNotification('Audio output device changed', 'success'))
                        .catch(() => this.uiManager.showNotification('Failed to change audio output device', 'error'));
                }
            });
        }

        // Audio gain slider
        const audioGainSlider = document.getElementById('audioGain');
        if (audioGainSlider) {
            audioGainSlider.addEventListener('input', (e) => {
                this.settingsManager.set('audioGain', parseInt(e.target.value));
                this.audioManager.setGain(parseInt(e.target.value));
                
                const valueDisplay = document.querySelector('.slider-value');
                if (valueDisplay) {
                    valueDisplay.textContent = `${e.target.value}%`;
                }
            });
        }

        // Color picker
        const colorOptions = document.querySelectorAll('.color-option');
        colorOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                const selectedColor = e.target.dataset.color;
                colorOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                
                this.settingsManager.set('userColor', selectedColor);
                this.updateParticipantColor();
                this.uiManager.showNotification(`User color changed to ${selectedColor}`, 'success');
            });
        });

        // Checkboxes
        const noiseSupressionCheck = document.getElementById('noiseSupression');
        if (noiseSupressionCheck) {
            noiseSupressionCheck.addEventListener('change', (e) => {
                this.settingsManager.set('noiseSupression', e.target.checked);
            });
        }

        const echoCancellationCheck = document.getElementById('echoCancellation');
        if (echoCancellationCheck) {
            echoCancellationCheck.addEventListener('change', (e) => {
                this.settingsManager.set('echoCancellation', e.target.checked);
            });
        }

        const autoJoinCheck = document.getElementById('autoJoin');
        if (autoJoinCheck) {
            autoJoinCheck.addEventListener('change', (e) => {
                this.settingsManager.set('autoJoin', e.target.checked);
            });
        }

        // Test buttons
        const testMicrophoneBtn = document.getElementById('testMicrophone');
        if (testMicrophoneBtn) {
            testMicrophoneBtn.addEventListener('click', () => this.testMicrophone());
        }

        const testOutputButton = document.getElementById('testOutputButton');
        if (testOutputButton) {
            testOutputButton.addEventListener('click', () => this.testOutput());
        }

        const resetSettingsBtn = document.getElementById('resetSettings');
        if (resetSettingsBtn) {
            resetSettingsBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to reset all settings to defaults?')) {
                    this.settingsManager.reset();
                    this.uiManager.showNotification('Settings reset to defaults', 'success');
                }
            });
        }
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
            
            const username = this.settingsManager.get('username') || 'Anonymous';
            const userColor = this.settingsManager.get('userColor') || 'purple';
            
            // Join the hub room (text only initially)
            this.connectionManager.socket.emit('join-hub', {
                username,
                userColor
            });
            
            this.isInHub = true;
            this.isInVoiceChannel = false; // Don't auto-join voice
            this.currentServer = { id: 'hub', name: 'Community Hub' };
            this.currentChannel = { id: 'general', type: 'text' };
            
            // Update UI
            this.uiManager.showServerView(this.currentServer);
            this.uiManager.switchToChannel('general', 'text'); // Start with text channel
            
            // Setup voice channel click handler
            this.setupVoiceChannelHandler();
            
            this.uiManager.showNotification('Joined Community Hub', 'success');
            
        } catch (error) {
            console.error('Failed to join hub:', error);
            this.uiManager.showNotification('Failed to join hub', 'error');
        }
    }

    setupVoiceChannelHandler() {
        const voiceChannel = document.querySelector('[data-channel-id="general-voice"]');
        if (voiceChannel) {
            voiceChannel.addEventListener('click', () => {
                if (!this.isInVoiceChannel) {
                    this.joinVoiceChannel();
                }
            });
        }
    }

    async joinVoiceChannel() {
        try {
            console.log('Joining voice channel...');
            
            // Initialize audio if needed
            if (!this.audioManager.isInitialized()) {
                await this.audioManager.initialize();
            }
            
            this.isInVoiceChannel = true;
            this.currentChannel = { id: 'general-voice', type: 'voice' };
            
            // Switch to voice view
            this.uiManager.switchToChannel('general-voice', 'voice');
            
            // Add self to proximity map
            const username = this.settingsManager.get('username') || 'Anonymous';
            const userColor = this.settingsManager.get('userColor') || 'purple';
            
            if (this.proximityMap) {
                this.proximityMap.addUser(this.myUserId, username, true);
                this.proximityMap.updateUserColor(this.myUserId, userColor);
            }
            
            // Add self to participants list
            this.uiManager.addParticipant(this.myUserId, null, true, username, userColor);
            
            // Connect to existing voice users
            if (this.hubUsers) {
                this.hubUsers.forEach(user => {
                    if (user.userId !== this.myUserId) {
                        this.audioManager.connectToUser(user.userId, user.username, user.userColor);
                    }
                });
            }
            
            this.uiManager.showNotification('Joined voice channel', 'success');
            
        } catch (error) {
            console.error('Failed to join voice channel:', error);
            this.uiManager.showNotification('Failed to join voice channel. Please allow microphone access.', 'error');
        }
    }

    handleHubUsers(users) {
        this.hubUsers = users; // Store for voice channel joining
        
        // Only setup voice connections if we're in voice channel
        if (this.isInVoiceChannel) {
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
    }

    handleUserJoined(user) {
        // Only add to voice if we're in voice channel
        if (this.isInVoiceChannel) {
            this.uiManager.addParticipant(user.userId, null, false, user.username, user.userColor);
            
            if (this.proximityMap) {
                this.proximityMap.addUser(user.userId, user.username, false);
                this.proximityMap.updateUserColor(user.userId, user.userColor);
            }
            
            // Establish WebRTC connection
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
            this.audioManager.startPersistentVisualizer();
        } else {
            this.audioManager.stopPersistentVisualizer();
        }
    }

    leaveCurrentChannel() {
        if (!this.isInHub) return;
        
        console.log('Leaving current channel...');
        
        if (this.isInVoiceChannel) {
            // Disconnect from all users
            this.audioManager.disconnectAll();
            
            // Clear UI
            this.uiManager.clearParticipants();
            if (this.proximityMap) {
                this.proximityMap.clearUsers();
            }
            
            this.isInVoiceChannel = false;
            
            // Switch back to text channel
            this.uiManager.switchToChannel('general', 'text');
            this.uiManager.showNotification('Left voice channel', 'info');
        } else {
            // Leave the entire hub
            this.connectionManager.socket.emit('leave-hub');
            
            this.isInHub = false;
            this.isInVoiceChannel = false;
            this.currentServer = null;
            this.currentChannel = null;
            
            // Return to home
            this.uiManager.switchPage('home');
            this.uiManager.showNotification('Left the hub', 'info');
        }
    }

    updateParticipantName() {
        const selfParticipant = document.getElementById(`participant-${this.myUserId}`);
        if (selfParticipant) {
            const nameSpan = selfParticipant.querySelector('span:last-child');
            if (nameSpan) {
                nameSpan.textContent = `${this.settingsManager.get('username') || 'You'} (You)`;
            }
        }
        
        if (this.proximityMap && this.myUserId) {
            const user = this.proximityMap.users.get(this.myUserId);
            if (user) {
                user.username = this.settingsManager.get('username') || 'You';
            }
        }
    }

    updateParticipantColor() {
        if (this.proximityMap && this.myUserId) {
            this.proximityMap.updateUserColor(this.myUserId, this.settingsManager.get('userColor'));
        }
    }

    async testMicrophone() {
        try {
            if (!this.audioManager.isInitialized()) {
                await this.audioManager.initialize();
            }
            
            await this.audioManager.testMicrophone();
            this.uiManager.showNotification('Microphone test - speak now! 🎤', 'info');
            
            setTimeout(() => {
                this.uiManager.showNotification('Microphone test complete!', 'success');
            }, 10000);
            
        } catch (error) {
            console.error('Error testing microphone:', error);
            this.uiManager.showNotification('Failed to test microphone', 'error');
        }
    }

    async testOutput() {
        try {
            await this.audioManager.testOutput();
            this.uiManager.showNotification('Playing test sound...', 'info');
        } catch (error) {
            this.uiManager.showNotification('Failed to play test sound', 'error');
        }
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