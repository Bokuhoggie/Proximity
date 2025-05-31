// Updated renderer with full server system - FIXED VERSION
console.log('Updated Renderer.js starting...');

// Import audio classes and proximity map
import { AudioVisualizer, MicrophoneInput } from './audio';
import { ProximityMap } from './proximity-map';

const SERVER_URL = 'https://myserver2-production.up.railway.app';

class ProximityApp {
    constructor() {
        console.log('ProximityApp constructor called');
        this.socket = null;
        this.peerConnections = {};
        this.micInput = new MicrophoneInput();
        this.proximityMap = null;
        this.isMuted = false;
        this.isDeafened = false;
        this.currentRoom = null;
        this.currentServer = null;
        this.currentChannel = null;
        this.availableServers = [];
        this.myServers = []; // Servers I created
        this.favoriteServers = []; // Servers I favorited
        this.myUserId = null;
        this.persistentVisualizerActive = false;
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

        this.colorEmojis = {
            blue: '🔵',
            green: '🟢', 
            purple: '🟣',
            red: '🔴',
            orange: '🟠',
            pink: '🩷',
            indigo: '💜',
            cyan: '🔹'
        };

        this.initializeUI();
        this.setupEventListeners();
        this.loadSettings();
        this.loadServerData();
        this.setupMicrophoneGlow();
        this.initializeProximityMap();
        this.connectToServerDiscovery();
        console.log('ProximityApp initialized');
    }

    initializeUI() {
        console.log('Initializing UI...');
        
        // Connection status elements
        this.connectionIndicator = document.getElementById('connectionIndicator');
        this.connectionText = document.getElementById('connectionText');
        
        // Navigation elements
        this.navItems = document.querySelectorAll('.nav-item');
        this.pages = document.querySelectorAll('.page');

        // Home page elements
        this.homeCreateServerBtn = document.getElementById('homeCreateServerBtn');
        this.availableServersList = document.getElementById('availableServersList');

        // Sidebar server elements
        this.createServerBtn = document.getElementById('createServerBtn');
        this.myServersList = document.getElementById('myServersList');

        // Server creation modal elements
        this.createServerModal = document.getElementById('createServerModal');
        this.serverNameInput = document.getElementById('serverName');
        this.serverDescriptionInput = document.getElementById('serverDescription');
        this.confirmCreateServerBtn = document.getElementById('confirmCreateServer');
        this.cancelCreateServerBtn = document.getElementById('cancelCreateServer');
        this.modalClose = document.querySelector('.modal-close');

        // Server view elements
        this.currentServerNameElement = document.getElementById('currentServerName');
        this.serverInviteDisplay = document.getElementById('serverInviteDisplay');
        this.textChannelsList = document.getElementById('textChannelsList');
        this.voiceChannelsList = document.getElementById('voiceChannelsList');
        this.leaveServerBtn = document.getElementById('leaveServerBtn');

        // Chat elements
        this.chatMessages = document.getElementById('chatMessages');
        this.messageInput = document.getElementById('messageInput');
        this.sendMessageBtn = document.getElementById('sendMessageBtn');
        this.participantsList = document.getElementById('participantsList');

        // Map elements
        this.proximityMapCanvas = document.getElementById('proximityMap');
        this.proximitySlider = document.getElementById('proximitySlider');
        this.proximityRangeDisplay = document.getElementById('proximityRange');
        this.centerMapBtn = document.getElementById('centerMapBtn');
        this.toggleTestBotBtn = document.getElementById('toggleTestBot');

        // Mute button
        this.muteButton = document.getElementById('muteButton');
        this.mapMuteButton = document.getElementById('mapMuteButton');
        
        // Leave channel buttons
        this.leaveChannelBtn = document.getElementById('leaveChannelBtn');
        this.leaveChannelServerBtn = document.getElementById('leaveChannelServerBtn');

        // Settings elements
        this.audioDeviceSelect = document.getElementById('audioDevice');
        this.audioOutputDeviceSelect = document.getElementById('audioOutputDevice');
        this.audioGainSlider = document.getElementById('audioGain');
        this.noiseSupressionCheck = document.getElementById('noiseSupression');
        this.echoCancellationCheck = document.getElementById('echoCancellation');
        this.usernameInput = document.getElementById('username');
        this.userColorPicker = document.querySelectorAll('.color-option');
        this.autoJoinCheck = document.getElementById('autoJoin');
        this.testMicrophoneBtn = document.getElementById('testMicrophone');
        this.testOutputButton = document.getElementById('testOutputButton');
        this.resetSettingsBtn = document.getElementById('resetSettings');

        // Persistent visualizer elements
        this.persistentMicLevelFill = document.getElementById('persistentMicLevelFill');
        this.persistentVolumeLevel = document.getElementById('persistentVolumeLevel');
        this.micStatusText = document.getElementById('micStatusText');
        
        this.createMicTestVisualizer();
        this.createFavoriteButton();
        
        console.log('UI elements found');
    }

