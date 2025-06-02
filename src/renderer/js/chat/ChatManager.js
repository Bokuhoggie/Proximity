// src/renderer/js/chat/ChatManager.js - Updated with channel support
export class ChatManager {
    constructor() {
        this.currentChannel = 'diamond';
    }

    sendMessage(message, channel = null) {
        if (!message.trim()) return;

        if (!window.proximityApp || !window.proximityApp.connectionManager.socket) {
            console.error('Not connected to server');
            return;
        }

        if (!window.proximityApp.isInHub) {
            console.error('Not in hub');
            return;
        }

        const username = window.proximityApp.settingsManager.get('username') || 'Anonymous';
        const targetChannel = channel || this.currentChannel;
        
        console.log('Sending chat message:', message, 'to channel:', targetChannel);

        window.proximityApp.connectionManager.emit('send-chat-message', {
            roomId: 'hub',
            message: message,
            username: username,
            channel: targetChannel
        });
    }

    addMessage(data) {
        if (!window.proximityApp || !window.proximityApp.uiManager) return;

        console.log('Adding chat message:', data);
        
        // Pass channel info to UI manager
        window.proximityApp.uiManager.addChatMessage(
            data.username,
            data.message,
            data.timestamp || Date.now(),
            data.channel
        );
    }

    setCurrentChannel(channel) {
        this.currentChannel = channel;
    }

    getCurrentChannel() {
        return this.currentChannel;
    }

    clearMessages() {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = '';
        }
    }
}