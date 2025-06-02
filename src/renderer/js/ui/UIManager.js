// src/renderer/js/ui/UIManager.js - Updated with chat message delete and improved functionality
export class UIManager {
    constructor() {
        this.eventHandlers = {};
        this.elements = {};
        this.currentVoiceChannel = null;
        this.currentTextChannel = 'diamond';
    }

    init() {
        this.cacheElements();
        this.setupEventListeners();
        this.addHubToServers();
        this.setupHomePageEvents();
        this.setupChannelHandlers();
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
        this.elements.participantsList = document.getElementById('participantsList');
        
        // Chat
        this.elements.chatMessages = document.getElementById('chatMessages');
        this.elements.messageInput = document.getElementById('messageInput');
        this.elements.sendMessageBtn = document.getElementById('sendMessageBtn');
        this.elements.currentChannelName = document.getElementById('currentChannelName');
        this.elements.currentChannelDescription = document.getElementById('currentChannelDescription');
        
        // Voice controls
        this.elements.muteButton = document.getElementById('muteButton');
        this.elements.mapMuteButton = document.getElementById('mapMuteButton');
        this.elements.leaveChannelBtn = document.getElementById('leaveChannelBtn');
        
        // Audio devices
        this.elements.audioDeviceSelect = document.getElementById('audioDevice');
        this.elements.audioOutputDeviceSelect = document.getElementById('audioOutputDevice');
        
        // Home page elements
        this.elements.joinHubBtn = document.getElementById('joinHubBtn');
        
        // Channel lists
        this.elements.textChannelsList = document.getElementById('textChannelsList');
        this.elements.voiceChannelsList = document.getElementById('voiceChannelsList');
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

        // Chat - Single event listener setup
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

        // Leave button - single event listener
        if (this.elements.leaveChannelBtn) {
            this.elements.leaveChannelBtn.addEventListener('click', () => {
                console.log('Leave button clicked in UI');
                this.emit('leave-channel');
            });
        }
    }

