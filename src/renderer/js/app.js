// src/renderer/js/app.js - Simplified single-room version
import { ConnectionManager } from './core/ConnectionManager.js';
import { UIManager } from './ui/UIManager.js';
import { AudioManager } from './audio/AudioManager.js';
import { ProximityMap } from './proximity/ProximityMap.js';
import { SettingsManager } from './settings/SettingsManager.js';

// Try Railway first, fallback to localhost for development
const SERVER_URL = 'https://myserver2-production.up.railway.app';
const FALLBACK_URL = 'http://localhost:3000';

class ProximityApp {
    constructor() {
        console.log('ProximityApp initializing...');

        // Core managers
        this.connectionManager = new ConnectionManager(SERVER_URL);
        this.uiManager = new UIManager();
        this.audioManager = new AudioManager();
        this.settingsManager = new SettingsManager();
        this.proximityMap = null;
        this.miniProximityMap = null;

        // State - simplified to single channel
        this.currentTextChannel = 'general';
        this.currentVoiceChannel = null;
        this.myUserId = null;
        this.isInHub = false;
        this.hubUsers = [];

        // Chat message storage (persistent across sessions)
        this.globalChatHistory = this.loadGlobalChatHistory();

        this.init();
    }

    loadGlobalChatHistory() {
        try {
            const saved = localStorage.getItem('proximity-chat-history');
            return saved ? JSON.parse(saved) : { general: [] };
        } catch (error) {
            console.error('Failed to load chat history:', error);
            return { general: [] };
        }
    }

