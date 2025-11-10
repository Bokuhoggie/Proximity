const http = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');

describe('Proximity Signaling Server - Integration Tests', () => {
    let io, serverSocket, clientSocket, httpServer;
    const PORT = 3001;

    beforeAll((done) => {
        httpServer = http.createServer();
        io = new Server(httpServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        httpServer.listen(PORT, () => {
            // Load and initialize server logic
            const users = new Map();
            const hubUsers = new Set();
            const voiceChannels = new Map();
            const VOICE_CHANNEL = 'voice';
            voiceChannels.set(VOICE_CHANNEL, new Set());

            const chatMessages = [];
            const CHAT_CHANNEL = 'general';

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

                        const currentUsers = Array.from(hubUsers).map(id => {
                            const u = users.get(id);
                            return {
                                id: u.id,
                                username: u.username,
                                userColor: u.userColor,
                                position: u.position,
                                isMuted: u.isMuted,
                                voiceChannel: u.voiceChannel,
                                status: u.status
                            };
                        });

                        socket.emit('hub-users', currentUsers);
                        socket.broadcast.emit('user-joined-hub', {
                            id: socket.id,
                            username: user.username,
                            userColor: user.userColor,
                            position: user.position,
                            status: user.status
                        });
                    }
                });

                socket.on('join-voice-channel', (data) => {
                    const { channelId } = data;
                    const user = users.get(socket.id);
                    if (user && channelId) {
                        if (user.voiceChannel) {
                            const prevChannel = voiceChannels.get(user.voiceChannel);
                            if (prevChannel) prevChannel.delete(socket.id);
                        }

                        if (!voiceChannels.has(channelId)) {
                            voiceChannels.set(channelId, new Set());
                        }

                        const channel = voiceChannels.get(channelId);
                        channel.add(socket.id);
                        user.voiceChannel = channelId;

                        const usersInChannel = Array.from(channel)
                            .filter(id => id !== socket.id)
                            .map(id => {
                                const u = users.get(id);
                                return {
                                    id: u.id,
                                    username: u.username,
                                    userColor: u.userColor,
                                    position: u.position,
                                    isMuted: u.isMuted
                                };
                            });

                        socket.emit('voice-channel-users', usersInChannel);
                        socket.to(channelId).emit('user-joined-voice', {
                            id: socket.id,
                            username: user.username,
                            userColor: user.userColor,
                            position: user.position,
                            isMuted: user.isMuted
                        });

                        socket.join(channelId);
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
                    if (user) {
                        user.position = { x, y };
                        if (user.voiceChannel) {
                            socket.to(user.voiceChannel).emit('position-update', {
                                userId: socket.id,
                                x,
                                y
                            });
                        }
                    }
                });

                socket.on('offer', (data) => {
                    const { target, offer } = data;
                    io.to(target).emit('offer', { offer, from: socket.id });
                });

                socket.on('answer', (data) => {
                    const { target, answer } = data;
                    io.to(target).emit('answer', { answer, from: socket.id });
                });

                socket.on('ice-candidate', (data) => {
                    const { target, candidate } = data;
                    io.to(target).emit('ice-candidate', { candidate, from: socket.id });
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

            done();
        });
    });

    afterAll((done) => {
        io.close();
        httpServer.close(done);
    });

    beforeEach((done) => {
        clientSocket = Client(`http://localhost:${PORT}`);
        clientSocket.on('connect', done);
    });

    afterEach(() => {
        if (clientSocket.connected) {
            clientSocket.disconnect();
        }
    });

    describe('Connection', () => {
        test('should connect successfully', () => {
            expect(clientSocket.connected).toBe(true);
        });

        test('should have a socket ID', () => {
            expect(clientSocket.id).toBeDefined();
        });
    });

    describe('Hub Events', () => {
        test('should join hub and receive hub-users event', (done) => {
            clientSocket.on('hub-users', (users) => {
                expect(Array.isArray(users)).toBe(true);
                expect(users.length).toBeGreaterThanOrEqual(1);
                expect(users[0]).toHaveProperty('username', 'TestUser');
                expect(users[0]).toHaveProperty('userColor', 'purple');
                done();
            });

            clientSocket.emit('join-hub', {
                username: 'TestUser',
                userColor: 'purple',
                status: 'online'
            });
        });

        test('should broadcast user-joined-hub to other clients', (done) => {
            const client2 = Client(`http://localhost:${PORT}`);

            client2.on('connect', () => {
                client2.emit('join-hub', {
                    username: 'User1',
                    userColor: 'blue',
                    status: 'online'
                });

                clientSocket.on('user-joined-hub', (user) => {
                    expect(user).toHaveProperty('username', 'User1');
                    expect(user).toHaveProperty('userColor', 'blue');
                    client2.disconnect();
                    done();
                });

                clientSocket.emit('join-hub', {
                    username: 'User2',
                    userColor: 'red',
                    status: 'online'
                });
            });
        });
    });

    describe('Voice Channel Events', () => {
        test('should join voice channel and receive voice-channel-users', (done) => {
            clientSocket.on('voice-channel-users', (users) => {
                expect(Array.isArray(users)).toBe(true);
                done();
            });

            clientSocket.emit('join-hub', {
                username: 'VoiceUser',
                userColor: 'green',
                status: 'online'
            });

            setTimeout(() => {
                clientSocket.emit('join-voice-channel', { channelId: 'voice' });
            }, 100);
        });

        test('should notify other users when joining voice channel', (done) => {
            const client2 = Client(`http://localhost:${PORT}`);

            client2.on('connect', () => {
                client2.emit('join-hub', {
                    username: 'User1',
                    userColor: 'blue',
                    status: 'online'
                });

                setTimeout(() => {
                    client2.emit('join-voice-channel', { channelId: 'voice' });
                }, 50);

                clientSocket.on('user-joined-voice', (user) => {
                    expect(user).toHaveProperty('username', 'User1');
                    expect(user).toHaveProperty('userColor', 'blue');
                    client2.disconnect();
                    done();
                });

                setTimeout(() => {
                    clientSocket.emit('join-hub', {
                        username: 'User2',
                        userColor: 'red',
                        status: 'online'
                    });

                    setTimeout(() => {
                        clientSocket.emit('join-voice-channel', { channelId: 'voice' });
                    }, 50);
                }, 100);
            });
        });
    });

    describe('Chat Events', () => {
        test('should send and receive chat messages', (done) => {
            clientSocket.on('chat-message', (message) => {
                expect(message).toHaveProperty('content', 'Hello World');
                expect(message).toHaveProperty('username', 'ChatUser');
                expect(message).toHaveProperty('channelId', 'general');
                done();
            });

            clientSocket.emit('join-hub', {
                username: 'ChatUser',
                userColor: 'purple',
                status: 'online'
            });

            setTimeout(() => {
                clientSocket.emit('send-chat-message', { content: 'Hello World' });
            }, 100);
        });
    });

    describe('Position Updates', () => {
        test('should broadcast position updates to voice channel', (done) => {
            const client2 = Client(`http://localhost:${PORT}`);

            client2.on('connect', () => {
                client2.emit('join-hub', {
                    username: 'User1',
                    userColor: 'blue',
                    status: 'online'
                });

                setTimeout(() => {
                    client2.emit('join-voice-channel', { channelId: 'voice' });
                }, 50);

                clientSocket.on('position-update', (data) => {
                    expect(data).toHaveProperty('x', 100);
                    expect(data).toHaveProperty('y', 200);
                    client2.disconnect();
                    done();
                });

                setTimeout(() => {
                    clientSocket.emit('join-hub', {
                        username: 'User2',
                        userColor: 'red',
                        status: 'online'
                    });

                    setTimeout(() => {
                        clientSocket.emit('join-voice-channel', { channelId: 'voice' });
                    }, 50);

                    setTimeout(() => {
                        client2.emit('position-update', { x: 100, y: 200 });
                    }, 100);
                }, 100);
            });
        });
    });

    describe('WebRTC Signaling', () => {
        test('should relay offer to target client', (done) => {
            const client2 = Client(`http://localhost:${PORT}`);

            client2.on('connect', () => {
                const targetId = client2.id;

                client2.on('offer', (data) => {
                    expect(data).toHaveProperty('offer');
                    expect(data.offer).toHaveProperty('type', 'offer');
                    expect(data).toHaveProperty('from', clientSocket.id);
                    client2.disconnect();
                    done();
                });

                setTimeout(() => {
                    clientSocket.emit('offer', {
                        target: targetId,
                        offer: { type: 'offer', sdp: 'mock-sdp' }
                    });
                }, 100);
            });
        });

        test('should relay answer to target client', (done) => {
            const client2 = Client(`http://localhost:${PORT}`);

            client2.on('connect', () => {
                const targetId = client2.id;

                client2.on('answer', (data) => {
                    expect(data).toHaveProperty('answer');
                    expect(data.answer).toHaveProperty('type', 'answer');
                    expect(data).toHaveProperty('from', clientSocket.id);
                    client2.disconnect();
                    done();
                });

                setTimeout(() => {
                    clientSocket.emit('answer', {
                        target: targetId,
                        answer: { type: 'answer', sdp: 'mock-sdp' }
                    });
                }, 100);
            });
        });

        test('should relay ICE candidates to target client', (done) => {
            const client2 = Client(`http://localhost:${PORT}`);

            client2.on('connect', () => {
                const targetId = client2.id;

                client2.on('ice-candidate', (data) => {
                    expect(data).toHaveProperty('candidate');
                    expect(data.candidate).toHaveProperty('candidate', 'mock-candidate');
                    expect(data).toHaveProperty('from', clientSocket.id);
                    client2.disconnect();
                    done();
                });

                setTimeout(() => {
                    clientSocket.emit('ice-candidate', {
                        target: targetId,
                        candidate: { candidate: 'mock-candidate' }
                    });
                }, 100);
            });
        });
    });
});
