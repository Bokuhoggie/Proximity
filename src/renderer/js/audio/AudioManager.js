// src/renderer/js/audio/AudioManager.js - Enhanced with I/O and visualizer support
export class AudioManager {
    constructor() {
        this.peerConnections = new Map();
        this.localStream = null;
        this.isMuted = false;
        this.initialized = false;
        this.audioContext = null;
        this.micSource = null;
        this.gainNode = null;
        this.analyser = null;
        this.dataArray = null;
        this.volumeCallbacks = [];
        this.persistentVisualizerActive = false;
        this.persistentVisualizerCallback = null;
        
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ];
    }

    async initialize() {
        try {
            console.log('Initializing audio...');
            
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Setup audio context for gain control and visualization
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = 1.0;
            
            // Setup analyzer for visualizer
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            this.micSource = this.audioContext.createMediaStreamSource(this.localStream);
            this.micSource.connect(this.gainNode);
            this.gainNode.connect(this.analyser);
            
            this.startVolumeAnalysis();
            
            this.initialized = true;
            console.log('Audio initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize audio:', error);
            throw new Error('Failed to access microphone: ' + error.message);
        }
    }

    startVolumeAnalysis() {
        if (!this.analyser || !this.dataArray) return;
        
        const analyze = () => {
            if (!this.initialized) return;
            
            this.analyser.getByteFrequencyData(this.dataArray);
            
            // Calculate volume level (0-100)
            const average = this.dataArray.reduce((a, b) => a + b) / this.dataArray.length;
            const volume = Math.min(100, (average / 128) * 100);
            
            // Notify all callbacks
            this.volumeCallbacks.forEach(callback => {
                try {
                    callback(volume, this.dataArray);
                } catch (error) {
                    console.error('Error in volume callback:', error);
                }
            });
            
            requestAnimationFrame(analyze);
        };
        
        analyze();
    }

    addVolumeCallback(callback) {
        this.volumeCallbacks.push(callback);
    }

    removeVolumeCallback(callback) {
        this.volumeCallbacks = this.volumeCallbacks.filter(cb => cb !== callback);
    }

    isInitialized() {
        return this.initialized;
    }

    async changeInputDevice(deviceId) {
        if (!deviceId) return;

        try {
            console.log('Changing input device to:', deviceId);
            
            // Stop current stream
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }

            // Get new stream with specific device
            const constraints = {
                audio: {
                    deviceId: { exact: deviceId },
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

            // Update audio context
            if (this.micSource) {
                this.micSource.disconnect();
            }
            this.micSource = this.audioContext.createMediaStreamSource(this.localStream);
            this.micSource.connect(this.gainNode);

            // Replace tracks in all peer connections
            this.peerConnections.forEach(pc => {
                const senders = pc.getSenders();
                const audioSender = senders.find(sender => 
                    sender.track && sender.track.kind === 'audio'
                );
                if (audioSender) {
                    audioSender.replaceTrack(this.localStream.getAudioTracks()[0]);
                }
            });

            console.log('Audio input device changed successfully');
        } catch (error) {
            console.error('Error changing audio input device:', error);
            throw error;
        }
    }

    async changeOutputDevice(deviceId) {
        try {
            console.log('Changing output device to:', deviceId);
            
            // Update all existing audio elements
            const audioElements = document.querySelectorAll('audio');
            for (const audio of audioElements) {
                if (typeof audio.setSinkId === 'function') {
                    await audio.setSinkId(deviceId);
                }
            }
            
            // Store for future audio elements
            this.currentOutputDevice = deviceId;
            
            console.log('Audio output device changed successfully');
        } catch (error) {
            console.error('Error changing audio output device:', error);
            throw error;
        }
    }

    async testOutput() {
        try {
            console.log('Testing audio output...');
            const audio = new Audio('assets/TestNoise.mp3');
            
            // Set output device if one is selected
            if (this.currentOutputDevice && typeof audio.setSinkId === 'function') {
                await audio.setSinkId(this.currentOutputDevice);
            }
            
            audio.volume = 0.5;
            await audio.play();
            
            console.log('Test audio played successfully');
        } catch (error) {
            console.error('Error playing test audio:', error);
            throw error;
        }
    }

    startPersistentVisualizer() {
        if (this.persistentVisualizerActive) return;

        this.persistentVisualizerActive = true;
        
        const micLevelFill = document.getElementById('persistentMicLevelFill');
        const volumeLevel = document.getElementById('persistentVolumeLevel');
        const micStatusText = document.getElementById('micStatusText');
        
        if (micStatusText) {
            micStatusText.textContent = 'Monitoring microphone...';
        }
        
        this.persistentVisualizerCallback = (volume, frequencyData) => {
            if (micLevelFill && volumeLevel) {
                micLevelFill.style.width = `${volume}%`;
                volumeLevel.textContent = `${Math.round(volume)}%`;
            }
        };
        
        this.addVolumeCallback(this.persistentVisualizerCallback);
    }

    stopPersistentVisualizer() {
        if (this.persistentVisualizerCallback) {
            this.removeVolumeCallback(this.persistentVisualizerCallback);
            this.persistentVisualizerCallback = null;
        }
        this.persistentVisualizerActive = false;
        
        const micLevelFill = document.getElementById('persistentMicLevelFill');
        const volumeLevel = document.getElementById('persistentVolumeLevel');
        const micStatusText = document.getElementById('micStatusText');
        
        if (micLevelFill && volumeLevel) {
            micLevelFill.style.width = '0%';
            volumeLevel.textContent = '0%';
        }
        if (micStatusText) {
            micStatusText.textContent = 'Click "Test Microphone" to start monitoring';
        }
    }

    async testMicrophone() {
        try {
            console.log('Testing microphone...');
            
            if (!this.initialized) {
                await this.initialize();
            }
            
            // Create test visualizer elements if they don't exist
            this.createMicTestVisualizer();
            
            const visualizerContainer = document.getElementById('micTestVisualizer');
            const volumeText = document.getElementById('volumeLevel');
            const levelFill = document.getElementById('micLevelFill');
            
            if (visualizerContainer) {
                visualizerContainer.style.display = 'block';
            }
            
            let testCallback = (volume, frequencyData) => {
                if (levelFill && volumeText) {
                    levelFill.style.width = `${volume}%`;
                    volumeText.textContent = `${Math.round(volume)}%`;
                }
            };
            
            this.addVolumeCallback(testCallback);
            
            setTimeout(() => {
                this.removeVolumeCallback(testCallback);
                if (visualizerContainer) {
                    visualizerContainer.style.display = 'none';
                }
            }, 10000);
            
        } catch (error) {
            console.error('Error testing microphone:', error);
            throw error;
        }
    }

    createMicTestVisualizer() {
        if (document.getElementById('micTestVisualizer')) return;
        
        const testMicrophoneBtn = document.getElementById('testMicrophone');
        if (!testMicrophoneBtn) return;
        
        const testMicContainer = testMicrophoneBtn.parentElement;
        
        const visualizerContainer = document.createElement('div');
        visualizerContainer.id = 'micTestVisualizer';
        visualizerContainer.style.cssText = `
            margin-top: 1rem;
            padding: 1rem;
            background: var(--dark-bg);
            border-radius: 8px;
            border: 1px solid var(--border);
            display: none;
        `;
        
        const visualizerTitle = document.createElement('h4');
        visualizerTitle.textContent = 'Microphone Test (10 seconds)';
        visualizerTitle.style.cssText = `
            color: var(--text-secondary);
            margin-bottom: 0.5rem;
            font-size: 0.9rem;
        `;
        
        const visualizerBar = document.createElement('div');
        visualizerBar.id = 'micLevelBar';
        visualizerBar.style.cssText = `
            width: 100%;
            height: 20px;
            background: var(--border);
            border-radius: 10px;
            overflow: hidden;
            position: relative;
        `;
        
        const visualizerFill = document.createElement('div');
        visualizerFill.id = 'micLevelFill';
        visualizerFill.style.cssText = `
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, var(--success) 0%, var(--warning) 70%, var(--danger) 100%);
            transition: width 0.1s ease;
            border-radius: 10px;
        `;
        
        const volumeText = document.createElement('span');
        volumeText.id = 'volumeLevel';
        volumeText.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 0.8rem;
            font-weight: bold;
            color: var(--text-primary);
            text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
        `;
        volumeText.textContent = '0%';
        
        visualizerBar.appendChild(visualizerFill);
        visualizerBar.appendChild(volumeText);
        visualizerContainer.appendChild(visualizerTitle);
        visualizerContainer.appendChild(visualizerBar);
        
        testMicContainer.appendChild(visualizerContainer);
    }

    async connectToUser(userId, username, userColor) {
        if (this.peerConnections.has(userId)) {
            console.log('Already connected to user:', userId);
            return;
        }

        console.log('Connecting to user:', userId, username);
        
        const peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });
        this.peerConnections.set(userId, peerConnection);

        // Add local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });
        }

        // Handle incoming stream
        peerConnection.ontrack = (event) => {
            console.log('Received remote stream from:', userId);
            const remoteStream = event.streams[0];
            
            // Create audio element
            const audioElement = document.createElement('audio');
            audioElement.autoplay = true;
            audioElement.srcObject = remoteStream;
            audioElement.volume = 1;
            audioElement.style.display = 'none';
            
            // Set output device if one is selected
            if (this.currentOutputDevice && typeof audioElement.setSinkId === 'function') {
                audioElement.setSinkId(this.currentOutputDevice).catch(console.error);
            }
            
            // Add to participant
            const participant = document.getElementById(`participant-${userId}`);
            if (participant) {
                participant.appendChild(audioElement);
            }
            
            // Notify app about the audio element for proximity calculations
            if (window.proximityApp && window.proximityApp.proximityMap) {
                window.proximityApp.proximityMap.setUserAudioElement(userId, audioElement);
            }
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && window.proximityApp) {
                window.proximityApp.connectionManager.emit('ice-candidate', {
                    target: userId,
                    candidate: event.candidate
                });
            }
        };

        // Create and send offer
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            if (window.proximityApp) {
                window.proximityApp.connectionManager.emit('offer', {
                    target: userId,
                    offer: offer
                });
            }
        } catch (error) {
            console.error('Error creating offer for user:', userId, error);
            this.peerConnections.delete(userId);
        }
    }

    async handleOffer(offer, from) {
        console.log('Handling offer from:', from);
        
        if (this.peerConnections.has(from)) {
            console.log('Connection already exists for user:', from);
            return;
        }

        const peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });
        this.peerConnections.set(from, peerConnection);

        // Add local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });
        }

        // Handle incoming stream
        peerConnection.ontrack = (event) => {
            console.log('Received remote stream from:', from);
            const remoteStream = event.streams[0];
            
            // Create audio element
            const audioElement = document.createElement('audio');
            audioElement.autoplay = true;
            audioElement.srcObject = remoteStream;
            audioElement.volume = 1;
            audioElement.style.display = 'none';
            
            // Set output device if one is selected
            if (this.currentOutputDevice && typeof audioElement.setSinkId === 'function') {
                audioElement.setSinkId(this.currentOutputDevice).catch(console.error);
            }
            
            // Add to participant
            const participant = document.getElementById(`participant-${from}`);
            if (participant) {
                participant.appendChild(audioElement);
            }
            
            // Notify proximity map
            if (window.proximityApp && window.proximityApp.proximityMap) {
                window.proximityApp.proximityMap.setUserAudioElement(from, audioElement);
            }
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && window.proximityApp) {
                window.proximityApp.connectionManager.emit('ice-candidate', {
                    target: from,
                    candidate: event.candidate
                });
            }
        };

        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            if (window.proximityApp) {
                window.proximityApp.connectionManager.emit('answer', {
                    target: from,
                    answer: answer
                });
            }
        } catch (error) {
            console.error('Error handling offer from:', from, error);
            this.peerConnections.delete(from);
        }
    }

    async handleAnswer(answer, from) {
        console.log('Handling answer from:', from);
        
        const peerConnection = this.peerConnections.get(from);
        if (!peerConnection) {
            console.warn('No peer connection found for:', from);
            return;
        }

        try {
            if (peerConnection.signalingState === 'have-local-offer') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            } else {
                console.warn(`Cannot set remote answer in state: ${peerConnection.signalingState}`);
            }
        } catch (error) {
            console.error('Error handling answer from:', from, error);
            this.disconnectFromUser(from);
        }
    }

    async handleIceCandidate(candidate, from) {
        const peerConnection = this.peerConnections.get(from);
        if (!peerConnection) {
            console.warn('No peer connection found for ICE candidate from:', from);
            return;
        }

        try {
            if (peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } else {
                // Queue candidates if remote description not set yet
                if (!peerConnection.queuedCandidates) {
                    peerConnection.queuedCandidates = [];
                }
                peerConnection.queuedCandidates.push(candidate);
            }
        } catch (error) {
            console.error('Error handling ICE candidate from:', from, error);
        }
    }

    disconnectFromUser(userId) {
        const peerConnection = this.peerConnections.get(userId);
        if (peerConnection) {
            peerConnection.close();
            this.peerConnections.delete(userId);
            console.log('Disconnected from user:', userId);
        }
    }

    disconnectAll() {
        console.log('Disconnecting from all users...');
        this.peerConnections.forEach((pc, userId) => {
            pc.close();
        });
        this.peerConnections.clear();
    }

    toggleMute() {
        if (!this.localStream) return;

        this.isMuted = !this.isMuted;
        
        this.localStream.getAudioTracks().forEach(track => {
            track.enabled = !this.isMuted;
        });

        // Update UI
        if (window.proximityApp && window.proximityApp.uiManager) {
            window.proximityApp.uiManager.updateMuteStatus(this.isMuted);
        }

        // Notify server
        if (window.proximityApp) {
            window.proximityApp.updateMicStatus(this.isMuted);
        }

        console.log('Microphone', this.isMuted ? 'muted' : 'unmuted');
    }

    setGain(value) {
        // value: 0-100, map to 0-2
        const gainValue = Math.max(0, Math.min(2, value / 50));
        if (this.gainNode) {
            this.gainNode.gain.value = gainValue;
        }
    }

    getLocalStream() {
        return this.localStream;
    }

    cleanup() {
        this.disconnectAll();
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }

        this.initialized = false;
    }
}