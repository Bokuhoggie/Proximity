const http = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');

describe('Proximity App - E2E User Flows', () => {
    let io, httpServer, clients;
    const PORT = 3002;

    beforeAll((done) => {
        httpServer = http.createServer();
        io = new Server(httpServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        // Initialize server state
        const users = new Map();
        const hubUsers = new Set();
        const voiceChannels = new Map();
        const VOICE_CHANNEL = 'voice';
        voiceChannels.set(VOICE_CHANNEL, new Set());
        const chatMessages = [];
        const CHAT_CHANNEL = 'general';

        // Simplified server logic
        io.on('connection', (socket) => {
            users.set(socket.id, {
                id: socket.id,
                username: null,
                userColor: null,
                isMuted: false,
                position: { x: 400, y: 300 },
                voiceChannel: null,
                status: 'online'
            });

            socket.on('join-hub', (data) => {
                const { username, userColor, status } = data;
                const user = users.get(socket.id);
                if (user) {
                    user.username = username;
                    user.userColor = userColor;
                    user.status = status || 'online';
                    hubUsers.add(socket.id);

                    const currentUsers = Array.from(hubUsers).map(id => users.get(id));
                    socket.emit('hub-users', currentUsers);
                    socket.broadcast.emit('user-joined-hub', user);
                }
            });

            socket.on('join-voice-channel', (data) => {
                const { channelId } = data;
                const user = users.get(socket.id);
                if (user && channelId) {
                    const channel = voiceChannels.get(channelId);
                    if (channel) {
                        channel.add(socket.id);
                        user.voiceChannel = channelId;
                        const usersInChannel = Array.from(channel)
                            .filter(id => id !== socket.id)
                            .map(id => users.get(id));
                        socket.emit('voice-channel-users', usersInChannel);
                        socket.to(channelId).emit('user-joined-voice', user);
                        socket.join(channelId);
                    }
                }
            });

            socket.on('send-chat-message', (data) => {
                const { content } = data;
                const user = users.get(socket.id);
                if (user && content) {
                    const message = {
                        id: `${socket.id}-${Date.now()}`,
                        userId: socket.id,
                        username: user.username,
                        userColor: user.userColor,
                        content,
                        timestamp: Date.now(),
                        channelId: CHAT_CHANNEL
                    };
                    chatMessages.push(message);
                    io.emit('chat-message', message);
                }
            });

            socket.on('position-update', (data) => {
                const { x, y } = data;
                const user = users.get(socket.id);
                if (user && user.voiceChannel) {
                    user.position = { x, y };
                    socket.to(user.voiceChannel).emit('position-update', {
                        userId: socket.id,
                        x,
                        y
                    });
                }
            });

            socket.on('mic-status', (data) => {
                const { isMuted } = data;
                const user = users.get(socket.id);
                if (user && user.voiceChannel) {
                    user.isMuted = isMuted;
                    socket.to(user.voiceChannel).emit('user-mic-status', {
                        userId: socket.id,
                        isMuted
                    });
                }
            });

            socket.on('leave-voice-channel', () => {
                const user = users.get(socket.id);
                if (user && user.voiceChannel) {
                    const channel = voiceChannels.get(user.voiceChannel);
                    if (channel) {
                        channel.delete(socket.id);
                        socket.to(user.voiceChannel).emit('user-left-voice', socket.id);
                        socket.leave(user.voiceChannel);
                        user.voiceChannel = null;
                    }
                }
            });

            socket.on('disconnect', () => {
                const user = users.get(socket.id);
                if (user) {
                    hubUsers.delete(socket.id);
                    if (user.voiceChannel) {
                        const channel = voiceChannels.get(user.voiceChannel);
                        if (channel) {
                            channel.delete(socket.id);
                            socket.to(user.voiceChannel).emit('user-left-voice', socket.id);
                        }
                    }
                    socket.broadcast.emit('user-left-hub', socket.id);
                }
                users.delete(socket.id);
            });
        });

        httpServer.listen(PORT, done);
    });

    afterAll((done) => {
        io.close();
        httpServer.close(done);
    });

    beforeEach(() => {
        clients = [];
    });

    afterEach(() => {
        clients.forEach(client => {
            if (client.connected) {
                client.disconnect();
            }
        });
        clients = [];
    });

    const createClient = () => {
        const client = Client(`http://localhost:${PORT}`);
        clients.push(client);
        return client;
    };

    describe('Flow: User joins hub and sends chat message', () => {
        test('should complete full flow successfully', (done) => {
            const client = createClient();
            let hubJoined = false;
            let messageReceived = false;

            client.on('connect', () => {
                // Step 1: Join hub
                client.emit('join-hub', {
                    username: 'Alice',
                    userColor: 'blue',
                    status: 'online'
                });
            });

            client.on('hub-users', (users) => {
                // Step 2: Verify hub join
                expect(users.length).toBeGreaterThan(0);
                hubJoined = true;

                // Step 3: Send chat message
                client.emit('send-chat-message', {
                    content: 'Hello everyone!'
                });
            });

            client.on('chat-message', (message) => {
                // Step 4: Receive own message
                expect(message.content).toBe('Hello everyone!');
                expect(message.username).toBe('Alice');
                messageReceived = true;

                if (hubJoined && messageReceived) {
                    done();
                }
            });
        });
    });

    describe('Flow: Two users join voice channel and communicate', () => {
        test('should establish voice channel communication', (done) => {
            const client1 = createClient();
            const client2 = createClient();

            let client1Ready = false;
            let client2Joined = false;
            let positionReceived = false;

            client1.on('connect', () => {
                client1.emit('join-hub', {
                    username: 'Bob',
                    userColor: 'red',
                    status: 'online'
                });

                setTimeout(() => {
                    client1.emit('join-voice-channel', { channelId: 'voice' });
                }, 100);
            });

            client1.on('voice-channel-users', () => {
                client1Ready = true;
            });

            client1.on('user-joined-voice', (user) => {
                expect(user.username).toBe('Charlie');
                client2Joined = true;

                // Test position updates
                client1.emit('position-update', { x: 150, y: 250 });
            });

            client2.on('connect', () => {
                setTimeout(() => {
                    client2.emit('join-hub', {
                        username: 'Charlie',
                        userColor: 'green',
                        status: 'online'
                    });

                    setTimeout(() => {
                        client2.emit('join-voice-channel', { channelId: 'voice' });
                    }, 100);
                }, 200);
            });

            client2.on('position-update', (data) => {
                expect(data.x).toBe(150);
                expect(data.y).toBe(250);
                positionReceived = true;

                if (client1Ready && client2Joined && positionReceived) {
                    done();
                }
            });
        });
    });

    describe('Flow: User mutes/unmutes in voice channel', () => {
        test('should broadcast mute status to other users', (done) => {
            const client1 = createClient();
            const client2 = createClient();

            client1.on('connect', () => {
                client1.emit('join-hub', {
                    username: 'David',
                    userColor: 'purple',
                    status: 'online'
                });

                setTimeout(() => {
                    client1.emit('join-voice-channel', { channelId: 'voice' });
                }, 100);
            });

            client2.on('connect', () => {
                setTimeout(() => {
                    client2.emit('join-hub', {
                        username: 'Eve',
                        userColor: 'orange',
                        status: 'online'
                    });

                    setTimeout(() => {
                        client2.emit('join-voice-channel', { channelId: 'voice' });
                    }, 100);

                    setTimeout(() => {
                        client1.emit('mic-status', { isMuted: true });
                    }, 300);
                }, 200);
            });

            client2.on('user-mic-status', (data) => {
                expect(data.userId).toBe(client1.id);
                expect(data.isMuted).toBe(true);
                done();
            });
        });
    });

    describe('Flow: User leaves voice channel', () => {
        test('should notify other users when leaving', (done) => {
            const client1 = createClient();
            const client2 = createClient();

            client1.on('connect', () => {
                client1.emit('join-hub', {
                    username: 'Frank',
                    userColor: 'cyan',
                    status: 'online'
                });

                setTimeout(() => {
                    client1.emit('join-voice-channel', { channelId: 'voice' });
                }, 100);
            });

            client2.on('connect', () => {
                setTimeout(() => {
                    client2.emit('join-hub', {
                        username: 'Grace',
                        userColor: 'pink',
                        status: 'online'
                    });

                    setTimeout(() => {
                        client2.emit('join-voice-channel', { channelId: 'voice' });
                    }, 100);

                    setTimeout(() => {
                        client1.emit('leave-voice-channel');
                    }, 300);
                }, 200);
            });

            client2.on('user-left-voice', (userId) => {
                expect(userId).toBe(client1.id);
                done();
            });
        });
    });

    describe('Flow: Multiple users in proximity map', () => {
        test('should track positions of multiple users', (done) => {
            const client1 = createClient();
            const client2 = createClient();
            const client3 = createClient();

            const positions = {};
            let updateCount = 0;

            const checkCompletion = () => {
                updateCount++;
                if (updateCount >= 2) { // Expecting 2 position updates
                    expect(Object.keys(positions).length).toBeGreaterThan(0);
                    done();
                }
            };

            client1.on('connect', () => {
                client1.emit('join-hub', { username: 'User1', userColor: 'blue', status: 'online' });
                setTimeout(() => client1.emit('join-voice-channel', { channelId: 'voice' }), 50);
            });

            client2.on('connect', () => {
                setTimeout(() => {
                    client2.emit('join-hub', { username: 'User2', userColor: 'red', status: 'online' });
                    setTimeout(() => client2.emit('join-voice-channel', { channelId: 'voice' }), 50);
                }, 100);
            });

            client3.on('connect', () => {
                setTimeout(() => {
                    client3.emit('join-hub', { username: 'User3', userColor: 'green', status: 'online' });
                    setTimeout(() => {
                        client3.emit('join-voice-channel', { channelId: 'voice' });
                        setTimeout(() => {
                            client1.emit('position-update', { x: 100, y: 100 });
                            client2.emit('position-update', { x: 200, y: 200 });
                        }, 100);
                    }, 50);
                }, 200);
            });

            client3.on('position-update', (data) => {
                positions[data.userId] = { x: data.x, y: data.y };
                checkCompletion();
            });
        });
    });
});
