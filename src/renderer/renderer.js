const io = require('socket.io-client');
const adapter = require('webrtc-adapter');

class VoiceChat {
    constructor() {
        this.socket = null;
        this.peerConnections = {};
        this.localStream = null;
        this.isMuted = false;
        this.currentRoom = null;

        this.initializeUI();
        this.setupEventListeners();
    }

    initializeUI() {
        this.roomIdInput = document.getElementById('roomId');
        this.joinRoomBtn = document.getElementById('joinRoom');
        this.leaveRoomBtn = document.getElementById('leaveRoom');
        this.muteButton = document.getElementById('muteButton');
        this.audioDeviceSelect = document.getElementById('audioDevice');
        this.participantsList = document.getElementById('participantsList');
    }

    setupEventListeners() {
        this.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        this.leaveRoomBtn.addEventListener('click', () => this.leaveRoom());
        this.muteButton.addEventListener('click', () => this.toggleMute());
        this.audioDeviceSelect.addEventListener('change', (e) => this.changeAudioDevice(e.target.value));
    }

    async joinRoom() {
        const roomId = this.roomIdInput.value.trim();
        if (!roomId) return;

        try {
            await this.initializeMedia();
            this.connectToSignalingServer(roomId);
            this.currentRoom = roomId;
            this.joinRoomBtn.disabled = true;
            this.leaveRoomBtn.disabled = false;
        } catch (error) {
            console.error('Failed to join room:', error);
        }
    }

    async initializeMedia() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false
            });
            await this.populateAudioDevices();
        } catch (error) {
            console.error('Error accessing media devices:', error);
            throw error;
        }
    }

    async populateAudioDevices() {
        try {
            const devices = await window.api.getAudioDevices();
            this.audioDeviceSelect.innerHTML = devices.map(device => 
                `<option value="${device.deviceId}">${device.label || `Microphone ${devices.indexOf(device) + 1}`}</option>`
            ).join('');
        } catch (error) {
            console.error('Error populating audio devices:', error);
        }
    }

    connectToSignalingServer(roomId) {
        this.socket = io('http://localhost:3000');

        this.socket.on('connect', () => {
            console.log('Connected to signaling server');
            this.socket.emit('join-room', roomId);
        });

        this.socket.on('user-connected', (userId) => {
            console.log('User connected:', userId);
            this.connectToNewUser(userId);
        });

        this.socket.on('user-disconnected', (userId) => {
            console.log('User disconnected:', userId);
            this.removePeerConnection(userId);
        });

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
        });
    }

    async connectToNewUser(userId) {
        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        });

        this.peerConnections[userId] = peerConnection;

        // Add local stream
        this.localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, this.localStream);
        });

        // Handle incoming streams
        peerConnection.ontrack = (event) => {
            this.addParticipant(userId, event.streams[0]);
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('ice-candidate', {
                    target: userId,
                    candidate: event.candidate
                });
            }
        };

        // Create and send offer
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            this.socket.emit('offer', { target: userId, offer });
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }

    addParticipant(userId, stream) {
        const participantElement = document.createElement('div');
        participantElement.id = `participant-${userId}`;
        participantElement.className = 'participant';
        participantElement.innerHTML = `
            <span class="participant-name">User ${userId}</span>
            <audio autoplay></audio>
        `;
        this.participantsList.appendChild(participantElement);
        
        const audioElement = participantElement.querySelector('audio');
        audioElement.srcObject = stream;
    }

    removePeerConnection(userId) {
        if (this.peerConnections[userId]) {
            this.peerConnections[userId].close();
            delete this.peerConnections[userId];
        }
        
        const participantElement = document.getElementById(`participant-${userId}`);
        if (participantElement) {
            participantElement.remove();
        }
    }

    async leaveRoom() {
        if (this.socket) {
            this.socket.disconnect();
        }

        Object.values(this.peerConnections).forEach(pc => pc.close());
        this.peerConnections = {};

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        this.participantsList.innerHTML = '';
        this.currentRoom = null;
        this.joinRoomBtn.disabled = false;
        this.leaveRoomBtn.disabled = true;
    }

    toggleMute() {
        if (this.localStream) {
            this.isMuted = !this.isMuted;
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !this.isMuted;
            });
            this.muteButton.querySelector('.text').textContent = this.isMuted ? 'Unmute' : 'Mute';
        }
    }

    async changeAudioDevice(deviceId) {
        if (this.localStream) {
            try {
                const oldStream = this.localStream;
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: { deviceId: { exact: deviceId } },
                    video: false
                });

                // Update all peer connections with new stream
                Object.values(this.peerConnections).forEach(pc => {
                    const senders = pc.getSenders();
                    const audioSender = senders.find(sender => sender.track.kind === 'audio');
                    if (audioSender) {
                        audioSender.replaceTrack(this.localStream.getAudioTracks()[0]);
                    }
                });

                oldStream.getTracks().forEach(track => track.stop());
            } catch (error) {
                console.error('Error changing audio device:', error);
            }
        }
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const voiceChat = new VoiceChat();
}); 