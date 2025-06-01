// src/renderer/js/chat/ChatManager.js
export class ChatManager {
    constructor() {
        this.currentRoom = null;
    }

    sendMessage(message) {
        if (!message.trim()) return;

        if (!window.proximityApp || !window.proximityApp.connectionManager.socket) {
            console.error('Not connected to server');
            return;
        }

        if (!window.proximityApp.isInHub) {
            console.error('Not in a channel');
            return;
        }

        const username = window.proximityApp.settingsManager.get('username') || 'Anonymous';
        
        console.log('Sending chat message:', message);

        window.proximityApp.connectionManager.emit('send-chat-message', {
            roomId: 'hub-general',
            message: message,
            username: username
        });
    }

    addMessage(data) {
        if (!window.proximityApp || !window.proximityApp.uiManager) return;

        console.log('Adding chat message:', data);
        
        window.proximityApp.uiManager.addChatMessage(
            data.username,
            data.message,
            data.timestamp || Date.now()
        );
    }

    clearMessages() {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = '';
        }
    }
}