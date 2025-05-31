// Updated renderer with full server system
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
        this.createdServers = [];
        this.myUserId = null;
        this.persistentVisualizerActive = false;
        this.settings = {
            username: '',
            userColor: 'purple', // Default color
            audioGain: 50,
            noiseSupression: true,
            echoCancellation: true,
            autoJoin: false,
            muteHotkey: 'Ctrl+M',
            deafenHotkey: 'Ctrl+D',
            audioOutputDevice: ''
        };

        this.initializeUI();
        this.setupEventListeners();
        this.loadSettings();
        this.loadServers();
        this.setupMicrophoneGlow();
        this.initializeProximityMap();
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

        // Server elements
        this.createServerBtn = document.getElementById('createServerBtn');
        this.myServersList = document.getElementById('myServersList');
        
        // Modals
        this.createJoinModal = document.getElementById('createJoinModal');
        this.createJoinClose = document.getElementById('createJoinClose');
        this.createNewServerBtn = document.getElementById('createNewServerBtn');
        this.joinExistingServerBtn = document.getElementById('joinExistingServerBtn');
        
        this.createServerModal = document.getElementById('createServerModal');
        this.serverNameInput = document.getElementById('serverName');
        this.serverDescriptionInput = document.getElementById('serverDescription');
        this.confirmCreateServerBtn = document.getElementById('confirmCreateServer');
        this.cancelCreateServerBtn = document.getElementById('cancelCreateServer');
        this.modalClose = document.querySelector('.modal-close');

        this.joinServerModal = document.getElementById('joinServerModal');
        this.joinModalClose = document.getElementById('joinModalClose');
        this.serverInviteCodeInput = document.getElementById('serverInviteCode');
        this.confirmJoinServerBtn = document.getElementById('confirmJoinServer');
        this.cancelJoinServerBtn = document.getElementById('cancelJoinServer');

        // Server view elements
        this.currentServerNameElement = document.getElementById('currentServerName');
        this.serverInviteDisplay = document.getElementById('serverInviteDisplay');
        this.copyInviteBtn = document.getElementById('copyInviteBtn');
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

        // Mute button (exists in multiple places)
        this.muteButton = document.getElementById('muteButton');
        this.mapMuteButton = document.getElementById('mapMuteButton');

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
        
        // Create mic test visualizer
        this.createMicTestVisualizer();
        
        console.log('UI elements found');
    }

    initializeProximityMap() {
        if (this.proximityMapCanvas) {
            this.proximityMap = new ProximityMap(this.proximityMapCanvas, this);
            console.log('Proximity map initialized');
        }
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

        // Home page controls
        if (this.homeCreateServerBtn) {
            this.homeCreateServerBtn.addEventListener('click', () => {
                this.hideCreateJoinModal();
                this.showCreateServerModal();
            });
        }

        if (this.homeJoinServerBtn) {
            this.homeJoinServerBtn.addEventListener('click', () => {
                this.hideCreateJoinModal();
                this.showJoinServerModal();
            });
        }

        // Server controls
        if (this.createServerBtn) {
            this.createServerBtn.addEventListener('click', () => this.showCreateJoinModal());
        }

        // Create/Join Modal
        if (this.createJoinClose) {
            this.createJoinClose.addEventListener('click', () => this.hideCreateJoinModal());
        }

        if (this.createNewServerBtn) {
            this.createNewServerBtn.addEventListener('click', () => {
                this.hideCreateJoinModal();
                this.showCreateServerModal();
            });
        }

        if (this.joinExistingServerBtn) {
            this.joinExistingServerBtn.addEventListener('click', () => {
                this.hideCreateJoinModal();
                this.showJoinServerModal();
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

        // Join Server Modal
        if (this.confirmJoinServerBtn) {
            this.confirmJoinServerBtn.addEventListener('click', () => this.joinServerByCode());
        }

        if (this.cancelJoinServerBtn) {
            this.cancelJoinServerBtn.addEventListener('click', () => this.hideJoinServerModal());
        }

        if (this.joinModalClose) {
            this.joinModalClose.addEventListener('click', () => this.hideJoinServerModal());
        }

        if (this.serverInviteCodeInput) {
            this.serverInviteCodeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.joinServerByCode();
                }
            });
        }

        // Server view controls
        if (this.copyInviteBtn) {
            this.copyInviteBtn.addEventListener('click', () => this.copyInviteCode());
        }

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
                        // Remove test bot
                        this.proximityMap.removeTestBot();
                        this.toggleTestBotBtn.innerHTML = '<span class="icon">🤖</span><span class="text">Add Test Bot</span>';
                        this.showNotification('Test bot removed', 'info');
                    } else {
                        // Add test bot
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
                // Remove 'selected' from all, add to clicked
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

    // Server Management
    showCreateJoinModal() {
        this.createJoinModal.style.display = 'flex';
    }

    hideCreateJoinModal() {
        this.createJoinModal.style.display = 'none';
    }

    showCreateServerModal() {
        this.createServerModal.style.display = 'flex';
        this.serverNameInput.focus();
    }

    hideCreateServerModal() {
        this.createServerModal.style.display = 'none';
        this.serverNameInput.value = '';
        this.serverDescriptionInput.value = '';
    }

    showJoinServerModal() {
        this.joinServerModal.style.display = 'flex';
        this.serverInviteCodeInput.focus();
    }

    hideJoinServerModal() {
        this.joinServerModal.style.display = 'none';
        this.serverInviteCodeInput.value = '';
    }

    createServer() {
        const name = this.serverNameInput.value.trim();
        if (!name) {
            this.showNotification('Please enter a server name', 'warning');
            return;
        }

        const server = {
            id: this.generateRoomCode(),
            name: name,
            description: this.serverDescriptionInput.value.trim(),
            created: new Date(),
            channels: [
                { id: 'general', name: 'general', type: 'text' },
                { id: 'general-voice', name: 'General Voice', type: 'voice' }
            ],
            owner: this.settings.username || 'Anonymous'
        };

        this.createdServers.push(server);
        this.saveServers();
        this.updateServersList();
        this.hideCreateServerModal();
        this.showNotification(`Server "${name}" created! Invite code: ${server.id}`, 'success');
    }

    joinServerByCode() {
        const inviteCode = this.serverInviteCodeInput.value.trim().toUpperCase();
        if (!inviteCode) {
            this.showNotification('Please enter an invite code', 'warning');
            return;
        }

        // For now, create a dummy server entry
        const server = {
            id: inviteCode,
            name: `Server ${inviteCode}`,
            description: 'Joined server',
            channels: [
                { id: 'general', name: 'general', type: 'text' },
                { id: 'general-voice', name: 'General Voice', type: 'voice' }
            ],
            owner: 'Unknown',
            isJoined: true
        };

        this.selectServer(server);
        this.hideJoinServerModal();
    }

    deleteServer(serverId) {
        if (confirm('Are you sure you want to delete this server?')) {
            this.createdServers = this.createdServers.filter(s => s.id !== serverId);
            this.saveServers();
            this.updateServersList();
            this.showNotification('Server deleted', 'info');
        }
    }

    updateServersList() {
        if (!this.myServersList) return;

        this.myServersList.innerHTML = '';

        this.createdServers.forEach(server => {
            const serverItem = document.createElement('div');
            serverItem.className = 'server-item';
            serverItem.onclick = () => this.selectServer(server);

            const serverIcon = document.createElement('div');
            serverIcon.className = 'server-icon';
            serverIcon.textContent = server.name.charAt(0).toUpperCase();

            const serverName = document.createElement('span');
            serverName.textContent = server.name;
            serverName.style.flex = '1';

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '×';
            deleteBtn.style.cssText = `
                background: none;
                border: none;
                color: var(--text-muted);
                cursor: pointer;
                padding: 0.25rem;
                border-radius: 3px;
                font-size: 1.2rem;
                line-height: 1;
            `;
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                this.deleteServer(server.id);
            };
            deleteBtn.onmouseover = () => deleteBtn.style.background = 'rgba(239, 68, 68, 0.2)';
            deleteBtn.onmouseout = () => deleteBtn.style.background = 'none';

            serverItem.appendChild(serverIcon);
            serverItem.appendChild(serverName);
            serverItem.appendChild(deleteBtn);

            this.myServersList.appendChild(serverItem);
        });

        // Update recent servers on home page
        this.updateRecentServers();
    }

    updateRecentServers() {
        if (!this.recentServersList || !this.recentServersSection) return;

        if (this.createdServers.length === 0) {
            this.recentServersSection.style.display = 'none';
            return;
        }

        this.recentServersSection.style.display = 'block';
        this.recentServersList.innerHTML = '';

        // Show up to 3 most recent servers
        const recentServers = this.createdServers.slice(-3).reverse();

        recentServers.forEach(server => {
            const serverItem = document.createElement('div');
            serverItem.className = 'recent-server-item';
            serverItem.onclick = () => this.selectServer(server);

            const serverIcon = document.createElement('div');
            serverIcon.className = 'recent-server-icon';
            serverIcon.textContent = server.name.charAt(0).toUpperCase();

            const serverInfo = document.createElement('div');
            serverInfo.className = 'recent-server-info';
            serverInfo.innerHTML = `
                <h4>${server.name}</h4>
                <p>Created ${new Date(server.created).toLocaleDateString()}</p>
            `;

            serverItem.appendChild(serverIcon);
            serverItem.appendChild(serverInfo);

            this.recentServersList.appendChild(serverItem);
        });
    }

    selectServer(server) {
        console.log('Selecting server:', server);
        // Do NOT disconnect from voice or server when clicking a server in the list
        this.currentServer = server;
        
        // Update UI to show server selection
        document.querySelectorAll('.server-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Switch to server view page
        this.switchPage('server-view');
        
        // Update server info
        if (this.currentServerNameElement) {
            this.currentServerNameElement.textContent = server.name;
        }
        if (this.serverInviteDisplay) {
            this.serverInviteDisplay.textContent = server.id;
        }
        
        // Setup channels
        this.setupServerChannels(server);
        
        // Show text chat by default
        this.switchToChannel('general', 'text');
        
        this.showNotification(`Joined server: ${server.name}`, 'success');
    }

    setupServerChannels(server) {
        // Clear existing channels
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
        // Update active channel
        document.querySelectorAll('.channel-item').forEach(item => {
            item.classList.remove('active');
        });
        const activeChannel = document.querySelector(`[data-channel-id="${channelId}"]`);
        if (activeChannel) {
            activeChannel.classList.add('active');
        }
        // Show appropriate content view
        document.querySelectorAll('.content-view').forEach(view => {
            view.classList.remove('active');
        });
        if (channelType === 'text') {
            const textView = document.getElementById('text-chat-view');
            if (textView) {
                textView.classList.add('active');
            }
            // Do NOT leave voice channel automatically
        } else if (channelType === 'voice') {
            const voiceView = document.getElementById('voice-channel-view');
            if (voiceView) {
                voiceView.classList.add('active');
            }
            // Join voice channel
            this.joinVoiceChannel(channelId);
        }
    }

    leaveVoiceChannel() {
        if (!this.currentRoom) return;

        console.log('Leaving voice channel...');
        
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        Object.values(this.peerConnections).forEach(pc => pc.close());
        this.peerConnections = {};

        // Clear proximity map and remove test bot if exists
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

        // Clear participants list
        if (this.participantsList) {
            this.participantsList.innerHTML = '';
        }

        this.currentRoom = null;
        this.isMuted = false;
        this.isDeafened = false;
        
        // Reset mute buttons
        [this.muteButton, this.mapMuteButton].forEach(button => {
            if (button) {
                button.querySelector('.text').textContent = 'Mute';
                button.querySelector('.icon').textContent = '🎤';
                button.classList.remove('muted');
            }
        });
        
        this.showNotification('Left voice channel', 'info');
        this.playSound('assets/LeaveNoise.mp3');
    }

    async joinVoiceChannel(channelId) {
        // Prevent joining if already in a voice channel
        if (this.currentRoom) {
            this.showNotification('Already connected to a voice channel', 'warning');
            return;
        }

        const roomId = `${this.currentServer.id}-${channelId}`;
        
        try {
            await this.initializeMedia();
            this.connectToSignalingServer(roomId);
            this.currentRoom = roomId;
            
            this.showNotification(`Joined voice channel`, 'success');
            this.playSound('assets/JoinNoise.mp3');
        } catch (error) {
            console.error('Error joining voice channel:', error);
            this.showNotification('Failed to join voice channel. Please allow microphone access.', 'error');
        }
    }

    copyInviteCode() {
        if (this.currentServer) {
            navigator.clipboard.writeText(this.currentServer.id).then(() => {
                this.showNotification('Invite code copied to clipboard!', 'success');
            }).catch(() => {
                this.showNotification('Failed to copy invite code', 'error');
            });
        }
    }

    leaveServer() {
        // Leave voice channel first if connected
        if (this.currentRoom) {
            this.leaveVoiceChannel();
        }

        this.currentServer = null;
        this.currentChannel = null;
        
        // Switch back to home page
        this.switchPage('home');
        
        this.showNotification('Left the server', 'info');
    }

    sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message) return;

        // Add message to chat
        this.addMessageToChat(this.settings.username || 'You', message);
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

    loadServers() {
        try {
            const savedServers = localStorage.getItem('proximity-servers');
            if (savedServers) {
                this.createdServers = JSON.parse(savedServers);
                this.updateServersList();
            }
        } catch (error) {
            console.error('Error loading servers:', error);
        }
    }

    saveServers() {
        try {
            localStorage.setItem('proximity-servers', JSON.stringify(this.createdServers));
        } catch (error) {
            console.error('Error saving servers:', error);
        }
    }

    generateRoomCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
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

    setUserColor(color) {
        this.settings.userColor = color;
        this.saveSettings();
        // Update color picker UI
        this.userColorPicker.forEach(option => {
            option.classList.remove('selected');
        });
        const selectedOption = document.querySelector(`[data-color="${color}"]`);
        if (selectedOption) selectedOption.classList.add('selected');
        // Update participant display color immediately
        this.updateParticipantName();
        // Update map icon color
        if (this.proximityMap && this.myUserId) {
            this.proximityMap.updateUserColor(this.myUserId, color);
        }
        this.showNotification(`User color changed to ${color}`, 'success');
    }

    getUserColorClass(color) {
        return `user-color-${color}`;
    }

    getServerIconColorClass(color) {
        return `server-icon-${color}`;
    }

    updateParticipantName() {
        const selfParticipant = document.getElementById(`participant-${this.myUserId || 'self'}`);
        if (selfParticipant) {
            const nameSpan = selfParticipant.querySelector('span');
            if (nameSpan) {
                nameSpan.textContent = this.settings.username || 'You';
            }
            // Remove all user-color-* classes
            selfParticipant.className = selfParticipant.className.replace(/user-color-\w+/g, '').trim();
            // Add the current color class
            selfParticipant.classList.add('user-color-' + this.settings.userColor);
        }
        // Update map icon color if needed
        if (this.proximityMap && this.myUserId) {
            this.proximityMap.updateUserColor(this.myUserId, this.settings.userColor);
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
        if (this.audioOutputDeviceSelect) this.audioOutputDeviceSelect.value = this.settings.audioOutputDevice || '';
        // Load user color
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
        // Set gain after loading settings
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

    connectToSignalingServer(roomId) {
        if (typeof io === 'undefined') {
            this.showNotification('Socket.IO not loaded. Please check your internet connection.', 'error');
            return;
        }

        // Prevent multiple connections to the same room
        if (this.socket && this.currentRoom === roomId) {
            console.log('Already connected to this room');
            return;
        }

        // Disconnect from previous room if exists
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        console.log('Connecting to signaling server:', SERVER_URL);
        this.showNotification(`Connecting to server...`, 'info');
        
        // Update connection status
        this.updateConnectionStatus('connecting', 'Connecting...');
        
        this.socket = io(SERVER_URL, {
            reconnectionAttempts: 5,
            timeout: 10000,
            transports: ['websocket', 'polling']
        });

        this.socket.on('connect', () => {
            console.log('Connected to signaling server');
            this.myUserId = this.socket.id;
            
            // Update connection status
            this.updateConnectionStatus('online', 'Connected');
            
            this.socket.emit('join-room', {
                roomId: roomId,
                username: this.settings.username || 'Anonymous'
            });
            
            this.addParticipant(this.myUserId, this.micInput.getStream(), true);
            
            if (this.proximityMap) {
                this.proximityMap.addUser(this.myUserId, this.settings.username || 'You', true);
                this.proximityMap.updateUserColor(this.myUserId, this.settings.userColor || 'purple');
            }
        });

        this.socket.on('user-joined', ({ userId, username }) => {
            console.log('User joined:', userId, username);
            this.showNotification(`${username || 'Anonymous'} joined the channel`, 'info');
            this.connectToNewUser(userId, username);
        });

        this.socket.on('room-users', (users) => {
            console.log('Room users:', users);
            users.forEach(({ userId, username }) => {
                this.connectToNewUser(userId, username);
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

        this.socket.on('disconnect', () => {
            console.log('Disconnected from signaling server');
            this.updateConnectionStatus('offline', 'Disconnected');
            this.showNotification('Disconnected from server', 'warning');
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.updateConnectionStatus('offline', 'Error');
            this.showNotification('Failed to connect to server. Server may be down.', 'error');
        });
    }

    // Helper to get color for a remote user (future: sync from server)
    getRemoteUserColor(userId) {
        // TODO: In the future, get color from server/user profile
        return 'blue';
    }

    async connectToNewUser(userId, username = null) {
        console.log('=== CONNECTING TO NEW USER ===', userId, username);
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
            
            this.addParticipant(userId, remoteStream, false, username);
            
            if (this.proximityMap) {
                const audioElement = this.getAudioElementForUser(userId);
                const color = this.getRemoteUserColor(userId);
                this.proximityMap.addUser(userId, username || `User ${userId.slice(0, 4)}`, false, audioElement);
                this.proximityMap.updateUserColor(userId, color);
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

    getAudioElementForUser(userId) {
        const participant = document.getElementById(`participant-${userId}`);
        if (participant) {
            return participant.querySelector('audio');
        }
        return null;
    }

    async handleOffer(offer, from) {
        console.log('Handling offer from:', from);
        
        // Check if connection already exists
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

        // Add connection state monitoring
        peerConnection.onconnectionstatechange = () => {
            console.log(`Answer - Connection state with ${from}:`, peerConnection.connectionState);
            if (peerConnection.connectionState === 'failed') {
                console.log('Answer - Connection failed, cleaning up:', from);
                this.removePeerConnection(from);
            }
        };

        // Add tracks if available
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
                console.log('Sending ICE candidate from answer to:', from);
                this.socket.emit('ice-candidate', {
                    target: from,
                    candidate: event.candidate
                });
            }
        };

        try {
            console.log('Setting remote description for offer from:', from);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            
            console.log('Creating answer for:', from);
            const answer = await peerConnection.createAnswer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: false
            });
            
            console.log('Setting local description for answer to:', from);
            await peerConnection.setLocalDescription(answer);
            
            console.log('Sending answer to:', from);
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
            console.log('Current signaling state:', peerConnection.signalingState);
            
            // Check if we're in the right state to set remote description
            if (peerConnection.signalingState === 'have-local-offer') {
                console.log('Setting remote description for answer from:', from);
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                console.log('Successfully set remote description for:', from);
            } else {
                console.warn(`Cannot set remote answer in state: ${peerConnection.signalingState} for user: ${from}`);
                
                // If we're in stable state, it might mean the connection was already established
                if (peerConnection.signalingState === 'stable') {
                    console.log('Connection already in stable state, ignoring duplicate answer');
                    return;
                }
                
                // For other states, we might need to recreate the connection
                console.log('Removing problematic connection and will recreate on next offer');
                this.removePeerConnection(from);
            }
        } catch (error) {
            console.error('Error handling answer from', from, ':', error);
            console.log('Removing failed connection:', from);
            this.removePeerConnection(from);
        }
    }

    async handleIceCandidate(candidate, from) {
        console.log('Handling ICE candidate from:', from);
        
        const peerConnection = this.peerConnections[from];
        if (!peerConnection) {
            console.warn('No peer connection found for ICE candidate from:', from);
            return;
        }

        try {
            // Check if remote description is set before adding ICE candidate
            if (peerConnection.remoteDescription) {
                console.log('Adding ICE candidate from:', from);
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('Successfully added ICE candidate from:', from);
            } else {
                console.warn('Remote description not set, queueing ICE candidate for:', from);
                // Queue the candidate for later
                if (!peerConnection.queuedCandidates) {
                    peerConnection.queuedCandidates = [];
                }
                peerConnection.queuedCandidates.push(candidate);
            }
        } catch (error) {
            console.error('Error handling ICE candidate from', from, ':', error);
        }
    }

    // Attach mic volume callback for map glow and activity
    attachMicVolumeCallback() {
        this.micInput.addVolumeCallback((volume, frequencyData) => {
            this.updateMicrophoneGlow(this.myUserId || 'self', volume);
            if (this.proximityMap && this.myUserId) {
                if (volume > 10) {
                    this.proximityMap.setUserActivity(this.myUserId, true);
                    setTimeout(() => {
                        if (this.proximityMap) {
                            this.proximityMap.setUserActivity(this.myUserId, false);
                        }
                    }, 200);
                }
            }
        });
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

    updateMicrophoneGlow(userId, volume) {
        const participant = document.getElementById(`participant-${userId}`);
        if (participant) {
            if (userId === (this.myUserId || 'self')) {
                participant.className = participant.className.replace(/user-color-\w+/g, '').trim();
                participant.classList.add('user-color-' + this.settings.userColor);
            }
            const micStatus = participant.querySelector('.mic-status');
            if (micStatus && !this.isMuted) {
                // Color gradient: green (0) -> yellow (50) -> red (100)
                let r, g, b;
                if (volume < 50) {
                    // Green to yellow
                    r = Math.round(245 * (volume / 50));
                    g = 185;
                    b = 11;
                } else {
                    // Yellow to red
                    r = 245;
                    g = Math.round(185 - (185 - 68) * ((volume - 50) / 50));
                    b = 11;
                }
                const glowColor = `rgba(${r},${g},${b},${Math.max(0.3, volume / 100)})`;
                const glowSize = 8 + (volume * 0.4); // up to 48px
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

    addParticipant(userId, stream, isSelf = false, username = null) {
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
        let displayName;
        
        if (isSelf) {
            displayName = this.settings.username || 'You';
            name.classList.add(this.getUserColorClass(this.settings.userColor));
        } else {
            displayName = username || `User ${userId.slice(0, 4)}`;
            // For now, give other users a default color (could be expanded to sync colors)
            name.classList.add('user-color-blue');
        }
        
        name.textContent = displayName;
        name.style.fontWeight = isSelf ? 'bold' : 'normal';
        
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
        console.log('Removing peer connection for:', userId);
        
        if (this.peerConnections[userId]) {
            const peerConnection = this.peerConnections[userId];
            
            // Clean up event listeners to prevent memory leaks
            peerConnection.ontrack = null;
            peerConnection.onicecandidate = null;
            peerConnection.onconnectionstatechange = null;
            peerConnection.oniceconnectionstatechange = null;
            peerConnection.onsignalingstatechange = null;
            
            // Close the connection
            try {
                peerConnection.close();
            } catch (error) {
                console.error('Error closing peer connection:', error);
            }
            
            delete this.peerConnections[userId];
            console.log('Peer connection removed for:', userId);
        }
        
        const participantElement = document.getElementById(`participant-${userId}`);
        if (participantElement) {
            participantElement.remove();
            console.log('Participant element removed for:', userId);
        }
    }

    toggleMute() {
        if (this.micInput.getStream()) {
            this.isMuted = !this.isMuted;
            this.micInput.getStream().getAudioTracks().forEach(track => {
                track.enabled = !this.isMuted;
            });
            
            // Update both mute buttons
            [this.muteButton, this.mapMuteButton].forEach(button => {
                if (button) {
                    button.querySelector('.text').textContent = this.isMuted ? 'Unmute' : 'Mute';
                    button.querySelector('.icon').textContent = this.isMuted ? '🔇' : '🎤';
                    button.classList.toggle('muted', this.isMuted);
                }
            });
            
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

    updateConnectionStatus(status, text) {
        if (!this.connectionIndicator || !this.connectionText) return;
        
        // Clear all existing classes
        this.connectionIndicator.classList.remove('online', 'offline', 'connecting');
        
        // Add the new status class
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