    saveGlobalChatHistory() {
        try {
            localStorage.setItem('proximity-chat-history', JSON.stringify(this.globalChatHistory));
        } catch (error) {
            console.error('Failed to save chat history:', error);
        }
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

            // Setup map buttons for voice channels
            this.setupMapButtons();

            // Setup mini map modal
            this.setupMiniMapModal();

            // TEMPORARILY DISABLED: Backend connection
            // await this.connectWithFallback();

            // AUTO-JOIN: Simulate being in the room from the start
            this.isInHub = true;
            this.myUserId = 'local-user-' + Math.random().toString(36).substr(2, 9);
            console.log('ProximityApp initialized in LOCAL MODE (no backend)');

            // Setup first-time modal and settings
            this.setupFirstTimeModal();
            this.setupSettingsModal();
            this.setupStatusSelector();

            // Show first-time setup if never completed
            const setupCompleted = localStorage.getItem('proximity-setup-completed');
            if (!setupCompleted) {
                this.showFirstTimeSetup();
            }

        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.uiManager.showNotification('Failed to initialize app', 'error');
        }
    }

    async connectWithFallback() {
        try {
            await this.connectionManager.connect();
            this.myUserId = this.connectionManager.socket.id;
            this.setupConnectionHandlers();
        } catch (error) {
            console.warn('Railway server failed, trying localhost...', error);
            try {
                this.connectionManager = new ConnectionManager(FALLBACK_URL);
                await this.connectionManager.connect();
                this.myUserId = this.connectionManager.socket.id;
                this.setupConnectionHandlers();
                this.uiManager.showNotification('Connected to local server', 'warning');
            } catch (fallbackError) {
                console.error('Both servers failed:', fallbackError);
                this.uiManager.showNotification('Could not connect to any server', 'error');
            }
        }
    }

    setupEventListeners() {
        // Navigation
        this.uiManager.on('page-change', (page) => this.handlePageChange(page));
        this.uiManager.on('join-hub', () => this.joinHub());
        this.uiManager.on('leave-channel', () => this.leaveCurrentChannel());
        this.uiManager.on('mute-toggle', () => this.audioManager.toggleMute());

        // Channel events - simplified
        this.uiManager.on('join-voice-channel', (channelId) => this.joinVoiceChannel(channelId));
        this.uiManager.on('leave-voice-channel', (channelId) => this.leaveVoiceChannel(channelId));

        // Chat events
        this.uiManager.on('send-message', (data) => {
            console.log('App received send-message event:', data);
            this.sendChatMessage(data.message);
        });

        this.uiManager.on('delete-message', (messageId) => this.deleteMessage(messageId));

        // Settings
        this.uiManager.on('settings-change', (settings) => this.settingsManager.update(settings));
    }

    setupMiniMapModal() {
        // Create mini map modal
        const modalHTML = `
            <div id="miniMapModal" class="mini-map-modal" style="display: none;">
                <div class="mini-map-content">
                    <div class="mini-map-header">
                        <h4>Channel Map</h4>
                        <button id="closeMiniMap" class="close-btn">×</button>
                    </div>
                    <canvas id="miniProximityMap" width="400" height="300"></canvas>
                    <div class="mini-map-controls">
                        <div class="proximity-info">
                            <span>Range: <span id="miniProximityRange">100px</span></span>
                            <input type="range" id="miniProximitySlider" min="50" max="300" value="100" class="proximity-slider">
                        </div>
                        <button id="miniCenterBtn" class="btn secondary">Center</button>
                        <button id="miniToggleTestBot" class="btn secondary">
                            <span class="icon">🤖</span>
                            <span class="text">Add Test Bot</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Setup mini map controls
        const closeMiniMap = document.getElementById('closeMiniMap');
        const miniProximitySlider = document.getElementById('miniProximitySlider');
        const miniProximityRange = document.getElementById('miniProximityRange');
        const miniCenterBtn = document.getElementById('miniCenterBtn');
        const miniToggleTestBot = document.getElementById('miniToggleTestBot');

        if (closeMiniMap) {
            closeMiniMap.addEventListener('click', () => this.closeMiniMap());
        }

        if (miniProximitySlider && miniProximityRange) {
            miniProximitySlider.addEventListener('input', (e) => {
                const range = parseInt(e.target.value);
                miniProximityRange.textContent = `${range}px`;

                // Update both maps
                if (this.proximityMap) {
                    this.proximityMap.setProximityRange(range);
                }
                if (this.miniProximityMap) {
                    this.miniProximityMap.setProximityRange(range);
                }

                // Sync with main slider
                const mainSlider = document.getElementById('proximitySlider');
                if (mainSlider) {
                    mainSlider.value = range;
                    document.getElementById('proximityRange').textContent = `${range}px`;
                }
            });
        }

        if (miniCenterBtn) {
            miniCenterBtn.addEventListener('click', () => {
                if (this.proximityMap) {
                    this.proximityMap.centerMyPosition();
                }
            });
        }

        if (miniToggleTestBot) {
            miniToggleTestBot.addEventListener('click', () => {
                if (this.proximityMap) {
                    if (this.proximityMap.testBotId) {
                        // Remove test bot
                        this.proximityMap.removeTestBot();
                        miniToggleTestBot.innerHTML = '<span class="icon">🤖</span><span class="text">Add Test Bot</span>';

                        const mainToggleBtn = document.getElementById('toggleTestBot');
                        if (mainToggleBtn) {
                            mainToggleBtn.innerHTML = '<span class="icon">🤖</span><span class="text">Add Test Bot</span>';
                        }

                        this.uiManager.showNotification('Test bot removed', 'info');
                    } else {
                        // Add test bot
                        this.proximityMap.addTestBot();
                        miniToggleTestBot.innerHTML = '<span class="icon">🤖</span><span class="text">Remove Test Bot</span>';

                        const mainToggleBtn = document.getElementById('toggleTestBot');
                        if (mainToggleBtn) {
                            mainToggleBtn.innerHTML = '<span class="icon">🤖</span><span class="text">Remove Test Bot</span>';
                        }

                        this.uiManager.showNotification('Test bot added - move around to test proximity!', 'success');
                    }
                }
            });
        }

        // Click outside to close
        const modal = document.getElementById('miniMapModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeMiniMap();
                }
            });
        }
    }

    openMiniMap() {
        if (!this.currentVoiceChannel) {
            this.uiManager.showNotification('Join a voice channel first', 'warning');
            return;
        }

        const modal = document.getElementById('miniMapModal');
        if (modal) {
            modal.style.display = 'flex';

            const miniCanvas = document.getElementById('miniProximityMap');
            if (miniCanvas && this.proximityMap) {
                this.miniProximityMap = new ProximityMap(miniCanvas, this);
                this.miniProximityMap.setMinimapMode(true);

                setTimeout(() => {
                    if (this.miniProximityMap) {
                        this.miniProximityMap.resizeCanvas();

                        // Copy users from main map to mini map
                        this.proximityMap.users.forEach((user, userId) => {
                            const audioElement = userId === this.proximityMap.testBotId ? null : user.audioElement;

                            const mainCanvas = this.proximityMap.canvas;
                            const miniCanvas = this.miniProximityMap.canvas;
                            const scaleX = miniCanvas.width / mainCanvas.width;
                            const scaleY = miniCanvas.height / mainCanvas.height;

                            this.miniProximityMap.users.set(userId, {
                                x: user.x * scaleX,
                                y: user.y * scaleY,
                                username: user.username,
                                isSelf: user.isSelf,
                                audioElement: audioElement,
                                lastUpdate: user.lastUpdate,
                                color: user.color,
                                isBot: user.isBot || false,
                                isActive: user.isActive || false
                            });

                            if (user.isSelf) {
                                this.miniProximityMap.myUserId = userId;
                            }
                        });

                        if (this.proximityMap.testBotId) {
                            this.miniProximityMap.testBotId = this.proximityMap.testBotId;
                            const miniToggleBtn = document.getElementById('miniToggleTestBot');
                            if (miniToggleBtn) {
                                miniToggleBtn.innerHTML = '<span class="icon">🤖</span><span class="text">Remove Test Bot</span>';
                            }
                        }

                        this.miniProximityMap.setProximityRange(this.proximityMap.proximityRange);

                        const miniSlider = document.getElementById('miniProximitySlider');
                        const miniRangeDisplay = document.getElementById('miniProximityRange');
                        if (miniSlider && miniRangeDisplay) {
                            miniSlider.value = this.proximityMap.proximityRange;
                            miniRangeDisplay.textContent = `${this.proximityMap.proximityRange}px`;
                        }
                    }
                }, 100);
            }
        }
    }

    closeMiniMap() {
        const modal = document.getElementById('miniMapModal');
        if (modal) {
            modal.style.display = 'none';
        }

        if (this.miniProximityMap) {
            if (this.miniProximityMap.testBotMovementInterval) {
                clearInterval(this.miniProximityMap.testBotMovementInterval);
            }
            this.miniProximityMap = null;
        }
    }

    setupMapButtons() {
        const mapButtons = document.querySelectorAll('.map-button');
        mapButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const voiceChannel = button.dataset.voiceChannel;

                if (this.currentVoiceChannel !== voiceChannel) {
                    this.uiManager.showNotification('Join the voice channel first to access the map', 'warning');
                    return;
                }

                this.openMiniMap();
            });
        });
    }

    sendChatMessage(message) {
        if (!message.trim()) return;

        if (!this.isInHub) {
            console.error('Not in hub');
            return;
        }

        const username = this.settingsManager.get('username') || 'Anonymous';

        console.log('Sending chat message:', message);

        const messageData = {
            id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            roomId: 'hub',
            message: message,
            username: username,
            channel: 'general',
            timestamp: Date.now(),
            userId: this.myUserId
        };

        // LOCAL MODE: Save message locally instead of sending to server
        if (!this.globalChatHistory.general) {
            this.globalChatHistory.general = [];
        }

        this.globalChatHistory.general.push(messageData);
        this.saveGlobalChatHistory();
        this.uiManager.addChatMessage(messageData);

        // If backend is connected, also send to server
        if (this.connectionManager.socket) {
            this.connectionManager.socket.emit('send-chat-message', messageData);
        }
    }

    deleteMessage(messageId) {
        if (!this.connectionManager.socket) {
            console.error('Not connected to server');
            return;
        }

        console.log('Deleting message:', messageId);

        this.connectionManager.socket.emit('delete-chat-message', {
            messageId: messageId,
            userId: this.myUserId
        });
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
                const miniSlider = document.getElementById('miniProximitySlider');
                if (miniSlider) {
                    miniSlider.value = range;
                    document.getElementById('miniProximityRange').textContent = `${range}px`;
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

                        const miniToggleBtn = document.getElementById('miniToggleTestBot');
                        if (miniToggleBtn) {
                            miniToggleBtn.innerHTML = '<span class="icon">🤖</span><span class="text">Add Test Bot</span>';
                        }

                        this.uiManager.showNotification('Test bot removed', 'info');
                    } else {
                        this.proximityMap.addTestBot();
                        toggleTestBotBtn.innerHTML = '<span class="icon">🤖</span><span class="text">Remove Test Bot</span>';

                        const miniToggleBtn = document.getElementById('miniToggleTestBot');
                        if (miniToggleBtn) {
                            miniToggleBtn.innerHTML = '<span class="icon">🤖</span><span class="text">Remove Test Bot</span>';
                        }

                        this.uiManager.showNotification('Test bot added - move around to test proximity!', 'success');
                    }
                }
            });
        }

        // Map leave channel button
        const mapLeaveChannelBtn = document.getElementById('mapLeaveChannelBtn');
        if (mapLeaveChannelBtn) {
            mapLeaveChannelBtn.addEventListener('click', () => {
                console.log('Map leave button clicked');
                this.leaveCurrentChannel();
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
                if (e.target.value && !this.isPopulatingDevices) {
                    this.settingsManager.set('audioInputDevice', e.target.value);
                    this.audioManager.changeInputDevice(e.target.value)
                        .then(() => this.uiManager.showNotification('Audio input device changed', 'success'))
                        .catch(() => this.uiManager.showNotification('Failed to change audio input device', 'error'));
                }
            });
        }

        const audioOutputDeviceSelect = document.getElementById('audioOutputDevice');
        if (audioOutputDeviceSelect) {
            audioOutputDeviceSelect.addEventListener('change', (e) => {
                if (e.target.value && !this.isPopulatingDevices) {
                    this.settingsManager.set('audioOutputDevice', e.target.value);
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

        // Mic status events
        socket.on('user-mic-status', ({ userId, isMuted }) => {
            this.uiManager.updateUserMicStatus(userId, isMuted);
        });

        // Chat events
        socket.on('chat-message', (data) => {
            console.log('Chat message received:', data);

            if (!this.globalChatHistory.general) {
                this.globalChatHistory.general = [];
            }

            const messageData = {
                id: data.id,
                username: data.username,
                message: data.message,
                timestamp: data.timestamp,
                userId: data.userId
            };

            this.globalChatHistory.general.push(messageData);
            this.saveGlobalChatHistory();

            this.uiManager.addChatMessage(messageData);
        });

        socket.on('message-deleted', (data) => {
            console.log('Message deleted:', data);
            const { messageId } = data;

            if (this.globalChatHistory.general) {
                this.globalChatHistory.general = this.globalChatHistory.general.filter(msg => msg.id !== messageId);
                this.saveGlobalChatHistory();
            }

            this.uiManager.removeChatMessage(messageId);
        });

        // Position events
        socket.on('position-update', ({ userId, x, y }) => {
            if (this.proximityMap) {
                this.proximityMap.updateUserPosition(userId, x, y);
            }
            if (this.miniProximityMap) {
                this.miniProximityMap.updateUserPosition(userId, x, y);
            }
        });
    }

    async joinHub() {
        try {
            console.log('Joining hub...');

            const username = this.settingsManager.get('username') || 'Anonymous';
            const userColor = this.settingsManager.get('userColor') || 'purple';

            this.connectionManager.socket.emit('join-hub', {
                username,
                userColor
            });

            this.isInHub = true;
            this.currentTextChannel = 'general';

            this.uiManager.showServerView({ id: 'hub', name: 'Proximity Room' });

            this.loadChatForCurrentChannel();

            this.updateLeaveButtonVisibility();

            this.uiManager.showNotification('Joined Proximity Room', 'success');

        } catch (error) {
            console.error('Failed to join hub:', error);
            this.uiManager.showNotification('Failed to join room', 'error');
        }
    }

    loadChatForCurrentChannel() {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = `
                <div class="welcome-message">
                    <p>Welcome to general chat!</p>
                </div>
            `;

            if (this.globalChatHistory.general) {
                this.globalChatHistory.general.forEach(msg => {
                    this.uiManager.addChatMessage(msg);
                });
            }
        }
    }

    async joinVoiceChannel(channelId) {
        if (this.currentVoiceChannel === channelId) {
            this.uiManager.showNotification('Already in this voice channel', 'info');
            return;
        }

        try {
            console.log('Joining voice channel:', channelId);

            if (!this.audioManager.isInitialized()) {
                try {
                    await this.audioManager.initialize();
                } catch (audioError) {
                    this.uiManager.showNotification(audioError.message, 'error');
                    return;
                }
            }

            if (this.currentVoiceChannel) {
                await this.leaveVoiceChannel(this.currentVoiceChannel);
            }

            this.currentVoiceChannel = channelId;

            this.connectionManager.socket.emit('join-voice-channel', { channelId });

            const username = this.settingsManager.get('username') || 'Anonymous';
            const userColor = this.settingsManager.get('userColor') || 'purple';

            this.uiManager.addVoiceParticipant(this.myUserId, username, userColor, channelId, true);

            if (this.proximityMap) {
                this.proximityMap.addUser(this.myUserId, username, true);
                this.proximityMap.updateUserColor(this.myUserId, userColor);
            }

            this.hubUsers.forEach(user => {
                if (user.userId !== this.myUserId && user.voiceChannel === channelId) {
                    this.audioManager.connectToUser(user.userId, user.username, user.userColor);
                    this.uiManager.addVoiceParticipant(user.userId, user.username, user.userColor, channelId, false);
                }
            });

            this.updateLeaveButtonVisibility();

            await this.audioManager.playJoinSound();

            this.uiManager.showNotification(`Joined voice channel`, 'success');

        } catch (error) {
            console.error('Failed to join voice channel:', error);
            this.uiManager.showNotification('Failed to join voice channel. Please allow microphone access.', 'error');
            this.currentVoiceChannel = null;
        }
    }

    async leaveVoiceChannel(channelId) {
        console.log('Leaving voice channel:', channelId);

        if (this.currentVoiceChannel === channelId) {
            try {
                await this.audioManager.playLeaveSound();
            } catch (error) {
                console.warn('Could not play leave sound:', error);
            }

            this.connectionManager.socket.emit('leave-voice-channel', { channelId });

            this.audioManager.disconnectAll();

            this.uiManager.removeVoiceParticipant(this.myUserId, channelId);

            if (this.proximityMap) {
                this.proximityMap.clearUsers();
            }
            if (this.miniProximityMap) {
                this.miniProximityMap.clearUsers();
            }

            this.currentVoiceChannel = null;

            this.uiManager.updateVoiceChannelUI(null);

            this.updateLeaveButtonVisibility();

            this.uiManager.showNotification(`Left voice channel`, 'info');
        }
    }

    updateLeaveButtonVisibility() {
        const leaveChannelBtn = document.getElementById('leaveChannelBtn');
        const mapLeaveChannelBtn = document.getElementById('mapLeaveChannelBtn');

        const shouldShow = this.currentVoiceChannel !== null;

        if (leaveChannelBtn) {
            leaveChannelBtn.style.display = shouldShow ? 'block' : 'none';
        }
        if (mapLeaveChannelBtn) {
            mapLeaveChannelBtn.style.display = shouldShow ? 'block' : 'none';
        }
    }

    handleHubUsers(users) {
        this.hubUsers = users;

        this.updateAllVoiceChannelParticipants(users);

        if (this.currentVoiceChannel) {
            if (this.proximityMap) {
                this.proximityMap.clearUsers();

                const username = this.settingsManager.get('username') || 'Anonymous';
                const userColor = this.settingsManager.get('userColor') || 'purple';
                this.proximityMap.addUser(this.myUserId, username, true);
                this.proximityMap.updateUserColor(this.myUserId, userColor);
            }

            users.forEach(user => {
                if (user.userId !== this.myUserId && user.voiceChannel === this.currentVoiceChannel) {
                    this.handleUserJoined(user);
                    this.audioManager.connectToUser(user.userId, user.username, user.userColor);
                }
            });
        }
    }

    updateAllVoiceChannelParticipants(users) {
        this.uiManager.clearVoiceParticipants();

        const usersByChannel = {};
        users.forEach(user => {
            if (user.voiceChannel) {
                if (!usersByChannel[user.voiceChannel]) {
                    usersByChannel[user.voiceChannel] = [];
                }
                usersByChannel[user.voiceChannel].push(user);
            }
        });

        Object.entries(usersByChannel).forEach(([channelId, channelUsers]) => {
            channelUsers.forEach(user => {
                this.uiManager.addVoiceParticipant(user.userId, user.username, user.userColor, channelId, false);
            });
        });

        if (this.currentVoiceChannel) {
            const username = this.settingsManager.get('username') || 'Anonymous';
            const userColor = this.settingsManager.get('userColor') || 'purple';
            this.uiManager.addVoiceParticipant(this.myUserId, username, userColor, this.currentVoiceChannel, true);
        }
    }

    handleUserJoined(user) {
        if (this.currentVoiceChannel && user.voiceChannel === this.currentVoiceChannel) {
            if (this.proximityMap) {
                this.proximityMap.addUser(user.userId, user.username, false);
                this.proximityMap.updateUserColor(user.userId, user.userColor);
            }

            this.audioManager.connectToUser(user.userId, user.username, user.userColor);
        }

        if (user.voiceChannel) {
            this.uiManager.addVoiceParticipant(user.userId, user.username, user.userColor, user.voiceChannel, false);
        }
    }

    handleUserLeft(user) {
        this.uiManager.removeVoiceParticipant(user.userId);

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
            this.isPopulatingDevices = true;
            this.uiManager.populateAudioDevices().then(() => {
                const savedInputDevice = this.settingsManager.get('audioInputDevice');
                const savedOutputDevice = this.settingsManager.get('audioOutputDevice');

                if (savedInputDevice) {
                    const inputSelect = document.getElementById('audioDevice');
                    if (inputSelect) inputSelect.value = savedInputDevice;
                }

                if (savedOutputDevice) {
                    const outputSelect = document.getElementById('audioOutputDevice');
                    if (outputSelect) outputSelect.value = savedOutputDevice;
                }

                this.isPopulatingDevices = false;
            });

            this.audioManager.startPersistentVisualizer();
        } else {
            this.audioManager.stopPersistentVisualizer();
        }
    }

    leaveCurrentChannel() {
        console.log('Leave channel called, current state:', {
            isInHub: this.isInHub,
            currentVoiceChannel: this.currentVoiceChannel
        });

        if (!this.isInHub) {
            this.uiManager.showNotification('Not in any channel', 'warning');
            return;
        }

        if (this.currentVoiceChannel) {
            console.log('Leaving voice channel...');
            this.leaveVoiceChannel(this.currentVoiceChannel);
            this.uiManager.updateVoiceChannelUI(null);
        } else {
            this.uiManager.showNotification('Not in a voice channel', 'info');
        }
    }

    updateParticipantName() {
        const newUsername = this.settingsManager.get('username') || 'Anonymous';

        if (this.currentVoiceChannel) {
            const channelKey = this.currentVoiceChannel.replace('-voice', '');
            const voiceParticipant = document.getElementById(`voice-participant-${this.myUserId}-${channelKey}`);
            if (voiceParticipant) {
                const nameSpan = voiceParticipant.querySelector('span:last-child');
                if (nameSpan) {
                    nameSpan.textContent = newUsername;
                }
            }
        }

        if (this.proximityMap && this.myUserId) {
            const user = this.proximityMap.users.get(this.myUserId);
            if (user) {
                user.username = newUsername;
            }
        }
    }

    updateParticipantColor() {
        const newColor = this.settingsManager.get('userColor');

        if (this.proximityMap && this.myUserId) {
            this.proximityMap.updateUserColor(this.myUserId, newColor);
        }

        if (this.currentVoiceChannel) {
            const channelKey = this.currentVoiceChannel.replace('-voice', '');
            const voiceParticipant = document.getElementById(`voice-participant-${this.myUserId}-${channelKey}`);
            if (voiceParticipant) {
                const avatar = voiceParticipant.querySelector('.participant-avatar');
                if (avatar) {
                    avatar.textContent = this.uiManager.getColorEmoji(newColor);
                }
            }
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
            this.uiManager.showNotification('Failed to test microphone: ' + error.message, 'error');
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
        if (this.connectionManager.socket && this.isInHub && this.currentVoiceChannel) {
            this.connectionManager.socket.emit('position-update', {
                roomId: this.currentVoiceChannel,
                x, y
            });
        }
    }

    updateMicStatus(isMuted) {
        if (this.connectionManager.socket && this.isInHub && this.currentVoiceChannel) {
            this.connectionManager.socket.emit('mic-status', {
                roomId: this.currentVoiceChannel,
                isMuted
            });
        }
    }

    // First-Time Setup Modal
    showFirstTimeSetup() {
        const modal = document.getElementById('firstTimeSetupModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    setupFirstTimeModal() {
        const requestMicBtn = document.getElementById('requestMicBtn');
        const completeSetupBtn = document.getElementById('completeSetupBtn');
        const micStatus = document.getElementById('micStatus');
        const deviceSetupStep = document.getElementById('deviceSetupStep');
        const setupMicDevice = document.getElementById('setupMicDevice');
        const setupOutputDevice = document.getElementById('setupOutputDevice');
        const setupTestMic = document.getElementById('setupTestMic');
        const setupTestOutput = document.getElementById('setupTestOutput');

        // Request microphone access
        if (requestMicBtn) {
            requestMicBtn.addEventListener('click', async () => {
                try {
                    await this.audioManager.initialize();

                    micStatus.textContent = '✓ Microphone access granted!';
                    micStatus.className = 'status-text success';

                    // Show device selection step
                    deviceSetupStep.style.display = 'block';

                    // Populate device selectors
                    await this.populateSetupDevices();

                    // Enable complete button
                    completeSetupBtn.disabled = false;

                } catch (error) {
                    micStatus.textContent = '✗ Failed to access microphone: ' + error.message;
                    micStatus.className = 'status-text error';
                }
            });
        }

        // Test buttons in setup
        if (setupTestMic) {
            setupTestMic.addEventListener('click', () => this.testMicrophone());
        }

        if (setupTestOutput) {
            setupTestOutput.addEventListener('click', () => this.testOutput());
        }

        // Complete setup
        if (completeSetupBtn) {
            completeSetupBtn.addEventListener('click', () => {
                // Save selected devices
                if (setupMicDevice.value) {
                    this.settingsManager.set('audioInputDevice', setupMicDevice.value);
                }
                if (setupOutputDevice.value) {
                    this.settingsManager.set('audioOutputDevice', setupOutputDevice.value);
                }

                // Mark setup as completed
                localStorage.setItem('proximity-setup-completed', 'true');

                // Hide modal
                const modal = document.getElementById('firstTimeSetupModal');
                if (modal) {
                    modal.style.display = 'none';
                }

                this.uiManager.showNotification('Setup complete! Welcome to Proximity!', 'success');
            });
        }
    }

    async populateSetupDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();

            const setupMicDevice = document.getElementById('setupMicDevice');
            const setupOutputDevice = document.getElementById('setupOutputDevice');

            // Clear existing options
            setupMicDevice.innerHTML = '<option value="">Select Microphone</option>';
            setupOutputDevice.innerHTML = '<option value="">Select Output Device</option>';

            devices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `${device.kind} ${device.deviceId.substring(0, 8)}`;

                if (device.kind === 'audioinput') {
                    setupMicDevice.appendChild(option.cloneNode(true));
                } else if (device.kind === 'audiooutput') {
                    setupOutputDevice.appendChild(option.cloneNode(true));
                }
            });

        } catch (error) {
            console.error('Failed to populate devices:', error);
        }
    }

    // Settings Modal
    setupSettingsModal() {
        const settingsButton = document.getElementById('settingsButton');
        const settingsModal = document.getElementById('settingsModal');
        const closeSettingsBtn = document.getElementById('closeSettingsBtn');

        if (settingsButton) {
            settingsButton.addEventListener('click', () => {
                if (settingsModal) {
                    settingsModal.style.display = 'flex';
                }
            });
        }

        if (closeSettingsBtn) {
            closeSettingsBtn.addEventListener('click', () => {
                if (settingsModal) {
                    settingsModal.style.display = 'none';
                }
            });
        }

        // Close on backdrop click
        if (settingsModal) {
            settingsModal.addEventListener('click', (e) => {
                if (e.target === settingsModal) {
                    settingsModal.style.display = 'none';
                }
            });
        }
    }

    // Status Selector
    setupStatusSelector() {
        const statusOptions = document.querySelectorAll('.status-option');

        statusOptions.forEach(option => {
            option.addEventListener('click', () => {
                // Remove active from all
                statusOptions.forEach(opt => opt.classList.remove('active'));

                // Add active to clicked
                option.classList.add('active');

                const status = option.dataset.status;
                console.log('User status changed to:', status);

                // Save to settings
                this.settingsManager.set('userStatus', status);
            });
        });
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