    setupChannelHandlers() {
        // Text channel handlers
        const textChannels = document.querySelectorAll('[data-channel-type="text"]');
        textChannels.forEach(channel => {
            channel.addEventListener('click', () => {
                const channelId = channel.dataset.channelId;
                this.switchToTextChannel(channelId);
            });
        });

        // Voice channel handlers
        const voiceChannelHeaders = document.querySelectorAll('.voice-channel-header');
        voiceChannelHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const channelData = header.closest('.voice-channel').dataset;
                const channelId = channelData.channelId;
                this.toggleVoiceChannel(channelId);
            });
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

    addHubToServers() {
        // Add Community Hub to My Servers section
        const myServersList = document.getElementById('myServersList');
        if (myServersList) {
            const hubServer = document.createElement('div');
            hubServer.className = 'server-item';
            hubServer.dataset.serverId = 'hub';
            hubServer.innerHTML = `
                <div class="server-icon">🏢</div>
                <span class="server-name">Community Hub</span>
            `;
            
            hubServer.addEventListener('click', () => {
                console.log('Server hub button clicked');
                this.switchPage('server-view');
                this.emit('join-hub');
            });
            
            myServersList.appendChild(hubServer);
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
            document.getElementById('server-view-page').classList.add('active');
        }
    }

    showServerView(server) {
        this.switchPage('server-view');
        
        if (this.elements.currentServerName) {
            this.elements.currentServerName.textContent = server.name;
        }

        // Set up hub channels if it's the hub
        if (server.id === 'hub') {
            this.setupHubChannels();
        }
    }

    setupHubChannels() {
        // Start in diamond text channel
        this.switchToTextChannel('diamond');
        this.currentVoiceChannel = null;
    }

    switchToTextChannel(channelId) {
        console.log('Switching to text channel:', channelId);
        
        this.currentTextChannel = channelId;
        
        // Update text channel selection
        const textChannels = document.querySelectorAll('[data-channel-type="text"]');
        textChannels.forEach(channel => {
            channel.classList.toggle('active', channel.dataset.channelId === channelId);
        });
        
        // Update chat UI
        const channelNames = {
            diamond: { name: '💎 diamond', desc: 'Welcome to the diamond chat' },
            spade: { name: '♠️ spade', desc: 'Welcome to the spade chat' },
            club: { name: '♣️ club', desc: 'Welcome to the club chat' },
            heart: { name: '♥️ heart', desc: 'Welcome to the heart chat' }
        };
        
        const channelInfo = channelNames[channelId] || channelNames.diamond;
        
        if (this.elements.currentChannelName) {
            this.elements.currentChannelName.textContent = `# ${channelId}`;
        }
        if (this.elements.currentChannelDescription) {
            this.elements.currentChannelDescription.textContent = channelInfo.desc;
        }
        if (this.elements.messageInput) {
            this.elements.messageInput.placeholder = `Message #${channelId}`;
        }
        
        // Show text chat view
        this.switchToContentView('text-chat-view');
        
        // Emit channel change
        this.emit('text-channel-change', channelId);
    }

    toggleVoiceChannel(channelId) {
        console.log('Toggle voice channel:', channelId, 'Current:', this.currentVoiceChannel);
        
        if (this.currentVoiceChannel === channelId) {
            // Already in this voice channel, do nothing
            this.showNotification('Already in this voice channel', 'info');
            return;
        }
        
        // Leave current voice channel if in one
        if (this.currentVoiceChannel) {
            this.emit('leave-voice-channel', this.currentVoiceChannel);
        }
        
        // Join new voice channel
        this.currentVoiceChannel = channelId;
        this.emit('join-voice-channel', channelId);
        
        // Update voice channel UI
        this.updateVoiceChannelUI(channelId);
        
        // Update voice header but DON'T switch to voice view
        const channelNames = {
            'diamond-voice': '💎 Diamond Voice',
            'spade-voice': '♠️ Spade Voice', 
            'club-voice': '♣️ Club Voice',
            'heart-voice': '♥️ Heart Voice'
        };
        
        const voiceChannelName = document.getElementById('currentVoiceChannelName');
        if (voiceChannelName) {
            voiceChannelName.textContent = channelNames[channelId] || '🔊 Voice Channel';
        }
    }

    updateVoiceChannelUI(activeChannelId) {
        // Update voice channel header states
        const voiceChannelHeaders = document.querySelectorAll('.voice-channel-header');
        voiceChannelHeaders.forEach(header => {
            const channelData = header.closest('.voice-channel').dataset;
            header.classList.toggle('active', channelData.channelId === activeChannelId);
        });
    }

    switchToContentView(viewId) {
        document.querySelectorAll('.content-view').forEach(view => {
            view.classList.remove('active');
        });
        
        const targetView = document.getElementById(viewId);
        if (targetView) {
            targetView.classList.add('active');
        }
    }

    addVoiceParticipant(userId, username, userColor, channelId, isSelf = false) {
        // Get the specific voice channel participants container
        const channelKey = channelId.replace('-voice', '');
        const participantsContainer = document.getElementById(`voiceParticipants-${channelKey}`);
        
        if (!participantsContainer) {
            console.warn('Voice participants container not found for channel:', channelId);
            return;
        }

        // Remove existing participant if present
        this.removeVoiceParticipant(userId, channelId);

        const participant = document.createElement('div');
        participant.className = 'voice-participant';
        participant.id = `voice-participant-${userId}-${channelKey}`;
        
        const micStatus = document.createElement('div');
        micStatus.className = 'mic-status';
        
        const avatar = document.createElement('span');
        avatar.className = 'participant-avatar';
        avatar.textContent = this.getColorEmoji(userColor);
        
        const name = document.createElement('span');
        name.textContent = username;
        name.style.fontWeight = isSelf ? 'bold' : 'normal';
        
        participant.appendChild(micStatus);
        participant.appendChild(avatar);
        participant.appendChild(name);
        
        participantsContainer.appendChild(participant);
        
        console.log(`Added voice participant ${username} to ${channelId}`);
    }

    removeVoiceParticipant(userId, channelId) {
        if (channelId) {
            const channelKey = channelId.replace('-voice', '');
            const participant = document.getElementById(`voice-participant-${userId}-${channelKey}`);
            if (participant) {
                participant.remove();
            }
        } else {
            // Remove from all channels if no specific channel provided
            const allParticipants = document.querySelectorAll(`[id^="voice-participant-${userId}-"]`);
            allParticipants.forEach(p => p.remove());
        }
    }

    clearVoiceParticipants(channelId) {
        if (channelId) {
            const channelKey = channelId.replace('-voice', '');
            const participantsContainer = document.getElementById(`voiceParticipants-${channelKey}`);
            if (participantsContainer) {
                participantsContainer.innerHTML = '';
            }
        } else {
            // Clear all voice channels
            ['diamond', 'spade', 'club', 'heart'].forEach(channel => {
                const container = document.getElementById(`voiceParticipants-${channel}`);
                if (container) {
                    container.innerHTML = '';
                }
            });
        }
    }

    addParticipant(userId, stream, isSelf = false, username = 'Anonymous', userColor = 'purple') {
        // This is for the main voice view participants list (REMOVED - not needed)
        // We only show participants under voice channels now
        return;
    }

    removeParticipant(userId) {
        // Remove from main participants list (REMOVED - not needed)
        return;
    }

    clearParticipants() {
        // Clear main participants list (REMOVED - not needed)
        return;
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

        // Update mic status in voice participants
        const myParticipants = document.querySelectorAll(`[id*="voice-participant-${this.getUserId()}-"]`);
        myParticipants.forEach(participant => {
            const micStatus = participant.querySelector('.mic-status');
            if (micStatus) {
                micStatus.classList.toggle('muted', isMuted);
            }
        });
    }

    updateUserMicStatus(userId, isMuted) {
        // Update mic status for a specific user in voice participants
        const userParticipants = document.querySelectorAll(`[id*="voice-participant-${userId}-"]`);
        userParticipants.forEach(participant => {
            const micStatus = participant.querySelector('.mic-status');
            if (micStatus) {
                micStatus.classList.toggle('muted', isMuted);
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

    // Chat message sender
    sendChatMessage() {
        if (!this.elements.messageInput) return;
        
        const message = this.elements.messageInput.value.trim();
        if (!message) return;
        
        console.log('UI sending message:', message, 'to channel:', this.currentTextChannel);
        this.emit('send-message', { message, channel: this.currentTextChannel });
        this.elements.messageInput.value = '';
    }

    // ENHANCED: Add chat message with delete functionality
    addChatMessage(messageData) {
        if (!this.elements.chatMessages) return;

        const messageElement = document.createElement('div');
        messageElement.className = 'message';
        messageElement.id = `message-${messageData.id}`;

        const messageHeader = document.createElement('div');
        messageHeader.className = 'message-header';

        const author = document.createElement('span');
        author.className = 'message-author';
        author.textContent = messageData.username;

        const time = document.createElement('span');
        time.className = 'message-timestamp';
        time.textContent = new Date(messageData.timestamp).toLocaleTimeString();

        messageHeader.appendChild(author);
        messageHeader.appendChild(time);

        const content = document.createElement('div');
        content.className = 'message-content';
        content.textContent = messageData.message;

        // Add delete button for own messages
        const isOwnMessage = messageData.userId === this.getUserId();
        if (isOwnMessage) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'message-delete-btn';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.title = 'Delete message';
            deleteBtn.style.display = 'none'; // Hidden by default
            
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showDeleteConfirmation(messageData.id);
            });
            
            messageElement.appendChild(deleteBtn);
            
            // Show delete button on hover
            messageElement.addEventListener('mouseenter', () => {
                deleteBtn.style.display = 'block';
            });
            
            messageElement.addEventListener('mouseleave', () => {
                deleteBtn.style.display = 'none';
            });
        }

        messageElement.appendChild(messageHeader);
        messageElement.appendChild(content);

        this.elements.chatMessages.appendChild(messageElement);
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }

    showDeleteConfirmation(messageId) {
        const confirmed = confirm('Do you want to delete this message?');
        if (confirmed) {
            this.emit('delete-message', messageId);
        }
    }

    removeChatMessage(messageId) {
        const messageElement = document.getElementById(`message-${messageId}`);
        if (messageElement) {
            messageElement.remove();
        }
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

    getUserId() {
        return window.proximityApp ? window.proximityApp.myUserId : null;
    }

    getCurrentVoiceChannel() {
        return this.currentVoiceChannel;
    }

    getCurrentTextChannel() {
        return this.currentTextChannel;
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