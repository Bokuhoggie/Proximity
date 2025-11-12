// src/renderer/js/app.js - Simplified single-room version
import { ConnectionManager } from './core/ConnectionManager.js';
import { UIManager } from './ui/UIManager.js';
import { AudioManager } from './audio/AudioManager.js';
import { ProximityMap } from './proximity/ProximityMap.js';
import { SettingsManager } from './settings/SettingsManager.js';
import { MatrixClient } from './chat/MatrixClient.js';

// Try Railway first, fallback to localhost for development
const SERVER_URL = 'https://proximityserver-production.up.railway.app';
const FALLBACK_URL = 'https://proximityserver-production.up.railway.app';

class ProximityApp {
    constructor() {
        console.log('ProximityApp initializing...');

        // Core managers
        this.connectionManager = new ConnectionManager(SERVER_URL);
        this.uiManager = new UIManager();
        this.audioManager = new AudioManager();
        this.settingsManager = new SettingsManager();
        this.matrixClient = new MatrixClient();
        this.proximityMap = null;

        // State - simplified to single channel
        this.currentTextChannel = 'general';
        this.currentVoiceChannel = null;
        this.myUserId = null;
        this.matrixUserId = null;
        this.isInHub = false;
        this.hubUsers = [];

        this.init();
    }

    async init() {
        try {
            // Initialize settings first
            await this.settingsManager.load();

            // Save reference to background image - will be applied when map opens
            const savedBackground = this.settingsManager.get('backgroundImage');
            if (savedBackground) {
                this.savedBackgroundImage = savedBackground;

                // Show remove button and preview
                setTimeout(() => {
                    const removeBtn = document.getElementById('removeBackgroundBtn');
                    if (removeBtn) {
                        removeBtn.style.display = 'inline-block';
                    }

                    // Show saved image preview with dimensions
                    const img = new Image();
                    img.onload = () => {
                        const preview = document.getElementById('backgroundImagePreview');
                        const previewImg = document.getElementById('backgroundImagePreviewImg');
                        const dimensionsSpan = document.getElementById('backgroundImageDimensions');
                        const controls = document.getElementById('backgroundImageControls');

                        if (preview && previewImg && dimensionsSpan) {
                            previewImg.src = savedBackground;
                            dimensionsSpan.textContent = `${img.width} × ${img.height} pixels`;
                            preview.style.display = 'block';
                        }

                        if (controls) {
                            controls.style.display = 'block';
                        }
                    };
                    img.src = savedBackground;
                }, 100);
            }

            // Initialize UI
            this.uiManager.init();
            this.setupEventListeners();
            this.setupJoinHubScreen();

            // Initialize proximity map (will be created when needed in modal)
            // this.proximityMap will be created in openMapModal()

            // Setup map controls
            this.setupMapControls();

            // Setup settings controls
            this.setupSettingsControls();

            // Setup map buttons for voice channels
            this.setupMapButtons();


            // Re-enable backend connection
            await this.connectWithFallback();

            // Setup settings modal (NO STARTUP MODAL)
            this.setupSettingsModal();

        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.uiManager.showNotification('Failed to initialize app', 'error');
        }
    }

    async connectWithFallback() {
        // Show connection overlay
        this.showConnectionOverlay('Connecting to Railway server...', SERVER_URL);

        try {
            await this.connectionManager.connect();
            this.myUserId = this.connectionManager.socket.id;
            this.setupConnectionHandlers();
            this.hideConnectionOverlay();
            this.uiManager.showNotification('Connected to Railway server', 'success');
        } catch (error) {
            console.warn('Railway server failed:', error);
            this.showConnectionOverlay('Railway server unavailable', SERVER_URL, true);
        }
    }

    async connectToLocalServer() {
        this.showConnectionOverlay('Connecting to local server...', FALLBACK_URL);

        try {
            this.connectionManager = new ConnectionManager(FALLBACK_URL);
            await this.connectionManager.connect();
            this.myUserId = this.connectionManager.socket.id;
            this.setupConnectionHandlers();
            this.hideConnectionOverlay();
            this.uiManager.showNotification('Connected to local server', 'warning');
        } catch (error) {
            console.error('Local server connection failed:', error);
            this.showConnectionOverlay('Could not connect to any server', FALLBACK_URL, true);
        }
    }

    showConnectionOverlay(statusText, serverUrl, showActions = false) {
        const overlay = document.getElementById('connectionOverlay');
        const statusTextEl = document.getElementById('connectionStatusText');
        const statusDetailEl = document.getElementById('connectionStatusDetail');
        const actionsEl = document.getElementById('connectionActions');

        if (overlay && statusTextEl && statusDetailEl) {
            overlay.style.display = 'flex';
            statusTextEl.textContent = statusText;
            statusDetailEl.textContent = `Server: ${serverUrl}`;

            if (actionsEl) {
                actionsEl.style.display = showActions ? 'flex' : 'none';
            }
        }
    }

