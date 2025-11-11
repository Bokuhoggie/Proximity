// src/renderer/js/ui/UIManager.js - Updated with chat message delete and improved functionality
export class UIManager {
    constructor() {
        this.eventHandlers = {};
        this.elements = {};
        this.currentVoiceChannel = null;
        this.currentTextChannel = 'general';
    }

    init() {
        this.cacheElements();
        this.setupEventListeners();
        this.addHubToServers();
        this.setupHomePageEvents();
        this.setupChannelHandlers();
        this.setupShareServerButton();
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
        
        // Share server button
        this.elements.shareServerBtn = document.getElementById('shareServerBtn');
        
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
        // Add Hub to My Servers section
        const myServersList = document.getElementById('myServersList');
        if (myServersList) {
            const hubServer = document.createElement('div');
            hubServer.className = 'server-item';
            hubServer.dataset.serverId = 'hub';
            hubServer.innerHTML = `
                <div class="server-icon">🏢</div>
                <span class="server-name">Hub</span>
            `;
            
            hubServer.addEventListener('click', () => {
                console.log('Server hub button clicked');
                this.switchPage('server-view');
                this.emit('join-hub');
            });
            
            myServersList.appendChild(hubServer);
        }
        
        // Also add Hub to Available Servers section on home page
        const availableServersList = document.getElementById('availableServersList');
        if (availableServersList) {
            const hubServerCard = document.createElement('div');
            hubServerCard.className = 'server-card';
            hubServerCard.innerHTML = `
                <div class="server-card-header">
                    <div class="server-icon">🏢</div>
                    <h4>Hub</h4>
                </div>
                <p class="server-description">The main server where everyone can connect and chat</p>
                <div class="server-stats">
                    <span class="stat">🟢 Online</span>
                    <span class="stat">👥 Public</span>
                </div>
                <button class="join-server-btn">Join Server</button>
            `;
            
            const joinBtn = hubServerCard.querySelector('.join-server-btn');
            joinBtn.addEventListener('click', () => {
                console.log('Join Hub clicked');
                this.switchPage('server-view');
                this.emit('join-hub');
            });
            
            availableServersList.appendChild(hubServerCard);
        }
    }

    setupShareServerButton() {
        if (this.elements.shareServerBtn) {
            this.elements.shareServerBtn.addEventListener('click', () => {
                this.shareServer();
            });
        }
    }

    shareServer() {
        const serverUrl = `${window.location.origin}/join/hub`;
        const shareText = `Join the Hub server on Proximity! ${serverUrl}`;
        
        // Try to use the native share API if available
        if (navigator.share) {
            navigator.share({
                title: 'Join Hub Server',
                text: 'Join the Hub server on Proximity!',
                url: serverUrl
            }).catch(err => {
                console.log('Error sharing:', err);
                this.fallbackShare(shareText);
            });
        } else {
            this.fallbackShare(shareText);
        }
    }

    fallbackShare(shareText) {
        // Fallback: copy to clipboard
        if (navigator.clipboard) {
            navigator.clipboard.writeText(shareText).then(() => {
                this.showNotification('Server link copied to clipboard!', 'success');
            }).catch(err => {
                console.error('Failed to copy to clipboard:', err);
                this.showShareDialog(shareText);
            });
        } else {
            this.showShareDialog(shareText);
        }
    }

