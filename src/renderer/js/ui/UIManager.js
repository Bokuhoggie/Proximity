// src/renderer/js/ui/UIManager.js
export class UIManager {
    constructor() {
        this.eventHandlers = {};
        this.elements = {};
    }

    init() {
        this.cacheElements();
        this.setupEventListeners();
        this.addHubToNavigation();
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
            this.switchPage('server-view');
            this.emit('join-hub');
        });

        // Insert after the home nav item
        const homeNavItem = document.querySelector('.nav-item[data-page="home"]');
        if (homeNavItem && homeNavItem.parentNode) {
            homeNavItem.parentNode.insertBefore(hubNavItem, homeNavItem.nextSibling);
        }
    }

    switchPage(pageName) {
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
            document.querySelector('.nav-item[data-page="hub"]').classList.add('active');
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