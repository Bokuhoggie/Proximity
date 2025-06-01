// src/renderer/js/main.js - Main entry point for the renderer process
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
            
            // Initialize audio if needed
            if (!this.audioManager.isInitialized()) {
                await this.audioManager.initialize();
            }
            
            const username = this.settingsManager.get('username') || 'Anonymous';
            const userColor = this.settingsManager.get('userColor') || 'purple';
            
            // Join the hub room
            this.connectionManager.socket.emit('join-hub', {
                username,
                userColor
            });
            
            this.isInHub = true;
            this.currentServer = { id: 'hub', name: 'Community Hub' };
            this.currentChannel = { id: 'general-voice', type: 'voice' };
            
            // Update UI
            this.uiManager.showServerView(this.currentServer);
            this.uiManager.switchToChannel('general-voice', 'voice');
            
            // Add self to proximity map
            if (this.proximityMap) {
                this.proximityMap.addUser(this.myUserId, username, true);
                this.proximityMap.updateUserColor(this.myUserId, userColor);
            }
            
            this.uiManager.showNotification('Joined Community Hub', 'success');
            
        } catch (error) {
            console.error('Failed to join hub:', error);
            this.uiManager.showNotification('Failed to join hub', 'error');
        }
    }

    handleHubUsers(users) {
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

    handleUserJoined(user) {
        this.uiManager.addParticipant(user.userId, null, false, user.username, user.userColor);
        
        if (this.proximityMap) {
            this.proximityMap.addUser(user.userId, user.username, false);
            this.proximityMap.updateUserColor(user.userId, user.userColor);
        }
        
        // Establish WebRTC connection if we're in the same channel
        if (this.isInHub) {
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
        }
    }

    leaveCurrentChannel() {
        if (!this.isInHub) return;
        
        console.log('Leaving current channel...');
        
        // Disconnect from all users
        this.audioManager.disconnectAll();
        
        // Clear UI
        this.uiManager.clearParticipants();
        if (this.proximityMap) {
            this.proximityMap.clearUsers();
        }
        
        // Leave the hub
        this.connectionManager.socket.emit('leave-hub');
        
        this.isInHub = false;
        this.currentServer = null;
        this.currentChannel = null;
        
        // Return to home
        this.uiManager.switchPage('home');
        this.uiManager.showNotification('Left the channel', 'info');
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