    showShareDialog(shareText) {
        // Create a temporary dialog for sharing
        const dialog = document.createElement('div');
        dialog.className = 'share-dialog';
        dialog.innerHTML = `
            <div class="share-dialog-content">
                <h3>Share Server</h3>
                <p>Share this link with others to invite them to the Hub:</p>
                <div class="share-link-container">
                    <input type="text" value="${shareText}" readonly class="share-link-input">
                    <button class="copy-btn" onclick="this.parentElement.querySelector('input').select(); document.execCommand('copy'); this.textContent='Copied!';">Copy</button>
                </div>
                <button class="close-dialog-btn" onclick="this.parentElement.parentElement.remove();">Close</button>
            </div>
        `;
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .share-dialog {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 1000;
            }
            .share-dialog-content {
                background: var(--dark-bg);
                padding: 2rem;
                border-radius: 8px;
                border: 1px solid var(--border);
                max-width: 500px;
                width: 90%;
            }
            .share-link-container {
                display: flex;
                gap: 0.5rem;
                margin: 1rem 0;
            }
            .share-link-input {
                flex: 1;
                padding: 0.5rem;
                border: 1px solid var(--border);
                border-radius: 4px;
                background: var(--bg-secondary);
                color: var(--text-primary);
            }
            .copy-btn, .close-dialog-btn {
                padding: 0.5rem 1rem;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .copy-btn {
                background: var(--secondary-purple);
                color: var(--text-primary);
            }
            .close-dialog-btn {
                background: var(--border);
                color: var(--text-primary);
                margin-top: 1rem;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(dialog);
        
        // Select the text
        const input = dialog.querySelector('.share-link-input');
        input.select();
        
        this.showNotification('Share dialog opened', 'info');
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

        // CRITICAL: Emit page-change event so app.js handlePageChange() is called
        this.emit('page-change', pageName);
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
        // Start in general text channel
        this.switchToTextChannel('general');
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
            general: { name: '# general', desc: 'Welcome to the Proximity Room' }
        };

        const channelInfo = channelNames[channelId] || channelNames.general;
        
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
        // Update internal state
        this.currentVoiceChannel = activeChannelId;

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
        // Add data attributes for easier querying
        participant.setAttribute('data-user-id', userId);
        participant.setAttribute('data-username', username);
        participant.setAttribute('data-user-color', userColor);

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
        console.log('🔧 populateAudioDevices() called');
        console.log('🔧 Input select exists:', !!this.elements.audioDeviceSelect);
        console.log('🔧 Output select exists:', !!this.elements.audioOutputDeviceSelect);

        if (!this.elements.audioDeviceSelect || !this.elements.audioOutputDeviceSelect) {
            console.error('❌ Audio device select elements not found!');
            return;
        }

        try {
            // Request microphone permission first to get device labels
            let stream = null;
            try {
                console.log('🎤 Requesting mic permission...');
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                console.log('✅ Got mic permission');
            } catch (permError) {
                console.warn('⚠️ Microphone permission denied');
            }

            // Enumerate devices
            console.log('📋 Enumerating devices...');
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');
            const audioOutputs = devices.filter(device => device.kind === 'audiooutput');

            console.log(`🎙️ Found ${audioInputs.length} input(s) and ${audioOutputs.length} output(s)`);

            // Populate inputs
            console.log('📝 Populating input select...');
            this.elements.audioDeviceSelect.innerHTML = '<option value="">Select Audio Device</option>';
            audioInputs.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Microphone ${index + 1}`;
                this.elements.audioDeviceSelect.appendChild(option);
                console.log(`  Added: ${option.textContent}`);
            });

            // Populate outputs
            console.log('📝 Populating output select...');
            this.elements.audioOutputDeviceSelect.innerHTML = '<option value="">Select Output Device</option>';
            audioOutputs.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Speaker ${index + 1}`;
                this.elements.audioOutputDeviceSelect.appendChild(option);
                console.log(`  Added: ${option.textContent}`);
            });

            // Stop the temporary stream
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }

            console.log('🔄 Forcing re-render...');
            // CRITICAL: Force re-render to make options visible (Electron quirk)
            this.elements.audioDeviceSelect.style.display = 'none';
            this.elements.audioOutputDeviceSelect.style.display = 'none';
            setTimeout(() => {
                this.elements.audioDeviceSelect.style.display = '';
                this.elements.audioOutputDeviceSelect.style.display = '';
                console.log('✅ Re-render complete, devices should be visible');
            }, 10);

            console.log('✅ Audio devices populated');
        } catch (error) {
            console.error('❌ Error populating audio devices:', error);
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