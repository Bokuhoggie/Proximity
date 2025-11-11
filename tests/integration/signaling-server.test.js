const { server, io, redis: actualRedis } = require('../../src/server/signaling-server');
const Client = require('socket.io-client');
const Redis = require('ioredis-mock');

// Mock the redis instance used by the server
jest.mock('ioredis', () => require('ioredis-mock'));

describe('Proximity Signaling Server - Integration Tests', () => {
    let clientSocket;
    const PORT = 3003; // Use a different port for testing
    let redis;

    beforeAll((done) => {
        // The server is already created, we just need to listen on a test port
        server.listen(PORT, done);
        // Get the mock redis instance
        redis = actualRedis;
    });

    afterAll((done) => {
        io.close();
        redis.quit();
        server.close(done);
    });

    beforeEach((done) => {
        // Clear any previous test data
        redis.flushall();
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
                expect(users.length).toBe(1);
                expect(users[0]).toHaveProperty('username', 'TestUser');
                done();
            });
            clientSocket.emit('join-hub', { username: 'TestUser', userColor: 'purple' });
        });

        test('should broadcast user-joined-hub to other clients', (done) => {
            const client2 = Client(`http://localhost:${PORT}`);
            clientSocket.emit('join-hub', { username: 'User1' });

            client2.on('connect', () => {
                client2.on('user-joined-hub', (user) => {
                    expect(user).toHaveProperty('username', 'User2');
                    client2.disconnect();
                    done();
                });
                client2.emit('join-hub', { username: 'User2' });
            });
        });
    });

    describe('Voice Channel Events', () => {
        test('should join voice channel and receive voice-channel-users', (done) => {
            const client2 = Client(`http://localhost:${PORT}`);
            client2.emit('join-hub', { username: 'User2' });
            client2.emit('join-voice-channel', { channelId: 'voice' });

            clientSocket.on('voice-channel-users', (users) => {
                expect(Array.isArray(users)).toBe(true);
                expect(users.length).toBe(1);
                expect(users[0]).toHaveProperty('username', 'User2');
                client2.disconnect();
                done();
            });

            clientSocket.emit('join-hub', { username: 'User1' });
            clientSocket.emit('join-voice-channel', { channelId: 'voice' });
        });

        test('should notify other users when joining voice channel', (done) => {
            const client2 = Client(`http://localhost:${PORT}`);
            clientSocket.emit('join-hub', { username: 'User1' });
            clientSocket.emit('join-voice-channel', { channelId: 'voice' });

            client2.on('connect', () => {
                clientSocket.on('user-joined-voice', (user) => {
                    expect(user).toHaveProperty('username', 'User2');
                    client2.disconnect();
                    done();
                });

                client2.emit('join-hub', { username: 'User2' });
                client2.emit('join-voice-channel', { channelId: 'voice' });
            });
        });
    });

    describe('Chat Events', () => {
        test('should send and receive chat messages', (done) => {
            clientSocket.on('chat-message', (message) => {
                expect(message).toHaveProperty('content', 'Hello World');
                expect(message).toHaveProperty('username', 'ChatUser');
                done();
            });

            clientSocket.emit('join-hub', { username: 'ChatUser', userColor: 'purple' });
            clientSocket.emit('send-chat-message', { content: 'Hello World' });
        });

        test('should retrieve chat history', async () => {
            // Pre-populate redis with a message
            await redis.lpush('chat:general', JSON.stringify({ id: 'test-msg', content: 'Old message' }));

            clientSocket.emit('request-chat-history');

            clientSocket.on('chat-history', ({ channelId, messages }) => {
                expect(channelId).toBe('general');
                expect(Array.isArray(messages)).toBe(true);
                expect(messages.length).toBe(1);
                expect(messages[0]).toHaveProperty('content', 'Old message');
            });
        });
    });
});