    createFavoriteButton() {
        // Create and add favorite button to server info section
        this.favoriteBtn = document.createElement('button');
        this.favoriteBtn.id = 'favoriteServerBtn';
        this.favoriteBtn.className = 'btn secondary favorite-btn';
        this.favoriteBtn.innerHTML = '<span class="icon">⭐</span><span class="text">Favorite</span>';
        this.favoriteBtn.onclick = () => this.toggleFavoriteServer();
        this.favoriteBtn.style.marginLeft = '1rem';
        this.favoriteBtn.style.display = 'none'; // Initially hidden
        
        // Add to server info actions section
        const serverInfoActions = document.querySelector('.server-info-actions');
        if (serverInfoActions) {
            serverInfoActions.appendChild(this.favoriteBtn);
        }
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

        // Home page server creation
        if (this.homeCreateServerBtn) {
            this.homeCreateServerBtn.addEventListener('click', () => {
                this.showCreateServerModal();
            });
        }

        // Sidebar server creation
        if (this.createServerBtn) {
            this.createServerBtn.addEventListener('click', () => {
                this.showCreateServerModal();
            });
        }

        // Create Server Modal
        if (this.confirmCreateServerBtn) {
            this.confirmCreateServerBtn.addEventListener('click', () => this.createServer());
        }

        if (this.cancelCreateServerBtn) {
            this.cancelCreateServerBtn.addEventListener('click', () => this.hideCreateServerModal());
        }

        if (this.modalClose) {
            this.modalClose.addEventListener('click', () => this.hideCreateServerModal());
        }

        // Server view controls
        if (this.leaveServerBtn) {
            this.leaveServerBtn.addEventListener('click', () => this.leaveServer());
        }

        // Chat controls
        if (this.sendMessageBtn) {
            this.sendMessageBtn.addEventListener('click', () => this.sendMessage());
        }

        if (this.messageInput) {
            this.messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendMessage();
                }
            });
        }

        // Mute button
        if (this.muteButton) {
            this.muteButton.addEventListener('click', () => this.toggleMute());
        }
        
        if (this.mapMuteButton) {
            this.mapMuteButton.addEventListener('click', () => this.toggleMute());
        }

        // Leave channel buttons
        if (this.leaveChannelBtn) {
            this.leaveChannelBtn.addEventListener('click', () => this.leaveVoiceChannel());
        }

        if (this.leaveChannelServerBtn) {
            this.leaveChannelServerBtn.addEventListener('click', () => this.leaveVoiceChannel());
        }

        // Proximity map controls
        if (this.proximitySlider) {
            this.proximitySlider.addEventListener('input', (e) => {
                const range = parseInt(e.target.value);
                this.proximityRangeDisplay.textContent = `${range}px`;
                if (this.proximityMap) {
                    this.proximityMap.setProximityRange(range);
                }
            });
        }

        if (this.centerMapBtn) {
            this.centerMapBtn.addEventListener('click', () => {
                if (this.proximityMap) {
                    this.proximityMap.centerMyPosition();
                }
            });
        }
        
        // Test bot toggle button
        if (this.toggleTestBotBtn) {
            this.toggleTestBotBtn.addEventListener('click', () => {
                if (this.proximityMap) {
                    if (this.proximityMap.testBotId) {
                        this.proximityMap.removeTestBot();
                        this.toggleTestBotBtn.innerHTML = '<span class="icon">🤖</span><span class="text">Add Test Bot</span>';
                        this.showNotification('Test bot removed', 'info');
                    } else {
                        this.proximityMap.addTestBot();
                        this.toggleTestBotBtn.innerHTML = '<span class="icon">🤖</span><span class="text">Remove Test Bot</span>';
                        this.showNotification('Test bot added - move around to test proximity!', 'success');
                    }
                }
            });
        }

        // Settings controls
        if (this.audioDeviceSelect) {
            this.audioDeviceSelect.addEventListener('change', (e) => this.changeAudioDevice(e.target.value));
        }
        if (this.audioOutputDeviceSelect) {
            this.audioOutputDeviceSelect.addEventListener('change', (e) => this.changeAudioOutputDevice(e.target.value));
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

        // User color picker
        this.userColorPicker.forEach(colorOption => {
            colorOption.addEventListener('click', (e) => {
                const selectedColor = e.target.dataset.color;
                this.userColorPicker.forEach(opt => opt.classList.remove('selected'));
                colorOption.classList.add('selected');
                this.setUserColor(selectedColor);
            });
        });

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
        
        if (this.testOutputButton) {
            this.testOutputButton.addEventListener('click', () => this.testOutput());
        }
        
        if (this.resetSettingsBtn) {
            this.resetSettingsBtn.addEventListener('click', () => this.resetSettings());
        }

        console.log('Event listeners set up complete');
    }

    connectToServerDiscovery() {
        if (typeof io === 'undefined') {
            this.showNotification('Socket.IO not loaded. Please check your internet connection.', 'error');
            return;
        }

        console.log('Connecting to server discovery:', SERVER_URL);
        this.updateConnectionStatus('connecting', 'Connecting...');
        
        this.socket = io(SERVER_URL, {
            reconnectionAttempts: 5,
            timeout: 10000,
            transports: ['websocket', 'polling']
        });

        this.socket.on('connect', () => {
            console.log('Connected to server discovery');
            this.myUserId = this.socket.id;
            this.updateConnectionStatus('online', 'Connected');
            this.showNotification('Connected to server', 'success');
        });

        this.socket.on('servers-updated', (data) => {
            console.log('Servers updated:', data.servers);
            this.availableServers = data.servers || [];
            this.updateAvailableServersList();
        });

        this.socket.on('server-created', (data) => {
            console.log('Server created response:', data);
            if (data.success) {
                // Add to my servers list
                if (!this.myServers.includes(data.server.id)) {
                    this.myServers.push(data.server.id);
                    this.saveServerData();
                }
                this.showNotification(`Server "${data.server.name}" created successfully!`, 'success');
                
                // Auto-join the created server
                setTimeout(() => {
                    this.joinServer(data.server);
                }, 1000);
            } else {
                this.showNotification('Failed to create server', 'error');
            }
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server discovery');
            this.updateConnectionStatus('offline', 'Disconnected');
            this.showNotification('Disconnected from server', 'warning');
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.updateConnectionStatus('offline', 'Error');
            this.showNotification('Failed to connect to server. Server may be down.', 'error');
        });

        this.setupVoiceEventHandlers();
    }

    setupVoiceEventHandlers() {
        this.socket.on('user-joined', ({ userId, username, userColor }) => {
            console.log('User joined:', userId, username, userColor);
            this.showNotification(`${username || 'Anonymous'} joined the channel`, 'info');
            this.connectToNewUser(userId, username, userColor);
        });

        this.socket.on('room-users', (users) => {
            console.log('Room users:', users);
            users.forEach(({ userId, username, userColor }) => {
                this.connectToNewUser(userId, username, userColor);
            });
        });

        this.socket.on('user-left', ({ userId, username }) => {
            console.log('User left:', userId, username);
            this.showNotification(`${username || 'Anonymous'} left the channel`, 'info');
            this.removePeerConnection(userId);
            
            if (this.proximityMap) {
                this.proximityMap.removeUser(userId);
            }
        });

        this.socket.on('position-update', ({ userId, x, y }) => {
            if (this.proximityMap) {
                this.proximityMap.updateRemoteUserPosition(userId, x, y);
            }
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

        this.socket.on('user-mic-status', ({ userId, isMuted }) => {
            this.updateMicStatus(userId, isMuted);
        });

        this.socket.on('chat-message', (data) => {
            console.log('Received chat message:', data);
            // Add all messages (the server will send to everyone including sender)
            this.addMessageToChat(data.username, data.message, data.timestamp);
        });

        this.socket.on('chat-message-sent', (data) => {
            console.log('Chat message sent confirmation:', data);
            if (!data.success) {
                this.showNotification('Failed to send message: ' + (data.error || 'Unknown error'), 'error');
            }
        });
    }

    updateAvailableServersList() {
        console.log('Updating available servers list:', this.availableServers);
        
        if (!this.availableServersList) {
            console.error('Available servers list element not found');
            return;
        }

        this.availableServersList.innerHTML = '';

        if (this.availableServers.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.style.cssText = `
                text-align: center;
                color: var(--text-muted);
                padding: 2rem;
                font-style: italic;
            `;
            emptyMessage.textContent = 'No servers available. Create one to get started!';
            this.availableServersList.appendChild(emptyMessage);
            return;
        }

        this.availableServers.forEach(server => {
            const serverCard = document.createElement('div');
            serverCard.className = 'server-card';
            
            const isOwned = this.myServers.includes(server.id);
            const isFavorited = this.favoriteServers.includes(server.id);
            
            if (isOwned) serverCard.classList.add('owned');
            if (isFavorited) serverCard.classList.add('favorited');
            
            serverCard.onclick = () => this.joinServer(server);

            let badges = '';
            if (isOwned) badges += '<span class="server-badge owned">👑 Owner</span>';
            if (isFavorited) badges += '<span class="server-badge favorited">⭐ Favorite</span>';

            serverCard.innerHTML = `
                <div class="server-card-badges">${badges}</div>
                <div class="server-card-header">
                    <h4 class="server-card-name">${server.name}</h4>
                    <span class="server-card-users">${server.userCount || 0} users</span>
                </div>
                <p class="server-card-description">${server.description || 'No description'}</p>
            `;

            this.availableServersList.appendChild(serverCard);
        });

        // Update sidebar as well
        this.updateSidebarServersList();
    }

    joinServer(server) {
        console.log('Joining server:', server);
        this.currentServer = server;
        
        this.clearChatMessages();
        this.switchPage('server-view');
        
        if (this.currentServerNameElement) {
            this.currentServerNameElement.textContent = server.name;
        }
        if (this.serverInviteDisplay) {
            this.serverInviteDisplay.textContent = server.id;
        }
        
        // Update favorite button
        this.updateFavoriteButton();
        
        this.setupServerChannels(server);
        this.switchToChannel('general', 'text');
        
        this.showNotification(`Joined server: ${server.name}`, 'success');
    }

    updateFavoriteButton() {
        if (!this.currentServer || !this.favoriteBtn) return;
        
        const isFavorited = this.favoriteServers.includes(this.currentServer.id);
        const isOwned = this.myServers.includes(this.currentServer.id);
        
        if (isOwned) {
            this.favoriteBtn.style.display = 'none';
        } else {
            this.favoriteBtn.style.display = 'inline-flex';
            
            if (isFavorited) {
                this.favoriteBtn.innerHTML = '<span class="icon">⭐</span><span class="text">Unfavorite</span>';
                this.favoriteBtn.classList.add('favorited');
            } else {
                this.favoriteBtn.innerHTML = '<span class="icon">☆</span><span class="text">Favorite</span>';
                this.favoriteBtn.classList.remove('favorited');
            }
        }
    }

    toggleFavoriteServer() {
        if (!this.currentServer) return;
        
        const serverId = this.currentServer.id;
        const isFavorited = this.favoriteServers.includes(serverId);
        
        if (isFavorited) {
            this.favoriteServers = this.favoriteServers.filter(id => id !== serverId);
            this.showNotification(`Removed ${this.currentServer.name} from favorites`, 'info');
        } else {
            this.favoriteServers.push(serverId);
            this.showNotification(`Added ${this.currentServer.name} to favorites`, 'success');
        }
        
        this.saveServerData();
        this.updateFavoriteButton();
        this.updateAvailableServersList();
    }

    updateSidebarServersList() {
        if (!this.myServersList) return;

        this.myServersList.innerHTML = '';

        // Add "My Servers" section
        if (this.myServers.length > 0) {
            const myServersHeader = document.createElement('div');
            myServersHeader.className = 'server-category-header';
            myServersHeader.innerHTML = '<h4 style="color: var(--success); font-size: 0.8rem; margin-bottom: 0.5rem;">MY SERVERS</h4>';
            this.myServersList.appendChild(myServersHeader);

            this.myServers.forEach(serverId => {
                const server = this.availableServers.find(s => s.id === serverId);
                if (server) {
                    this.addServerToSidebar(server, 'owned');
                }
            });
        }

        // Add "Favorite Servers" section
        if (this.favoriteServers.length > 0) {
            const favoritesHeader = document.createElement('div');
            favoritesHeader.className = 'server-category-header';
            favoritesHeader.innerHTML = '<h4 style="color: var(--warning); font-size: 0.8rem; margin: 1rem 0 0.5rem 0;">FAVORITES</h4>';
            this.myServersList.appendChild(favoritesHeader);

            this.favoriteServers.forEach(serverId => {
                const server = this.availableServers.find(s => s.id === serverId);
                if (server && !this.myServers.includes(serverId)) {
                    this.addServerToSidebar(server, 'favorited');
                }
            });
        }
    }

    addServerToSidebar(server, type) {
        const serverItem = document.createElement('div');
        serverItem.className = 'server-item';
        serverItem.onclick = () => this.joinServer(server);

        const serverIcon = document.createElement('div');
        serverIcon.className = 'server-icon';
        serverIcon.textContent = server.name.charAt(0).toUpperCase();

        const serverName = document.createElement('span');
        serverName.textContent = server.name;
        serverName.style.flex = '1';

        const badge = document.createElement('span');
        badge.style.fontSize = '0.8rem';
        badge.style.marginLeft = '0.5rem';
        if (type === 'owned') {
            badge.textContent = '👑';
            badge.title = 'Your server';
        } else if (type === 'favorited') {
            badge.textContent = '⭐';
            badge.title = 'Favorited';
        }

        serverItem.appendChild(serverIcon);
        serverItem.appendChild(serverName);
        serverItem.appendChild(badge);

        this.myServersList.appendChild(serverItem);
    }

    createServer() {
        const name = this.serverNameInput.value.trim();
        if (!name) {
            this.showNotification('Please enter a server name', 'warning');
            return;
        }

        if (!this.socket || !this.socket.connected) {
            this.showNotification('Not connected to server. Please wait...', 'error');
            return;
        }

        console.log('Creating server:', name);
        
        this.socket.emit('create-server', {
            serverName: name,
            serverDescription: this.serverDescriptionInput.value.trim()
        });

        this.hideCreateServerModal();
        this.showNotification(`Creating server "${name}"...`, 'info');
    }

    showCreateServerModal() {
        if (this.createServerModal) {
            this.createServerModal.style.display = 'flex';
            if (this.serverNameInput) {
                this.serverNameInput.focus();
            }
        }
    }

    hideCreateServerModal() {
        if (this.createServerModal) {
            this.createServerModal.style.display = 'none';
        }
        if (this.serverNameInput) {
            this.serverNameInput.value = '';
        }
        if (this.serverDescriptionInput) {
            this.serverDescriptionInput.value = '';
        }
    }

    setupServerChannels(server) {
        if (this.textChannelsList) {
            this.textChannelsList.innerHTML = '';
        }
        if (this.voiceChannelsList) {
            this.voiceChannelsList.innerHTML = '';
        }

        server.channels.forEach(channel => {
            const channelItem = document.createElement('div');
            channelItem.className = 'channel-item';
            channelItem.dataset.channelType = channel.type;
            channelItem.dataset.channelId = channel.id;
            channelItem.onclick = () => this.switchToChannel(channel.id, channel.type);

            const channelIcon = document.createElement('span');
            channelIcon.className = 'channel-icon';
            channelIcon.textContent = channel.type === 'text' ? '#' : '🔊';

            const channelName = document.createElement('span');
            channelName.className = 'channel-name';
            channelName.textContent = channel.name;

            channelItem.appendChild(channelIcon);
            channelItem.appendChild(channelName);

            if (channel.type === 'text' && this.textChannelsList) {
                this.textChannelsList.appendChild(channelItem);
            } else if (channel.type === 'voice' && this.voiceChannelsList) {
                this.voiceChannelsList.appendChild(channelItem);
            }
        });
    }

    switchToChannel(channelId, channelType) {
        console.log('Switching to channel:', channelId, channelType);
        this.currentChannel = { id: channelId, type: channelType };
        
        document.querySelectorAll('.channel-item').forEach(item => {
            item.classList.remove('active');
        });
        const activeChannel = document.querySelector(`[data-channel-id="${channelId}"]`);
        if (activeChannel) {
            activeChannel.classList.add('active');
        }
        
        document.querySelectorAll('.content-view').forEach(view => {
            view.classList.remove('active');
        });
        
        if (channelType === 'text') {
            const textView = document.getElementById('text-chat-view');
            if (textView) {
                textView.classList.add('active');
            }
        } else if (channelType === 'voice') {
            const voiceView = document.getElementById('voice-channel-view');
            if (voiceView) {
                voiceView.classList.add('active');
            }
            this.joinVoiceChannel(channelId);
        }
    }

    async joinVoiceChannel(channelId) {
        if (this.currentRoom) {
            this.showNotification('Already connected to a voice channel', 'warning');
            return;
        }

        const roomId = `${this.currentServer.id}-${channelId}`;
        
        try {
            await this.initializeMedia();
            this.connectToVoiceRoom(roomId);
            this.currentRoom = roomId;
            
            this.showNotification(`Joined voice channel`, 'success');
            this.playSound('assets/JoinNoise.mp3');
        } catch (error) {
            console.error('Error joining voice channel:', error);
            this.showNotification('Failed to join voice channel. Please allow microphone access.', 'error');
        }
    }

    connectToVoiceRoom(roomId) {
        if (!this.socket || !this.socket.connected) {
            this.showNotification('Not connected to server', 'error');
            return;
        }

        console.log('Connecting to voice room:', roomId);

        this.socket.emit('join-room', {
            roomId: roomId,
            username: this.settings.username || 'Anonymous',
            userColor: this.settings.userColor || 'purple'
        });
        
        this.addParticipant(this.socket.id, this.micInput.getStream(), true, this.settings.username || 'You', this.settings.userColor || 'purple');
        
        if (this.proximityMap) {
            this.proximityMap.addUser(this.socket.id, this.settings.username || 'You', true);
            this.proximityMap.updateUserColor(this.socket.id, this.settings.userColor || 'purple');
        }

        console.log('Successfully joined voice room:', roomId);
    }

    // Server data management
    loadServerData() {
        try {
            const savedMyServers = localStorage.getItem('proximity-my-servers');
            if (savedMyServers) {
                this.myServers = JSON.parse(savedMyServers);
            }
            
            const savedFavorites = localStorage.getItem('proximity-favorite-servers');
            if (savedFavorites) {
                this.favoriteServers = JSON.parse(savedFavorites);
            }
            
            this.updateSidebarServersList();
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

    // Essential missing methods
    createMicTestVisualizer() {
        if (!this.testMicrophoneBtn) return;
        
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

    setupMicrophoneGlow() {
        const style = document.createElement('style');
        style.textContent = `
            .mic-status.glowing {
                box-shadow: 0 0 var(--glow-size, 8px) var(--glow-color, rgba(16, 185, 129, 0.6));
                transition: box-shadow 0.1s ease;
            }
            .available-servers-list {
                display: flex;
                flex-direction: column;
                gap: 1rem;
                margin-top: 1rem;
                max-height: 300px;
                overflow-y: auto;
            }
            .server-card {
                background: var(--card-bg);
                border: 1px solid var(--border);
                border-radius: 12px;
                padding: 1.5rem;
                cursor: pointer;
                transition: all 0.3s ease;
                border-left: 4px solid transparent;
                position: relative;
            }
            .server-card:hover {
                background: rgba(139, 92, 246, 0.1);
                border-left-color: var(--accent-purple);
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(139, 92, 246, 0.2);
            }
            .server-card.favorited {
                border-left-color: var(--warning);
            }
            .server-card.owned {
                border-left-color: var(--success);
            }
            .server-card-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 0.5rem;
            }
            .server-card-name {
                font-size: 1.1rem;
                font-weight: 600;
                color: var(--text-primary);
                margin: 0;
            }
            .server-card-users {
                font-size: 0.8rem;
                color: var(--text-muted);
                background: var(--dark-bg);
                padding: 0.25rem 0.5rem;
                border-radius: 4px;
            }
            .server-card-description {
                color: var(--text-secondary);
                font-size: 0.9rem;
                margin: 0;
            }
            .server-card-badges {
                position: absolute;
                top: 0.75rem;
                right: 0.75rem;
                display: flex;
                gap: 0.25rem;
            }
            .server-badge {
                font-size: 0.8rem;
                padding: 0.2rem 0.4rem;
                border-radius: 4px;
                background: var(--dark-bg);
                color: var(--text-muted);
            }
            .server-badge.owned {
                background: var(--success);
                color: white;
            }
            .server-badge.favorited {
                background: var(--warning);
                color: white;
            }
            .servers-section {
                margin-top: 2rem;
                text-align: left;
            }
            .servers-section h3 {
                color: var(--text-secondary);
                margin-bottom: 1rem;
                font-size: 1.2rem;
            }
            .favorite-btn {
                margin-left: 0.5rem;
            }
            .favorite-btn.favorited {
                background: var(--warning);
                color: white;
            }
            .favorite-btn.favorited .icon {
                filter: drop-shadow(0 0 2px rgba(0,0,0,0.5));
            }
        `;
        document.head.appendChild(style);
    }

    initializeProximityMap() {
        if (this.proximityMapCanvas) {
            this.proximityMap = new ProximityMap(this.proximityMapCanvas, this);
            console.log('Proximity map initialized');
        }
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

        if (pageName === 'map' && this.proximityMap) {
            this.proximityMap.resizeCanvas();
        }
    }

    // Media and audio methods
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
            this.attachMicVolumeCallback();
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

    attachMicVolumeCallback() {
        this.micInput.addVolumeCallback((volume, frequencyData) => {
            this.updateMicrophoneGlow(this.socket?.id || 'self', volume);
            if (this.proximityMap && this.socket?.id) {
                if (volume > 10) {
                    this.proximityMap.setUserActivity(this.socket.id, true);
                    setTimeout(() => {
                        if (this.proximityMap) {
                            this.proximityMap.setUserActivity(this.socket.id, false);
                        }
                    }, 200);
                }
            }
        });
    }

    updateMicrophoneGlow(userId, volume) {
        const participant = document.getElementById(`participant-${userId}`);
        if (participant) {
            if (userId === (this.socket?.id || 'self')) {
                participant.className = participant.className.replace(/user-color-\w+/g, '').trim();
                participant.classList.add('user-color-' + this.settings.userColor);
            }
            const micStatus = participant.querySelector('.mic-status');
            if (micStatus && !this.isMuted) {
                let r, g, b;
                if (volume < 50) {
                    r = Math.round(245 * (volume / 50));
                    g = 185;
                    b = 11;
                } else {
                    r = 245;
                    g = Math.round(185 - (185 - 68) * ((volume - 50) / 50));
                    b = 11;
                }
                const glowColor = `rgba(${r},${g},${b},${Math.max(0.3, volume / 100)})`;
                const glowSize = 8 + (volume * 0.4);
                micStatus.style.boxShadow = `0 0 ${glowSize}px ${glowColor}`;
                micStatus.classList.add('glowing');
                if (volume < 5) {
                    micStatus.classList.remove('glowing');
                    micStatus.style.boxShadow = '';
                }
            }
        }
    }

    async populateAudioDevices() {
        if (!this.audioDeviceSelect || !this.audioOutputDeviceSelect) return;
        
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');
            const audioOutputs = devices.filter(device => device.kind === 'audiooutput');

            this.audioDeviceSelect.innerHTML = '<option value="">Select Audio Device</option>';
            this.audioOutputDeviceSelect.innerHTML = '<option value="">Select Output Device</option>';

            audioInputs.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Microphone ${index + 1}`;
                this.audioDeviceSelect.appendChild(option);
            });

            audioOutputs.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Speaker ${index + 1}`;
                this.audioOutputDeviceSelect.appendChild(option);
            });

            if (this.micInput.getStream()) {
                const currentTrack = this.micInput.getStream().getAudioTracks()[0];
                if (currentTrack && currentTrack.getSettings) {
                    const currentDeviceId = currentTrack.getSettings().deviceId;
                    this.audioDeviceSelect.value = currentDeviceId;
                }
            }
            if (this.settings.audioOutputDevice) {
                this.audioOutputDeviceSelect.value = this.settings.audioOutputDevice;
            }
        } catch (error) {
            console.error('Error populating audio devices:', error);
        }
    }

    // WebRTC methods
    async connectToNewUser(userId, username = null, userColor = 'blue') {
        console.log('=== CONNECTING TO NEW USER ===', userId, username, userColor);
        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });

        this.peerConnections[userId] = peerConnection;

        const tracks = this.micInput.getStream().getTracks();
        tracks.forEach(track => {
            peerConnection.addTrack(track, this.micInput.getStream());
        });

        peerConnection.ontrack = (event) => {
            console.log('=== RECEIVED REMOTE STREAM ===', userId, username);
            const remoteStream = event.streams[0];
            
            this.addParticipant(userId, remoteStream, false, username, userColor);
            
            if (this.proximityMap) {
                const audioElement = this.getAudioElementForUser(userId);
                this.proximityMap.addUser(userId, username || `User ${userId.slice(0, 4)}`, false, audioElement);
                this.proximityMap.updateUserColor(userId, userColor);
            }
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
        console.log('Handling offer from:', from);
        
        if (this.peerConnections[from]) {
            console.log('Connection already exists for user:', from);
            return;
        }

        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });

        this.peerConnections[from] = peerConnection;

        if (this.micInput.getStream()) {
            this.micInput.getStream().getTracks().forEach(track => {
                try {
                    peerConnection.addTrack(track, this.micInput.getStream());
                } catch (error) {
                    console.error('Error adding track in handleOffer:', error);
                }
            });
        }

        peerConnection.ontrack = (event) => {
            console.log('Received remote stream from:', from);
            this.addParticipant(from, event.streams[0], false);
            
            if (this.proximityMap) {
                const audioElement = this.getAudioElementForUser(from);
                this.proximityMap.addUser(from, `User ${from.slice(0, 4)}`, false, audioElement);
            }
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
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            this.socket.emit('answer', { target: from, answer });
        } catch (error) {
            console.error('Error handling offer from', from, ':', error);
            this.removePeerConnection(from);
        }
    }

    async handleAnswer(answer, from) {
        console.log('Handling answer from:', from);
        
        const peerConnection = this.peerConnections[from];
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
            console.error('Error handling answer from', from, ':', error);
            this.removePeerConnection(from);
        }
    }

    async handleIceCandidate(candidate, from) {
        const peerConnection = this.peerConnections[from];
        if (!peerConnection) {
            console.warn('No peer connection found for ICE candidate from:', from);
            return;
        }

        try {
            if (peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } else {
                if (!peerConnection.queuedCandidates) {
                    peerConnection.queuedCandidates = [];
                }
                peerConnection.queuedCandidates.push(candidate);
            }
        } catch (error) {
            console.error('Error handling ICE candidate from', from, ':', error);
        }
    }

    // UI methods
    addParticipant(userId, stream, isSelf = false, username = null, userColor = 'blue') {
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
        
        const avatar = document.createElement('span');
        avatar.className = 'participant-avatar';
        avatar.style.marginRight = '8px';
        avatar.style.fontSize = '16px';
        
        const name = document.createElement('span');
        let displayName;
        let displayColor;
        
        if (isSelf) {
            displayName = this.settings.username || 'You';
            displayColor = this.settings.userColor || 'purple';
            name.classList.add(this.getUserColorClass(displayColor));
        } else {
            displayName = username || `User ${userId.slice(0, 4)}`;
            displayColor = userColor || 'blue';
            name.classList.add(this.getUserColorClass(displayColor));
        }
        
        avatar.textContent = this.getUserEmoji(displayColor);
        
        name.textContent = displayName;
        name.style.fontWeight = isSelf ? 'bold' : 'normal';
        
        participant.appendChild(micStatus);
        participant.appendChild(avatar);
        participant.appendChild(name);
        
        if (!isSelf && stream) {
            const audioElement = document.createElement('audio');
            audioElement.autoplay = true;
            audioElement.srcObject = stream;
            audioElement.volume = this.isDeafened ? 0 : 1;
            audioElement.style.display = 'none';
            participant.appendChild(audioElement);
        }
        
        if (this.participantsList) {
            this.participantsList.appendChild(participant);
        }
    }

    removePeerConnection(userId) {
        console.log('Removing peer connection for:', userId);
        
        if (this.peerConnections[userId]) {
            const peerConnection = this.peerConnections[userId];
            
            peerConnection.ontrack = null;
            peerConnection.onicecandidate = null;
            peerConnection.onconnectionstatechange = null;
            peerConnection.oniceconnectionstatechange = null;
            peerConnection.onsignalingstatechange = null;
            
            try {
                peerConnection.close();
            } catch (error) {
                console.error('Error closing peer connection:', error);
            }
            
            delete this.peerConnections[userId];
        }
        
        const participantElement = document.getElementById(`participant-${userId}`);
        if (participantElement) {
            participantElement.remove();
        }
    }

    getAudioElementForUser(userId) {
        const participant = document.getElementById(`participant-${userId}`);
        if (participant) {
            return participant.querySelector('audio');
        }
        return null;
    }

    getUserEmoji(color) {
        return this.colorEmojis[color] || this.colorEmojis['purple'];
    }

    getUserColorClass(color) {
        return `user-color-${color}`;
    }

    // Settings and other utility methods
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
        if (this.audioOutputDeviceSelect) this.audioOutputDeviceSelect.value = this.settings.audioOutputDevice || '';
        
        this.userColorPicker.forEach(option => {
            option.classList.remove('selected');
        });
        const selectedColorOption = document.querySelector(`[data-color="${this.settings.userColor}"]`);
        if (selectedColorOption) {
            selectedColorOption.classList.add('selected');
        }
        
        const valueDisplay = document.querySelector('.slider-value');
        if (valueDisplay) {
            valueDisplay.textContent = `${this.settings.audioGain}%`;
        }
        
        if (this.micInput && typeof this.micInput.setGain === 'function') {
            this.micInput.setGain(this.settings.audioGain);
        }
    }

    saveSettings() {
        try {
            localStorage.setItem('proximity-settings', JSON.stringify(this.settings));
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    setUserColor(color) {
        this.settings.userColor = color;
        this.saveSettings();
        this.updateParticipantName();
        if (this.proximityMap && this.socket?.id) {
            this.proximityMap.updateUserColor(this.socket.id, color);
        }
        this.showNotification(`User color changed to ${color}`, 'success');
    }

    updateParticipantName() {
        const selfParticipant = document.getElementById(`participant-${this.socket?.id || 'self'}`);
        if (selfParticipant) {
            const nameSpan = selfParticipant.querySelector('span');
            if (nameSpan) {
                nameSpan.textContent = this.settings.username || 'You';
            }
            selfParticipant.className = selfParticipant.className.replace(/user-color-\w+/g, '').trim();
            selfParticipant.classList.add('user-color-' + this.settings.userColor);
        }
        if (this.proximityMap && this.socket?.id) {
            this.proximityMap.updateUserColor(this.socket.id, this.settings.userColor);
        }
    }

    // Voice control methods
    toggleMute() {
        if (this.micInput.getStream()) {
            this.isMuted = !this.isMuted;
            this.micInput.getStream().getAudioTracks().forEach(track => {
                track.enabled = !this.isMuted;
            });
            
            [this.muteButton, this.mapMuteButton].forEach(button => {
                if (button) {
                    button.querySelector('.text').textContent = this.isMuted ? 'Unmute' : 'Mute';
                    button.querySelector('.icon').textContent = this.isMuted ? '🔇' : '🎤';
                    button.classList.toggle('muted', this.isMuted);
                }
            });
            
            this.updateMicStatus(this.socket?.id || 'self', this.isMuted);
            
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

    leaveVoiceChannel() {
        if (!this.currentRoom) return;

        console.log('Leaving voice channel...');
        
        Object.values(this.peerConnections).forEach(pc => pc.close());
        this.peerConnections = {};

        if (this.proximityMap) {
            if (this.proximityMap.testBotId) {
                this.proximityMap.removeTestBot();
                if (this.toggleTestBotBtn) {
                    this.toggleTestBotBtn.innerHTML = '<span class="icon">🤖</span><span class="text">Add Test Bot</span>';
                }
            }
            this.proximityMap.users.clear();
            this.proximityMap.myUserId = null;
        }

        if (this.participantsList) {
            this.participantsList.innerHTML = '';
        }

        this.currentRoom = null;
        this.isMuted = false;
        this.isDeafened = false;
        
        [this.muteButton, this.mapMuteButton].forEach(button => {
            if (button) {
                button.querySelector('.text').textContent = 'Mute';
                button.querySelector('.icon').textContent = '🎤';
                button.classList.remove('muted');
            }
        });

        if (this.currentChannel && this.currentChannel.type === 'voice') {
            this.switchToChannel('general', 'text');
        }
        
        this.showNotification('Left voice channel', 'info');
        this.playSound('assets/LeaveNoise.mp3');
    }

    leaveServer() {
        console.log('Leaving server completely...');
        
        if (this.socket && this.socket.connected) {
            this.socket.disconnect();
            this.socket = null;
        }

        Object.values(this.peerConnections).forEach(pc => pc.close());
        this.peerConnections = {};

        if (this.proximityMap) {
            if (this.proximityMap.testBotId) {
                this.proximityMap.removeTestBot();
                if (this.toggleTestBotBtn) {
                    this.toggleTestBotBtn.innerHTML = '<span class="icon">🤖</span><span class="text">Add Test Bot</span>';
                }
            }
            this.proximityMap.users.clear();
            this.proximityMap.myUserId = null;
        }

        if (this.participantsList) {
            this.participantsList.innerHTML = '';
        }

        this.clearChatMessages();

        this.currentServer = null;
        this.currentChannel = null;
        this.currentRoom = null;
        this.myUserId = null;
        this.isMuted = false;
        this.isDeafened = false;
        
        [this.muteButton, this.mapMuteButton].forEach(button => {
            if (button) {
                button.querySelector('.text').textContent = 'Mute';
                button.querySelector('.icon').textContent = '🎤';
                button.classList.remove('muted');
            }
        });

        this.updateConnectionStatus('offline', 'Disconnected');
        this.switchPage('home');
        
        // Reconnect to server discovery
        this.connectToServerDiscovery();
        
        this.showNotification('Left the server', 'info');
    }

    // Chat methods
    sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message) return;

        if (!this.socket || !this.socket.connected) {
            this.showNotification('Not connected to server', 'error');
            return;
        }

        if (!this.currentRoom) {
            this.showNotification('Join a voice channel first', 'warning');
            return;
        }

        console.log('Sending message:', message, 'to room:', this.currentRoom);

        this.socket.emit('send-chat-message', {
            roomId: this.currentRoom,
            message: message,
            username: this.settings.username || 'Anonymous'
        });

        // Clear input immediately
        this.messageInput.value = '';
    }

    addMessageToChat(username, message) {
        if (!this.chatMessages) return;

        const messageElement = document.createElement('div');
        messageElement.className = 'message';

        const messageHeader = document.createElement('div');
        messageHeader.className = 'message-header';

        const author = document.createElement('span');
        author.className = 'message-author';
        author.textContent = username;

        const timestamp = document.createElement('span');
        timestamp.className = 'message-timestamp';
        timestamp.textContent = new Date().toLocaleTimeString();

        messageHeader.appendChild(author);
        messageHeader.appendChild(timestamp);

        const content = document.createElement('div');
        content.className = 'message-content';
        content.textContent = message;

        messageElement.appendChild(messageHeader);
        messageElement.appendChild(content);

        this.chatMessages.appendChild(messageElement);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    clearChatMessages() {
        if (this.chatMessages) {
            this.chatMessages.innerHTML = '';
            console.log('Chat messages cleared');
        }
    }

    // Audio control methods
    async changeAudioDevice(deviceId) {
        if (!deviceId) return;

        try {
            const wasInCall = !!this.currentRoom;
            
            await this.micInput.changeDevice(deviceId);
            
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
            this.attachMicVolumeCallback();
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

    async changeAudioOutputDevice(deviceId) {
        this.settings.audioOutputDevice = deviceId;
        this.saveSettings();
    }

    updateAudioGain(value) {
        this.settings.audioGain = parseInt(value);
        this.saveSettings();
        if (this.micInput && typeof this.micInput.setGain === 'function') {
            this.micInput.setGain(this.settings.audioGain);
        }
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

    async testOutput() {
        this.playSound('assets/TestNoise.mp3');
    }

    async playSound(filePath) {
        try {
            const audio = new Audio(filePath);
            if (this.settings.audioOutputDevice && typeof audio.setSinkId === 'function') {
                await audio.setSinkId(this.settings.audioOutputDevice);
            }
            audio.play();
        } catch (error) {
            this.showNotification('Failed to play sound', 'error');
            console.error('Error playing sound:', error);
        }
    }

    resetSettings() {
        if (confirm('Are you sure you want to reset all settings to defaults?')) {
            localStorage.removeItem('proximity-settings');
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
            this.loadSettings();
            this.showNotification('Settings reset to defaults', 'success');
        }
    }

    // Persistent visualizer methods
    async startPersistentVisualizer() {
        if (this.persistentVisualizerActive) return;

        try {
            if (!this.micInput.getStream()) {
                await this.initializeMedia();
            }
            
            this.persistentVisualizerActive = true;
            if (this.micStatusText) {
                this.micStatusText.textContent = 'Monitoring microphone...';
            }
            
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
            if (this.micStatusText) {
                this.micStatusText.textContent = 'Microphone access denied';
            }
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

    // Status and notification methods
    updateConnectionStatus(status, text) {
        if (!this.connectionIndicator || !this.connectionText) return;
        
        this.connectionIndicator.classList.remove('online', 'offline', 'connecting');
        this.connectionIndicator.classList.add(status);
        this.connectionText.textContent = text;
        
        console.log(`Connection status changed to: ${status} (${text})`);
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