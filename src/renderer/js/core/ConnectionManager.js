// src/renderer/js/core/ConnectionManager.js - Fixed connection status updates
export class ConnectionManager {
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            if (typeof io === 'undefined') {
                reject(new Error('Socket.IO not loaded'));
                return;
            }

            console.log('Connecting to server:', this.serverUrl);
            
            // Update connection status to connecting
            this.updateConnectionStatus('connecting', 'Connecting...');
            
            this.socket = io(this.serverUrl, {
                reconnectionAttempts: this.maxReconnectAttempts,
                timeout: 10000,
                transports: ['websocket', 'polling']
            });

            this.socket.on('connect', () => {
                console.log('Connected to server');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                
                // Update connection status to online
                this.updateConnectionStatus('online', 'Connected');
                
                resolve();
            });

            this.socket.on('disconnect', () => {
                console.log('Disconnected from server');
                this.isConnected = false;
                
                // Update connection status to offline
                this.updateConnectionStatus('offline', 'Disconnected');
            });

            this.socket.on('connect_error', (error) => {
                console.error('Connection error:', error);
                this.isConnected = false;
                this.reconnectAttempts++;
                
                // Update connection status to offline/error
                this.updateConnectionStatus('offline', 'Connection Error');
                
                if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                    reject(new Error('Failed to connect to server after multiple attempts'));
                }
            });

            this.socket.on('reconnect', () => {
                console.log('Reconnected to server');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                
                // Update connection status to online
                this.updateConnectionStatus('online', 'Connected');
            });

            this.socket.on('reconnect_error', (error) => {
                console.error('Reconnection error:', error);
                this.updateConnectionStatus('offline', 'Reconnection Failed');
            });

            this.socket.on('reconnecting', (attemptNumber) => {
                console.log('Attempting to reconnect...', attemptNumber);
                this.updateConnectionStatus('connecting', `Reconnecting... (${attemptNumber})`);
            });
        });
    }

    updateConnectionStatus(status, text) {
        // Update the UI connection status
        if (window.proximityApp && window.proximityApp.uiManager) {
            window.proximityApp.uiManager.updateConnectionStatus(status, text);
        } else {
            // Fallback: update directly if UI manager not available yet
            const connectionIndicator = document.getElementById('connectionIndicator');
            const connectionText = document.getElementById('connectionText');
            
            if (connectionIndicator && connectionText) {
                // Clear all existing classes
                connectionIndicator.classList.remove('online', 'offline', 'connecting');
                
                // Add the new status class
                connectionIndicator.classList.add(status);
                connectionText.textContent = text;
            }
        }
        
        console.log(`Connection status: ${status} (${text})`);
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
            this.updateConnectionStatus('offline', 'Disconnected');
        }
    }

    emit(event, data) {
        if (this.socket && this.isConnected) {
            this.socket.emit(event, data);
        } else {
            console.warn('Attempted to emit event while disconnected:', event);
        }
    }

    on(event, callback) {
        if (this.socket) {
            this.socket.on(event, callback);
        }
    }
}