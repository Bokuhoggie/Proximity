// src/renderer/js/chat/MatrixClient.js - Matrix chat integration
import * as sdk from 'matrix-js-sdk';

export class MatrixClient {
    constructor() {
        this.client = null;
        this.currentRoom = null;
        this.isInitialized = false;
        this.eventHandlers = {};

        // Default to matrix.org homeserver for testing
        // Can be changed to self-hosted Synapse later
        this.homeserverUrl = 'https://matrix.org';
    }

    /**
     * Initialize Matrix client with guest access
     * For production, you'd want proper registration/login
     */
    async initialize(username) {
        try {
            console.log('🔷 Initializing Matrix client...');

            // Create client instance
            this.client = sdk.createClient({
                baseUrl: this.homeserverUrl
            });

            // Register as guest for quick access
            // In production, you'd want proper user accounts
            const { access_token, user_id, device_id } = await this.client.registerGuest({
                body: {
                    initial_device_display_name: username || 'Proximity User'
                }
            });

            console.log('✅ Registered as guest:', user_id);

            // Re-create client with credentials
            this.client = sdk.createClient({
                baseUrl: this.homeserverUrl,
                accessToken: access_token,
                userId: user_id,
                deviceId: device_id
            });

            // Set up event listeners
            this.setupEventListeners();

            // Start syncing
            await this.client.startClient({ initialSyncLimit: 10 });

            this.isInitialized = true;
            console.log('✅ Matrix client initialized');

            return { userId: user_id, accessToken: access_token };

        } catch (error) {
            console.error('❌ Failed to initialize Matrix client:', error);
            throw error;
        }
    }

    setupEventListeners() {
        this.client.on('Room.timeline', (event, room, toStartOfTimeline) => {
            // Only handle new messages (not historical)
            if (toStartOfTimeline) return;

            // Only handle message events
            if (event.getType() !== 'm.room.message') return;

            // Emit message event for app to handle
            this.emit('message', {
                id: event.getId(),
                sender: event.getSender(),
                content: event.getContent().body,
                timestamp: event.getTs(),
                roomId: room.roomId,
                event: event
            });
        });

        this.client.on('RoomMember.membership', (event, member) => {
            if (member.membership === 'join') {
                this.emit('user-joined', {
                    userId: member.userId,
                    displayName: member.name,
                    roomId: member.roomId
                });
            } else if (member.membership === 'leave') {
                this.emit('user-left', {
                    userId: member.userId,
                    roomId: member.roomId
                });
            }
        });

        this.client.on('sync', (state, prevState, data) => {
            if (state === 'PREPARED') {
                console.log('✅ Matrix client synced and ready');
                this.emit('ready');
            }
        });
    }

    /**
     * Join or create a room
     */
    async joinRoom(roomAlias) {
        try {
            console.log('🚪 Joining room:', roomAlias);

            // Try to join existing room
            try {
                const room = await this.client.joinRoom(roomAlias);
                this.currentRoom = room.roomId;
                console.log('✅ Joined existing room:', this.currentRoom);
                return this.currentRoom;
            } catch (joinError) {
                // Room doesn't exist, create it
                console.log('📝 Room not found, creating new room...');

                const { room_id } = await this.client.createRoom({
                    room_alias_name: roomAlias.replace('#', '').replace(':matrix.org', ''),
                    visibility: 'public',
                    name: 'Proximity Chat',
                    topic: 'Voice chat with spatial audio',
                    preset: 'public_chat'
                });

                this.currentRoom = room_id;
                console.log('✅ Created room:', this.currentRoom);
                return this.currentRoom;
            }

        } catch (error) {
            console.error('❌ Failed to join/create room:', error);
            throw error;
        }
    }

    /**
     * Send a message to the current room
     */
    async sendMessage(text) {
        if (!this.currentRoom) {
            throw new Error('Not in a room');
        }

        try {
            const content = {
                body: text,
                msgtype: 'm.text'
            };

            const response = await this.client.sendEvent(
                this.currentRoom,
                'm.room.message',
                content,
                ''
            );

            console.log('📤 Message sent:', response.event_id);
            return response.event_id;

        } catch (error) {
            console.error('❌ Failed to send message:', error);
            throw error;
        }
    }

