// src/renderer/js/server/ServerManager.js
export class ServerManager {
    constructor() {
        this.availableServers = [];
        this.myServers = [];
        this.favoriteServers = [];
    }

    async loadServerData() {
        try {
            const savedMyServers = localStorage.getItem('proximity-my-servers');
            if (savedMyServers) {
                this.myServers = JSON.parse(savedMyServers);
            }
            
            const savedFavorites = localStorage.getItem('proximity-favorite-servers');
            if (savedFavorites) {
                this.favoriteServers = JSON.parse(savedFavorites);
            }
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

    createServer(name, description) {
        if (!window.proximityApp || !window.proximityApp.connectionManager.socket) {
            throw new Error('Not connected to server');
        }

        window.proximityApp.connectionManager.emit('create-server', {
            serverName: name,
            serverDescription: description
        });
    }

    joinServer(server) {
        // Implementation for joining custom servers
        // For now, we'll focus on the hub
        console.log('Joining server:', server);
    }

    addToFavorites(serverId) {
        if (!this.favoriteServers.includes(serverId)) {
            this.favoriteServers.push(serverId);
            this.saveServerData();
        }
    }

    removeFromFavorites(serverId) {
        this.favoriteServers = this.favoriteServers.filter(id => id !== serverId);
        this.saveServerData();
    }

    addToMyServers(serverId) {
        if (!this.myServers.includes(serverId)) {
            this.myServers.push(serverId);
            this.saveServerData();
        }
    }

    updateAvailableServers(servers) {
        this.availableServers = servers;
        // Could emit event here for UI updates
    }
}