    hideConnectionOverlay() {
        const overlay = document.getElementById('connectionOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    setupJoinHubScreen() {
        const joinHubButton = document.getElementById('joinHubButton');
        const joinHubUsername = document.getElementById('joinHubUsername');
        const joinHubScreen = document.getElementById('joinHubScreen');
        const mainApp = document.getElementById('mainApp');

        // Load saved username
        const savedUsername = this.settingsManager.get('username') || '';
        if (joinHubUsername) {
            joinHubUsername.value = savedUsername;
        }

        const handleJoin = () => {
            const username = joinHubUsername.value.trim() || 'Anonymous';

            // Save username
            this.settingsManager.set('username', username);

            // Hide join screen, show main app
            if (joinHubScreen) joinHubScreen.style.display = 'none';
            if (mainApp) mainApp.style.display = 'block';

            // Join hub
            this.joinHub();
        };

        if (joinHubButton) {
            joinHubButton.addEventListener('click', handleJoin);
        }

        if (joinHubUsername) {
            joinHubUsername.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    handleJoin();
                }
            });
        }
    }

    setupEventListeners() {
        // Connection overlay buttons
        const retryBtn = document.getElementById('retryConnectionBtn');
        const useLocalBtn = document.getElementById('useLocalServerBtn');

        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                this.connectWithFallback();
            });
        }

        if (useLocalBtn) {
            useLocalBtn.addEventListener('click', () => {
                this.connectToLocalServer();
            });
        }

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

        // Create text channel button
        const createChannelBtn = document.getElementById('createTextChannelBtn');
        if (createChannelBtn) {
            createChannelBtn.addEventListener('click', () => this.createTextChannel());
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

                this.openMapModal();
            });
        });
    }

    openMapModal() {
        if (!this.currentVoiceChannel) {
            this.uiManager.showNotification('Join a voice channel first', 'warning');
            return;
        }

        const modal = document.getElementById('mapModal');
        if (modal) {
            modal.style.display = 'flex';

            // Map should already exist (created in joinVoiceChannel), just show it
            if (this.proximityMap) {
                console.log('🗺️ Showing existing proximity map');

                // Resize canvas now that modal is visible (in case it was 0x0 when created)
                this.proximityMap.resizeCanvas();

                // Apply background image if one is saved
                if (this.savedBackgroundImage) {
                    console.log('🖼️ Applying saved background image to map');
                    this.applyBackgroundImage(this.savedBackgroundImage);
                }

                // Force a render to display the map
                this.proximityMap.render();
            } else {
                console.warn('⚠️ Proximity map does not exist yet - this should not happen');
            }

            // Setup modal controls
            this.setupModalMapControls();
        }
    }

    closeMapModal() {
        const modal = document.getElementById('mapModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    setupModalMapControls() {
        const closeBtn = document.getElementById('closeMapModal');
        const proximitySlider = document.getElementById('modalProximitySlider');
        const proximityRange = document.getElementById('modalProximityRange');
        const centerBtn = document.getElementById('modalCenterBtn');
        const toggleTestBot = document.getElementById('modalToggleTestBot');

        // Close button (only set once)
        if (closeBtn && !closeBtn.hasAttribute('data-listener')) {
            closeBtn.setAttribute('data-listener', 'true');
            closeBtn.addEventListener('click', () => this.closeMapModal());
        }

        // Click outside to close
        const modal = document.getElementById('mapModal');
        if (modal && !modal.hasAttribute('data-listener')) {
            modal.setAttribute('data-listener', 'true');
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeMapModal();
                }
            });
        }

        // Proximity slider
        if (proximitySlider && proximityRange) {
            proximitySlider.value = this.proximityMap ? this.proximityMap.proximityRange : 100;
            proximityRange.textContent = `${proximitySlider.value}px`;

            proximitySlider.addEventListener('input', (e) => {
                const range = parseInt(e.target.value);
                proximityRange.textContent = `${range}px`;
                if (this.proximityMap) {
                    this.proximityMap.setProximityRange(range);
                }
                // Emit range update to server
                if (this.connectionManager.socket && this.currentVoiceChannel) {
                    this.connectionManager.socket.emit('proximity-range-update', { range });
                }
            });
        }

        // Center button
        if (centerBtn) {
            centerBtn.addEventListener('click', () => {
                if (this.proximityMap) {
                    this.proximityMap.centerMyPosition();
                }
            });
        }

        // Test bot toggle
        if (toggleTestBot) {
            toggleTestBot.addEventListener('click', () => {
                if (this.proximityMap) {
                    if (this.proximityMap.testBotId) {
                        this.proximityMap.removeTestBot();
                        toggleTestBot.innerHTML = '<span class="icon">🤖</span><span class="text">Add Test Bot</span>';
                        this.uiManager.showNotification('Test bot removed', 'info');
                    } else {
                        this.proximityMap.addTestBot();
                        toggleTestBot.innerHTML = '<span class="icon">🤖</span><span class="text">Remove Test Bot</span>';
                        this.uiManager.showNotification('Test bot added - move around to test proximity!', 'success');
                    }
                }
            });
        }
    }

    async sendChatMessage(message) {
        if (!message.trim()) return;

        if (!this.isInHub) {
            console.error('Not in hub');
            return;
        }

        console.log('💬 Sending chat message to channel:', this.currentTextChannel, message);

        try {
            // Send via Socket.IO (in-memory chat) with channel ID
            this.connectionManager.socket.emit('send-chat-message', {
                message,
                channelId: this.currentTextChannel
            });
        } catch (error) {
            console.error('❌ Failed to send message:', error);
            this.uiManager.showNotification('Failed to send message!', 'error');
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

    createTextChannel() {
        console.log('📝 Create text channel clicked');

        if (!this.isInHub) {
            this.uiManager.showNotification('Join the hub first to create channels', 'warning');
            return;
        }

        if (!this.connectionManager.socket) {
            this.uiManager.showNotification('Not connected to server', 'error');
            return;
        }

        const channelName = prompt('Enter channel name:\n(Letters, numbers, and hyphens only)');

        if (!channelName || !channelName.trim()) {
            console.log('📝 Channel creation cancelled - no name provided');
            return;
        }

        // Sanitize channel name
        const sanitizedName = channelName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');

        if (sanitizedName.length === 0) {
            this.uiManager.showNotification('Invalid channel name', 'error');
            return;
        }

        console.log('📝 Creating text channel:', sanitizedName);
        this.connectionManager.socket.emit('create-text-channel', { channelName: sanitizedName });
    }

    addTextChannelToUI(channelId, channelName) {
        const channelsList = document.getElementById('textChannelsList');
        if (!channelsList) return;

        // Check if channel already exists
        const existing = channelsList.querySelector(`[data-channel-id="${channelId}"]`);
        if (existing) return;

        const channelItem = document.createElement('div');
        channelItem.className = 'channel-item';
        channelItem.dataset.channelType = 'text';
        channelItem.dataset.channelId = channelId;
        channelItem.innerHTML = `
            <span class="channel-icon">#</span>
            <span class="channel-name">${channelName}</span>
        `;

        // Add click handler to switch channels
        channelItem.addEventListener('click', () => {
            this.switchTextChannel(channelId);
        });

        channelsList.appendChild(channelItem);
        console.log(`✅ Added text channel to UI: ${channelName}`);
    }

    switchTextChannel(channelId) {
        // Update active state
        const channelItems = document.querySelectorAll('.channel-item[data-channel-type="text"]');
        channelItems.forEach(item => {
            item.classList.toggle('active', item.dataset.channelId === channelId);
        });

        this.currentTextChannel = channelId;
        console.log(`📝 Switched to text channel: ${channelId}`);

        // Clear current messages
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = '';
        }

        // Restore local messages for this channel first
        this.restoreChatHistory(channelId);

        // Request messages from server for this channel
        if (this.connectionManager.socket) {
            this.connectionManager.socket.emit('request-channel-messages', { channelId });
        }
    }

    // Chat persistence with localStorage
    saveChatMessage(messageData) {
        try {
            const channelId = messageData.channelId || 'general';
            const messages = this.loadChatMessages(channelId);
            messages.push(messageData);

            // Keep only last 100 messages to avoid localStorage bloat
            const recentMessages = messages.slice(-100);

            localStorage.setItem(`proximity_chat_messages_${channelId}`, JSON.stringify(recentMessages));
            console.log(`💾 Saved message to localStorage for #${channelId}`);
        } catch (error) {
            console.error('Failed to save message to localStorage:', error);
        }
    }

    loadChatMessages(channelId = 'general') {
        try {
            const stored = localStorage.getItem(`proximity_chat_messages_${channelId}`);
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Failed to load messages from localStorage:', error);
            return [];
        }
    }

    clearChatMessages(channelId = 'general') {
        try {
            localStorage.removeItem(`proximity_chat_messages_${channelId}`);
            console.log(`🗑️ Cleared chat messages from localStorage for #${channelId}`);
        } catch (error) {
            console.error('Failed to clear messages:', error);
        }
    }

    restoreChatHistory(channelId = 'general') {
        const messages = this.loadChatMessages(channelId);
        console.log(`📜 Restoring ${messages.length} messages from localStorage for #${channelId}`);

        messages.forEach(messageData => {
            this.uiManager.addChatMessage(messageData);
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

        const muteWhileMovingCheck = document.getElementById('muteWhileMoving');
        if (muteWhileMovingCheck) {
            muteWhileMovingCheck.addEventListener('change', (e) => {
                this.settingsManager.set('muteWhileMoving', e.target.checked);
                // Update audio immediately if in voice channel
                if (this.proximityMap) {
                    this.proximityMap.updateAudioProximity();
                }
            });
        }

        // Background image upload
        const uploadBackgroundBtn = document.getElementById('uploadBackgroundBtn');
        const backgroundImageInput = document.getElementById('backgroundImage');
        const removeBackgroundBtn = document.getElementById('removeBackgroundBtn');

        if (uploadBackgroundBtn && backgroundImageInput) {
            uploadBackgroundBtn.addEventListener('click', () => {
                backgroundImageInput.click();
            });

            backgroundImageInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file && file.type.startsWith('image/')) {
                    console.log('📸 Processing image file:', file.name, 'Type:', file.type, 'Size:', file.size);
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const imageData = event.target.result;
                        console.log('📸 Image converted to data URL, length:', imageData.length);
                        console.log('📸 Data URL preview:', imageData.substring(0, 100) + '...');

                        // Create image object to get dimensions
                        const img = new Image();
                        img.onload = () => {
                            console.log('📸 Image dimensions:', img.width, 'x', img.height);

                            // Show preview
                            const preview = document.getElementById('backgroundImagePreview');
                            const previewImg = document.getElementById('backgroundImagePreviewImg');
                            const dimensionsSpan = document.getElementById('backgroundImageDimensions');

                            if (preview && previewImg && dimensionsSpan) {
                                previewImg.src = imageData;
                                dimensionsSpan.textContent = `${img.width} × ${img.height} pixels`;
                                preview.style.display = 'block';
                            }

                            // Show image adjustment controls
                            const controls = document.getElementById('backgroundImageControls');
                            if (controls) {
                                controls.style.display = 'block';
                            }

                            this.settingsManager.set('backgroundImage', imageData);
                            this.savedBackgroundImage = imageData;
                            this.applyBackgroundImage(imageData);
                            if (removeBackgroundBtn) {
                                removeBackgroundBtn.style.display = 'inline-block';
                            }

                            // Broadcast background to other users in voice channel
                            this.broadcastBackground(imageData);

                            this.uiManager.showNotification('Background image uploaded!', 'success');
                        };
                        img.src = imageData;
                    };
                    reader.onerror = (error) => {
                        console.error('❌ Error reading image file:', error);
                        this.uiManager.showNotification('Error reading image file', 'error');
                    };
                    reader.readAsDataURL(file);
                } else {
                    this.uiManager.showNotification('Please select a valid image file', 'error');
                }
            });
        }

        if (removeBackgroundBtn) {
            removeBackgroundBtn.addEventListener('click', () => {
                this.settingsManager.set('backgroundImage', '');
                this.savedBackgroundImage = '';
                this.applyBackgroundImage('');
                removeBackgroundBtn.style.display = 'none';

                // Hide preview and controls
                const preview = document.getElementById('backgroundImagePreview');
                const controls = document.getElementById('backgroundImageControls');
                if (preview) {
                    preview.style.display = 'none';
                }
                if (controls) {
                    controls.style.display = 'none';
                }

                if (backgroundImageInput) {
                    backgroundImageInput.value = '';
                }

                // Broadcast removal to other users
                this.broadcastBackground('');

                this.uiManager.showNotification('Background image removed', 'info');
            });
        }

        // Background image adjustment controls
        const opacitySlider = document.getElementById('backgroundOpacity');
        const opacityValue = document.getElementById('backgroundOpacityValue');
        if (opacitySlider && opacityValue) {
            // Load saved opacity
            const savedOpacity = this.settingsManager.get('backgroundOpacity') || 50;
            opacitySlider.value = savedOpacity;
            opacityValue.textContent = `${savedOpacity}%`;

            opacitySlider.addEventListener('input', (e) => {
                const value = e.target.value;
                opacityValue.textContent = `${value}%`;
                this.settingsManager.set('backgroundOpacity', value);
                this.applyBackgroundImage(this.savedBackgroundImage);
            });
        }

        // Background size buttons
        const bgSizeButtons = document.querySelectorAll('.bg-size-btn');
        const savedBgSize = this.settingsManager.get('backgroundSize') || '100% 100%';
        bgSizeButtons.forEach(btn => {
            if (btn.dataset.size === savedBgSize) {
                btn.classList.add('active');
            }
            btn.addEventListener('click', () => {
                bgSizeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.settingsManager.set('backgroundSize', btn.dataset.size);
                this.applyBackgroundImage(this.savedBackgroundImage);
            });
        });

        // Test buttons
        const testMicrophoneToggle = document.getElementById('testMicrophoneToggle');
        if (testMicrophoneToggle) {
            testMicrophoneToggle.addEventListener('click', () => this.toggleMicrophoneTest());
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
                    this.savedBackgroundImage = '';
                    this.applyBackgroundImage('');
                    const removeBtn = document.getElementById('removeBackgroundBtn');
                    if (removeBtn) {
                        removeBtn.style.display = 'none';
                    }
                    const backgroundInput = document.getElementById('backgroundImage');
                    if (backgroundInput) {
                        backgroundInput.value = '';
                    }
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

        // Voice channel events
        socket.on('voice-channel-users', (data) => {
            console.log('Voice channel users data:', data);
            // Handle new format: { users: [], myPosition: {x, y}, myProximityRange: number }
            const users = data.users || data; // Backward compatibility
            const myPosition = data.myPosition;
            const myProximityRange = data.myProximityRange;

            this.handleVoiceChannelUsers(users, myPosition, myProximityRange);
        });

        socket.on('user-joined-voice', (user) => {
            console.log('User joined voice:', user);
            this.handleUserJoinedVoice(user);
        });

        socket.on('user-left-voice', (userId) => {
            console.log('User left voice:', userId);
            this.handleUserLeftVoice(userId);
        });

        // WebRTC signaling events
        socket.on('offer', ({ offer, from }) => this.audioManager.handleOffer(offer, from));
        socket.on('answer', ({ answer, from }) => this.audioManager.handleAnswer(answer, from));
        socket.on('ice-candidate', ({ candidate, from }) => this.audioManager.handleIceCandidate(candidate, from));

        // Mic status events
        socket.on('user-mic-status', ({ userId, isMuted }) => {
            this.uiManager.updateUserMicStatus(userId, isMuted);
        });

        // Chat events (in-memory for now - Matrix coming later)
        socket.on('chat-message', (data) => {
            console.log('💬 Chat message received:', data);

            const messageData = {
                id: data.id,
                username: data.username,
                message: data.message,
                timestamp: data.timestamp,
                userId: data.userId,
                userColor: data.userColor,
                channelId: data.channelId || 'general'
            };

            // Only display message if it's for the current channel
            if (messageData.channelId === this.currentTextChannel) {
                // Save to localStorage for persistence
                this.saveChatMessage(messageData);

                this.uiManager.addChatMessage(messageData);
            }
        });

        // Receive chat history from server
        socket.on('chat-history', (messages) => {
            console.log(`📜 Received ${messages.length} messages from server`);

            // Clear existing chat UI first to prevent duplicates
            const chatMessages = document.getElementById('chatMessages');
            if (chatMessages) {
                chatMessages.innerHTML = '';
            }

            // Merge with local messages (prioritize server messages)
            const localMessages = this.loadChatMessages();
            const serverMessageIds = new Set(messages.map(m => m.id));

            // Keep local messages that aren't on server
            const uniqueLocalMessages = localMessages.filter(m => !serverMessageIds.has(m.id));

            // Combine and sort by timestamp
            const allMessages = [...messages, ...uniqueLocalMessages]
                .sort((a, b) => a.timestamp - b.timestamp)
                .slice(-100); // Keep last 100

            // Save merged history to localStorage
            localStorage.setItem('proximity_chat_messages', JSON.stringify(allMessages));

            // Display ALL messages (server + unique local)
            allMessages.forEach(messageData => {
                this.uiManager.addChatMessage(messageData);
            });
        });

        // Position events
        socket.on('position-update', ({ userId, x, y }) => {
            if (this.proximityMap) {
                this.proximityMap.updateUserPosition(userId, x, y);
            }
        });

        socket.on('proximity-range-update', ({ userId, range }) => {
            console.log(`📏 User ${userId} updated proximity range to ${range}px`);
            // Note: We don't change other users' ranges, but we could visualize it
            // For now, each user maintains their own range
        });

        // Text channel events
        socket.on('text-channel-created', ({ channelId, channelName, createdBy }) => {
            console.log(`📝 Text channel created: ${channelName} (${channelId})`);
            this.addTextChannelToUI(channelId, channelName);
            if (createdBy === socket.id) {
                this.uiManager.showNotification(`Channel #${channelName} created!`, 'success');
                this.switchTextChannel(channelId);
            }
        });

        socket.on('text-channels-list', (channels) => {
            console.log('📝 Received text channels list:', channels);
            channels.forEach(channel => {
                this.addTextChannelToUI(channel.id, channel.name);
            });
        });

        socket.on('channel-messages', ({ channelId, messages }) => {
            if (channelId === this.currentTextChannel) {
                // Merge server messages with local messages
                const localMessages = this.loadChatMessages(channelId);
                const serverMessageIds = new Set(messages.map(m => m.id));

                // Keep local messages that aren't on server
                const uniqueLocalMessages = localMessages.filter(m => !serverMessageIds.has(m.id));

                // Combine and sort by timestamp
                const allMessages = [...messages, ...uniqueLocalMessages]
                    .sort((a, b) => a.timestamp - b.timestamp);

                // Clear and display all messages
                const chatMessages = document.getElementById('chatMessages');
                if (chatMessages) {
                    chatMessages.innerHTML = '';
                }

                allMessages.forEach(msg => {
                    this.uiManager.addChatMessage(msg);
                });

                console.log(`📜 Loaded ${messages.length} server + ${uniqueLocalMessages.length} local messages for #${channelId}`);
            }
        });

        // Background image events
        socket.on('user-background-updated', ({ userId, username, hasBackground }) => {
            console.log(`🖼️ ${username} ${hasBackground ? 'added' : 'removed'} background`);
            this.updateUserBackgroundIndicator(userId, hasBackground);
        });

        socket.on('user-background-data', ({ userId, username, backgroundImage }) => {
            console.log(`🖼️ Received background from ${username}`);

            // Apply the background
            this.savedBackgroundImage = backgroundImage;
            this.settingsManager.set('backgroundImage', backgroundImage);
            this.applyBackgroundImage(backgroundImage);

            // Update preview
            const img = new Image();
            img.onload = () => {
                const preview = document.getElementById('backgroundImagePreview');
                const previewImg = document.getElementById('backgroundImagePreviewImg');
                const dimensionsSpan = document.getElementById('backgroundImageDimensions');
                const controls = document.getElementById('backgroundImageControls');
                const removeBtn = document.getElementById('removeBackgroundBtn');

                if (preview && previewImg && dimensionsSpan) {
                    previewImg.src = backgroundImage;
                    dimensionsSpan.textContent = `${img.width} × ${img.height} pixels`;
                    preview.style.display = 'block';
                }

                if (controls) {
                    controls.style.display = 'block';
                }

                if (removeBtn) {
                    removeBtn.style.display = 'inline-block';
                }
            };
            img.src = backgroundImage;

            this.uiManager.showNotification(`📸 Copied background from ${username}!`, 'success');
        });
    }

    async joinHub() {
        try {
            console.log('Joining hub...');

            const username = this.settingsManager.get('username') || 'Anonymous';
            const userColor = this.settingsManager.get('userColor') || 'purple';

            // Note: Matrix guest registration is disabled on matrix.org
            // We'll implement Matrix with proper accounts or self-hosted server later
            console.log('💬 Using in-memory chat for now (Matrix coming soon)');

            // Emit join-hub for voice/proximity features
            this.connectionManager.socket.emit('join-hub', {
                username,
                userColor
            });

            this.isInHub = true;
            this.currentTextChannel = 'general';

            this.uiManager.showServerView({ id: 'hub', name: 'Proximity Room' });

            // DON'T restore chat here - wait for server to send chat-history
            // This prevents duplicate messages
            // this.restoreChatHistory();

            this.updateLeaveButtonVisibility();

            this.uiManager.showNotification('Joined Proximity Room', 'success');

        } catch (bomboclat) {
            console.bomboclat('Failed to join hub:', bomboclat);
            this.uiManager.showNotification('Failed to join room - bomboclat!', 'bomboclat');
        }
    }

    async loadChatForCurrentChannel() {
        console.log('📜 Loading chat history from Matrix...');

        // Clear chat first
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = `
                <div class="welcome-message">
                    <p>Welcome to Proximity Chat! 🔷 Powered by Matrix</p>
                </div>
            `;
        }

        // Load Matrix chat history
        try {
            const messages = await this.matrixClient.getRoomHistory(50);
            console.log(`📜 Loaded ${messages.length} messages from Matrix`);

            messages.forEach(msg => {
                this.displayMatrixMessage(msg);
            });
        } catch (error) {
            console.error('Failed to load chat history:', error);
        }
    }

    setupMatrixEventHandlers() {
        // Handle new messages
        this.matrixClient.on('message', (msg) => {
            console.log('📨 New Matrix message:', msg);
            this.displayMatrixMessage(msg);
        });

        // Handle user joined
        this.matrixClient.on('user-joined', (data) => {
            console.log('👋 User joined Matrix room:', data.displayName);
        });

        // Handle user left
        this.matrixClient.on('user-left', (data) => {
            console.log('👋 User left Matrix room:', data.userId);
        });

        // Handle Matrix ready
        this.matrixClient.on('ready', () => {
            console.log('✅ Matrix client ready');
        });
    }

    displayMatrixMessage(msg) {
        const messageData = {
            id: msg.id,
            username: this.getDisplayNameFromUserId(msg.sender),
            message: msg.content,
            timestamp: msg.timestamp,
            userId: msg.sender,
            userColor: 'purple' // Default color for now
        };

        this.uiManager.addChatMessage(messageData);
    }

    getDisplayNameFromUserId(userId) {
        // Extract display name from Matrix user ID
        // Format: @username:homeserver.com -> username
        const match = userId.match(/@(.+?):/);
        return match ? match[1] : userId;
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

            if (this.connectionManager.socket) {
                this.connectionManager.socket.emit('join-voice-channel', { channelId });
            } else {
                console.error('Socket not available, cannot join voice channel.');
                this.uiManager.showNotification('Error: Not connected to server', 'error');
                return;
            }

            const username = this.settingsManager.get('username') || 'Anonymous';
            const userColor = this.settingsManager.get('userColor') || 'purple';

            this.uiManager.addVoiceParticipant(this.myUserId, username, userColor, channelId, true);

            // Create proximity map immediately (even if modal not open yet) for hot sync
            const canvas = document.getElementById('modalProximityMap');
            if (canvas && !this.proximityMap) {
                console.log('🗺️ Creating proximity map (hot mode)...');
                this.proximityMap = new ProximityMap(canvas, this);
                this.proximityMap.resizeCanvas();

                // Apply saved background image if any
                if (this.savedBackgroundImage) {
                    this.applyBackgroundImage(this.savedBackgroundImage);
                }
            }

            // Add current user to map (use saved position if available)
            if (this.proximityMap) {
                const initialPosition = this.savedPosition || undefined;
                this.proximityMap.addUser(this.myUserId, username, true, null, initialPosition);
                this.proximityMap.updateUserColor(this.myUserId, userColor);

                // Apply saved proximity range if available
                if (this.savedProximityRange) {
                    this.proximityMap.setProximityRange(this.savedProximityRange);
                }
            }

            // Other users will be added via 'voice-channel-users' socket event

            this.updateLeaveButtonVisibility();

            await this.audioManager.playJoinSound();

            this.uiManager.showNotification(`Joined voice channel`, 'success');

        } catch (error) {
            console.error('Failed to join voice channel:', error);
            this.uiManager.showNotification('Failed to join voice channel. Please allow microphone access.', 'error');
            this.currentVoiceChannel = null;
        }
    }

    handleVoiceChannelUsers(users, myPosition, myProximityRange) {
        console.log('Handling voice channel users:', users);
        console.log('My stored position:', myPosition);
        console.log('My stored proximity range:', myProximityRange);

        // Store our saved state to restore after map is created
        if (myPosition) {
            this.savedPosition = myPosition;
        }
        if (myProximityRange) {
            this.savedProximityRange = myProximityRange;
        }

        // Restore our position and range if we already have a map
        if (this.proximityMap && myPosition) {
            const myUser = this.proximityMap.users.get(this.myUserId);
            if (myUser) {
                console.log(`Restoring my position to:`, myPosition);
                this.proximityMap.updateUserPosition(this.myUserId, myPosition.x, myPosition.y);
            }
        }

        // Restore proximity range in UI
        if (myProximityRange) {
            const slider = document.getElementById('modalProximitySlider');
            const rangeDisplay = document.getElementById('modalProximityRange');
            if (slider) {
                slider.value = myProximityRange;
            }
            if (rangeDisplay) {
                rangeDisplay.textContent = `${myProximityRange}px`;
            }
            if (this.proximityMap) {
                this.proximityMap.setProximityRange(myProximityRange);
            }
        }

        users.forEach(user => {
            // Add user to proximity map with their position
            if (this.proximityMap && !this.proximityMap.users.has(user.id)) {
                console.log(`Adding user ${user.username} to map with position:`, user.position);
                this.proximityMap.addUser(user.id, user.username, false, null, user.position);
                this.proximityMap.updateUserColor(user.id, user.userColor);
            }

            // Setup WebRTC connection
            this.audioManager.connectToUser(user.id, user.username, user.userColor);

            // Add to voice participants UI
            this.uiManager.addVoiceParticipant(user.id, user.username, user.userColor, this.currentVoiceChannel, false);
        });
    }

    handleUserJoinedVoice(user) {
        console.log('Handling user joined voice:', user);

        // Add to proximity map with their position
        if (this.proximityMap && !this.proximityMap.users.has(user.id)) {
            console.log(`Adding newly joined user ${user.username} to map with position:`, user.position);
            this.proximityMap.addUser(user.id, user.username, false, null, user.position);
            this.proximityMap.updateUserColor(user.id, user.userColor);
        }

        // Setup WebRTC connection
        this.audioManager.connectToUser(user.id, user.username, user.userColor);

        // Add to voice participants UI
        this.uiManager.addVoiceParticipant(user.id, user.username, user.userColor, this.currentVoiceChannel, false);

        this.uiManager.showNotification(`${user.username} joined voice chat`, 'info');
    }

    handleUserLeftVoice(userId) {
        console.log('Handling user left voice:', userId);

        // Remove from proximity map
        if (this.proximityMap) {
            this.proximityMap.removeUser(userId);
        }

        // Disconnect WebRTC
        this.audioManager.disconnectFromUser(userId);

        // Remove from voice participants UI
        this.uiManager.removeVoiceParticipant(userId, this.currentVoiceChannel);
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

            // Clear ALL voice participants from UI
            this.uiManager.clearVoiceParticipants(channelId);

            // Clear and destroy proximity map
            if (this.proximityMap) {
                this.proximityMap.clearUsers();
                if (this.proximityMap.testBotMovementInterval) {
                    clearInterval(this.proximityMap.testBotMovementInterval);
                }
                this.proximityMap = null;
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

        // Check if user is in a voice channel or in the hub
        if (!this.isInHub && !this.currentVoiceChannel) {
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

    async toggleMicrophoneTest() {
        try {
            if (!this.audioManager.isInitialized()) {
                await this.audioManager.initialize();
            }

            await this.audioManager.toggleMicrophoneMonitor();

        } catch (error) {
            console.error('Error toggling microphone test:', error);
            this.uiManager.showNotification('Failed to toggle microphone test: ' + error.message, 'error');
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

    applyBackgroundImage(imageData) {
        const mapCanvas = document.getElementById('modalProximityMap');
        console.log('🖼️ applyBackgroundImage called, canvas exists:', !!mapCanvas, 'hasImage:', !!imageData);

        if (mapCanvas) {
            if (imageData) {
                // Get saved settings
                const opacity = this.settingsManager.get('backgroundOpacity') || 50;
                const bgSize = this.settingsManager.get('backgroundSize') || '100% 100%';
                const opacityDecimal = opacity / 100;

                console.log('🎨 Settings - Opacity:', opacity, '%, Size:', bgSize);

                // Create a layered background: solid color overlay + image
                // This allows us to control image opacity without affecting canvas content
                const bgColor = `rgba(15, 15, 35, ${1 - opacityDecimal})`; // Dark background with inverse opacity

                // Properly quote the URL to handle special characters and spaces
                mapCanvas.style.backgroundImage = `linear-gradient(${bgColor}, ${bgColor}), url("${imageData}")`;
                mapCanvas.style.backgroundSize = `cover, ${bgSize}`;
                mapCanvas.style.backgroundPosition = 'center, center';
                mapCanvas.style.backgroundRepeat = 'no-repeat, no-repeat';

                console.log(`✅ Applied background image (opacity: ${opacity}%, size: ${bgSize})`);
                console.log('🎨 Background style:', mapCanvas.style.backgroundImage.substring(0, 100) + '...');
            } else {
                mapCanvas.style.backgroundImage = '';
                mapCanvas.style.backgroundSize = '';
                mapCanvas.style.backgroundPosition = '';
                mapCanvas.style.backgroundRepeat = '';
                console.log('✅ Removed background image from map canvas');
            }
        } else {
            console.warn('⚠️ Map canvas not found - background will be applied when map opens');
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

    broadcastBackground(backgroundImage) {
        if (this.connectionManager.socket && this.isInHub) {
            console.log('🖼️ Broadcasting background to other users');
            this.connectionManager.socket.emit('update-background', {
                backgroundImage
            });
        }
    }

    requestUserBackground(userId) {
        if (this.connectionManager.socket) {
            console.log(`🖼️ Requesting background from user ${userId}`);
            this.connectionManager.socket.emit('request-user-background', { userId });
        }
    }

    copyUserBackground(userId, username) {
        console.log(`🖼️ Copying background from ${username}`);
        this.requestUserBackground(userId);
    }

    updateUserBackgroundIndicator(userId, hasBackground) {
        if (!this.currentVoiceChannel) return;

        const channelKey = this.currentVoiceChannel.replace('-voice', '');
        const participant = document.getElementById(`voice-participant-${userId}-${channelKey}`);

        if (participant) {
            // Check if indicator already exists
            let indicator = participant.querySelector('.background-indicator');
            let copyBtn = participant.querySelector('.copy-background-btn');

            if (hasBackground) {
                // Add indicator if it doesn't exist
                if (!indicator) {
                    indicator = document.createElement('span');
                    indicator.className = 'background-indicator';
                    indicator.textContent = '🖼️';
                    indicator.title = 'Has custom background';
                    indicator.style.cssText = 'margin-left: auto; margin-right: 4px; font-size: 0.9rem;';
                    participant.appendChild(indicator);
                }

                // Add copy button if it doesn't exist
                if (!copyBtn) {
                    copyBtn = document.createElement('button');
                    copyBtn.className = 'copy-background-btn btn-icon';
                    copyBtn.textContent = '📋';
                    copyBtn.title = 'Copy background';
                    copyBtn.style.cssText = 'padding: 2px 6px; font-size: 0.85rem; margin-left: 4px;';
                    copyBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const username = participant.querySelector('span:last-child')?.textContent || 'User';
                        this.copyUserBackground(userId, username);
                    });
                    participant.appendChild(copyBtn);
                }
            } else {
                // Remove indicator and button if they exist
                if (indicator) indicator.remove();
                if (copyBtn) copyBtn.remove();
            }
        }
    }

    // Settings - Navigate to settings page instead of modal
    setupSettingsModal() {
        const settingsButton = document.getElementById('settingsButton');
        const backFromSettings = document.getElementById('backFromSettings');

        if (settingsButton) {
            settingsButton.addEventListener('click', () => {
                // Navigate to settings page instead of opening modal
                this.uiManager.switchPage('settings');
            });
        }

        if (backFromSettings) {
            backFromSettings.addEventListener('click', () => {
                // Go back to server view
                this.uiManager.switchPage('server-view');
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