    /**
     * Get room history
     */
    async getRoomHistory(limit = 50) {
        if (!this.currentRoom) {
            return [];
        }

        try {
            const room = this.client.getRoom(this.currentRoom);
            if (!room) return [];

            const timeline = room.getLiveTimeline();
            const events = timeline.getEvents();

            return events
                .filter(event => event.getType() === 'm.room.message')
                .slice(-limit)
                .map(event => ({
                    id: event.getId(),
                    sender: event.getSender(),
                    content: event.getContent().body,
                    timestamp: event.getTs(),
                    event: event
                }));

        } catch (error) {
            console.error('❌ Failed to get room history:', error);
            return [];
        }
    }

    /**
     * Edit a message
     */
    async editMessage(eventId, newText) {
        if (!this.currentRoom) {
            throw new Error('Not in a room');
        }

        try {
            const content = {
                body: `* ${newText}`,
                msgtype: 'm.text',
                'm.new_content': {
                    body: newText,
                    msgtype: 'm.text'
                },
                'm.relates_to': {
                    rel_type: 'm.replace',
                    event_id: eventId
                }
            };

            await this.client.sendEvent(
                this.currentRoom,
                'm.room.message',
                content,
                ''
            );

            console.log('✏️ Message edited:', eventId);

        } catch (error) {
            console.error('❌ Failed to edit message:', error);
            throw error;
        }
    }

    /**
     * Delete (redact) a message
     */
    async deleteMessage(eventId) {
        if (!this.currentRoom) {
            throw new Error('Not in a room');
        }

        try {
            await this.client.redactEvent(this.currentRoom, eventId);
            console.log('🗑️ Message deleted:', eventId);
        } catch (error) {
            console.error('❌ Failed to delete message:', error);
            throw error;
        }
    }

    /**
     * React to a message
     */
    async reactToMessage(eventId, emoji) {
        if (!this.currentRoom) {
            throw new Error('Not in a room');
        }

        try {
            const content = {
                'm.relates_to': {
                    rel_type: 'm.annotation',
                    event_id: eventId,
                    key: emoji
                }
            };

            await this.client.sendEvent(
                this.currentRoom,
                'm.reaction',
                content,
                ''
            );

            console.log('👍 Reaction sent:', emoji);

        } catch (error) {
            console.error('❌ Failed to send reaction:', error);
            throw error;
        }
    }

    /**
     * Upload a file
     */
    async uploadFile(file) {
        try {
            console.log('📤 Uploading file:', file.name);

            const upload = await this.client.uploadContent(file, {
                name: file.name,
                type: file.type
            });

            console.log('✅ File uploaded:', upload.content_uri);
            return upload.content_uri;

        } catch (error) {
            console.error('❌ Failed to upload file:', error);
            throw error;
        }
    }

    /**
     * Send a file message
     */
    async sendFileMessage(file) {
        if (!this.currentRoom) {
            throw new Error('Not in a room');
        }

        try {
            const contentUri = await this.uploadFile(file);

            const content = {
                body: file.name,
                msgtype: 'm.file',
                url: contentUri,
                info: {
                    size: file.size,
                    mimetype: file.type
                }
            };

            // Send image message if it's an image
            if (file.type.startsWith('image/')) {
                content.msgtype = 'm.image';
            }

            await this.client.sendEvent(
                this.currentRoom,
                'm.room.message',
                content,
                ''
            );

            console.log('📤 File message sent');

        } catch (error) {
            console.error('❌ Failed to send file:', error);
            throw error;
        }
    }

    /**
     * Get room members
     */
    getRoomMembers() {
        if (!this.currentRoom) {
            return [];
        }

        const room = this.client.getRoom(this.currentRoom);
        if (!room) return [];

        const members = room.getMembers();
        return members.map(member => ({
            userId: member.userId,
            displayName: member.name,
            avatarUrl: member.getAvatarUrl(this.homeserverUrl, 32, 32, 'crop'),
            membership: member.membership
        }));
    }

    /**
     * Stop the client
     */
    stop() {
        if (this.client) {
            this.client.stopClient();
            console.log('🛑 Matrix client stopped');
        }
    }

    // Event emitter functionality
    on(event, handler) {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(handler);
    }

    off(event, handler) {
        if (!this.eventHandlers[event]) return;
        this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
    }

    emit(event, data) {
        if (!this.eventHandlers[event]) return;
        this.eventHandlers[event].forEach(handler => handler(data));
    }
}
