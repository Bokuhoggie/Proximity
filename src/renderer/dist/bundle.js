/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/renderer/js/audio/AudioManager.js":
/*!***********************************************!*\
  !*** ./src/renderer/js/audio/AudioManager.js ***!
  \***********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   AudioManager: () => (/* binding */ AudioManager)
/* harmony export */ });
// src/renderer/js/audio/AudioManager.js - Enhanced with device lock and join/leave sounds
class AudioManager {
    constructor() {
        this.peerConnections = new Map();
        this.localStream = null;
        this.isMuted = false;
        this.initialized = false;
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.volumeCallbacks = [];
        this.persistentVisualizerActive = false;
        this.persistentVisualizerCallback = null;
        
        // Device lock settings
        this.lockedInputDevice = null;
        this.lockedOutputDevice = null;
        this.isInputLocked = false;
        this.isOutputLocked = false;
        
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ];
        
        // Load locked devices from storage
        this.loadDeviceLocks();
    }

    loadDeviceLocks() {
        try {
            const savedLocks = localStorage.getItem('proximity-device-locks');
            if (savedLocks) {
                const locks = JSON.parse(savedLocks);
                this.lockedInputDevice = locks.inputDevice;
                this.lockedOutputDevice = locks.outputDevice;
                this.isInputLocked = locks.inputLocked || false;
                this.isOutputLocked = locks.outputLocked || false;
                
                console.log('📱 Loaded device locks:', {
                    input: this.isInputLocked ? this.lockedInputDevice : 'unlocked',
                    output: this.isOutputLocked ? this.lockedOutputDevice : 'unlocked'
                });
            }
        } catch (error) {
            console.error('Error loading device locks:', error);
        }
    }

    saveDeviceLocks() {
        try {
            const locks = {
                inputDevice: this.lockedInputDevice,
                outputDevice: this.lockedOutputDevice,
                inputLocked: this.isInputLocked,
                outputLocked: this.isOutputLocked
            };
            localStorage.setItem('proximity-device-locks', JSON.stringify(locks));
            console.log('💾 Saved device locks');
        } catch (error) {
            console.error('Error saving device locks:', error);
        }
    }

    toggleInputDeviceLock(deviceId = null) {
        if (this.isInputLocked) {
            // Unlock
            this.isInputLocked = false;
            this.lockedInputDevice = null;
            console.log('🔓 Input device unlocked');
        } else {
            // Lock to current or specified device
            const currentDevice = deviceId || this.getCurrentInputDevice();
            if (currentDevice) {
                this.isInputLocked = true;
                this.lockedInputDevice = currentDevice;
                console.log('🔒 Input device locked to:', currentDevice);
            }
        }
        
        this.saveDeviceLocks();
        this.updateDeviceLockUI();
        
        if (window.proximityApp?.uiManager) {
            const status = this.isInputLocked ? 'locked' : 'unlocked';
            window.proximityApp.uiManager.showNotification(`Input device ${status}`, 'info');
        }
        
        return this.isInputLocked;
    }

    toggleOutputDeviceLock(deviceId = null) {
        if (this.isOutputLocked) {
            // Unlock
            this.isOutputLocked = false;
            this.lockedOutputDevice = null;
            console.log('🔓 Output device unlocked');
        } else {
            // Lock to current or specified device
            const currentDevice = deviceId || this.getCurrentOutputDevice();
            if (currentDevice) {
                this.isOutputLocked = true;
                this.lockedOutputDevice = currentDevice;
                console.log('🔒 Output device locked to:', currentDevice);
            }
        }
        
        this.saveDeviceLocks();
        this.updateDeviceLockUI();
        
        if (window.proximityApp?.uiManager) {
            const status = this.isOutputLocked ? 'locked' : 'unlocked';
            window.proximityApp.uiManager.showNotification(`Output device ${status}`, 'info');
        }
        
        return this.isOutputLocked;
    }

    getCurrentInputDevice() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack && audioTrack.getSettings) {
                return audioTrack.getSettings().deviceId;
            }
        }
        return null;
    }

    getCurrentOutputDevice() {
        return this.currentOutputDevice || 'default';
    }

    updateDeviceLockUI() {
        // Update input device lock button
        const inputLockBtn = document.getElementById('inputDeviceLockBtn');
        if (inputLockBtn) {
            inputLockBtn.innerHTML = this.isInputLocked ? '🔒' : '🔓';
            inputLockBtn.title = this.isInputLocked ? 'Unlock input device' : 'Lock input device';
            inputLockBtn.classList.toggle('locked', this.isInputLocked);
        }
        
        // Update output device lock button
        const outputLockBtn = document.getElementById('outputDeviceLockBtn');
        if (outputLockBtn) {
            outputLockBtn.innerHTML = this.isOutputLocked ? '🔒' : '🔓';
            outputLockBtn.title = this.isOutputLocked ? 'Unlock output device' : 'Lock output device';
            outputLockBtn.classList.toggle('locked', this.isOutputLocked);
        }
    }

    async initialize() {
        try {
            console.log('🎤 Initializing audio...');
            
            // Use locked device if available
            const constraints = {
                audio: this.isInputLocked && this.lockedInputDevice ? {
                    deviceId: { exact: this.lockedInputDevice },
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } : {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            };

            // Get microphone stream
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('✅ Microphone access granted!');
            
            // Verify we have audio tracks
            const audioTracks = this.localStream.getAudioTracks();
            console.log(`🎵 Found ${audioTracks.length} audio track(s)`);
            
            if (audioTracks.length === 0) {
                throw new Error('No audio tracks found in stream');
            }
            
            // Setup audio analysis
            this.setupAudioAnalysis();
            
            // Setup mic activity detection for map glow
            this.setupMicActivityDetection();
            
            this.initialized = true;
            console.log('🎉 Audio initialization successful!');
            
            if (window.proximityApp?.uiManager) {
                window.proximityApp.uiManager.showNotification('🎤 Microphone ready!', 'success');
            }
            
        } catch (error) {
            console.error('❌ Audio initialization failed:', error);
            this.initialized = false;
            
            let errorMessage = 'Failed to access microphone: ';
            if (error.name === 'NotAllowedError') {
                errorMessage += 'Permission denied. Please allow microphone access.';
            } else if (error.name === 'NotFoundError') {
                errorMessage += 'No microphone found.';
            } else if (error.name === 'NotReadableError') {
                errorMessage += 'Microphone is already in use.';
            } else {
                errorMessage += error.message;
            }
            
            throw new Error(errorMessage);
        }
    }

    setupAudioAnalysis() {
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Resume if suspended
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            
            // Create analyser
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            // Connect stream to analyser
            const source = this.audioContext.createMediaStreamSource(this.localStream);
            source.connect(this.analyser);
            
            // Start volume analysis
            this.startVolumeAnalysis();
            
            console.log('🔧 Audio analysis setup complete');
        } catch (error) {
            console.error('Error setting up audio analysis:', error);
        }
    }

    setupMicActivityDetection() {
        // Add callback for map glow effect
        this.addVolumeCallback((volume, frequencyData) => {
            // Trigger map glow for speaking activity
            if (volume > 15 && window.proximityApp?.proximityMap && window.proximityApp.myUserId) {
                window.proximityApp.proximityMap.setUserActivity(window.proximityApp.myUserId, true);
                
                // Clear activity after a short delay
                setTimeout(() => {
                    if (window.proximityApp?.proximityMap && window.proximityApp.myUserId) {
                        window.proximityApp.proximityMap.setUserActivity(window.proximityApp.myUserId, false);
                    }
                }, 200);
            }
        });
    }

    startVolumeAnalysis() {
        if (!this.analyser || !this.dataArray) return;
        
        const analyze = () => {
            if (!this.initialized || !this.analyser) return;
            
            this.analyser.getByteFrequencyData(this.dataArray);
            
            // Calculate volume level (0-100)
            const average = this.dataArray.reduce((a, b) => a + b) / this.dataArray.length;
            const volume = Math.min(100, (average / 128) * 100);
            
            // Notify callbacks
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
        console.log(`📊 Added volume callback, total: ${this.volumeCallbacks.length}`);
    }

    removeVolumeCallback(callback) {
        this.volumeCallbacks = this.volumeCallbacks.filter(cb => cb !== callback);
        console.log(`📊 Removed volume callback, remaining: ${this.volumeCallbacks.length}`);
    }

    isInitialized() {
        const hasStream = this.localStream && this.localStream.getAudioTracks().length > 0;
        const hasActiveTrack = hasStream && this.localStream.getAudioTracks().some(track => 
            track.readyState === 'live' && track.enabled
        );
        
        return this.initialized && hasActiveTrack;
    }

    async changeInputDevice(deviceId) {
        if (!deviceId) return;

        // Check if device is locked and prevent change
        if (this.isInputLocked && deviceId !== this.lockedInputDevice) {
            console.warn('🔒 Input device is locked, cannot change');
            if (window.proximityApp?.uiManager) {
                window.proximityApp.uiManager.showNotification('Input device is locked. Unlock to change.', 'warning');
            }
            return;
        }

        try {
            console.log('🔄 Changing input device to:', deviceId);
            
            // Stop current stream
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }

            // Get new stream
            const constraints = {
                audio: {
                    deviceId: { exact: deviceId },
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('✅ New audio stream created');

            // Reconnect to audio analysis
            this.setupAudioAnalysis();
            this.setupMicActivityDetection();

            // Replace tracks in peer connections
            const audioTrack = this.localStream.getAudioTracks()[0];
            this.peerConnections.forEach((pc, userId) => {
                const senders = pc.getSenders();
                const audioSender = senders.find(sender => 
                    sender.track && sender.track.kind === 'audio'
                );
                if (audioSender) {
                    audioSender.replaceTrack(audioTrack);
                }
            });

            console.log('🎉 Audio input device changed successfully');
        } catch (error) {
            console.error('❌ Error changing audio input device:', error);
            throw error;
        }
    }

    async changeOutputDevice(deviceId) {
        // Check if device is locked and prevent change
        if (this.isOutputLocked && deviceId !== this.lockedOutputDevice) {
            console.warn('🔒 Output device is locked, cannot change');
            if (window.proximityApp?.uiManager) {
                window.proximityApp.uiManager.showNotification('Output device is locked. Unlock to change.', 'warning');
            }
            return;
        }

        try {
            console.log('🔊 Changing output device to:', deviceId);
            
            const audioElements = document.querySelectorAll('audio');
            for (const audio of audioElements) {
                if (typeof audio.setSinkId === 'function') {
                    await audio.setSinkId(deviceId);
                }
            }
            
            this.currentOutputDevice = deviceId;
            console.log('🎉 Audio output device changed successfully');
        } catch (error) {
            console.error('❌ Error changing audio output device:', error);
            throw error;
        }
    }

    // ADDED: Join/Leave sound effects
    async playJoinSound() {
        try {
            const audio = new Audio('assets/JoinNoise.mp3');
            
            // Use locked output device if available
            if (this.isOutputLocked && this.lockedOutputDevice && typeof audio.setSinkId === 'function') {
                await audio.setSinkId(this.lockedOutputDevice);
            } else if (this.currentOutputDevice && typeof audio.setSinkId === 'function') {
                await audio.setSinkId(this.currentOutputDevice);
            }
            
            audio.volume = 0.6; // Moderate volume
            await audio.play();
            console.log('🔊 Played join sound');
        } catch (error) {
            console.warn('Could not play join sound:', error);
        }
    }

    async playLeaveSound() {
        try {
            const audio = new Audio('assets/LeaveNoise.mp3');
            
            // Use locked output device if available
            if (this.isOutputLocked && this.lockedOutputDevice && typeof audio.setSinkId === 'function') {
                await audio.setSinkId(this.lockedOutputDevice);
            } else if (this.currentOutputDevice && typeof audio.setSinkId === 'function') {
                await audio.setSinkId(this.currentOutputDevice);
            }
            
            audio.volume = 0.6; // Moderate volume
            await audio.play();
            console.log('🔊 Played leave sound');
        } catch (error) {
            console.warn('Could not play leave sound:', error);
        }
    }

    async testOutput() {
        try {
            console.log('🔊 Testing audio output...');
            
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 440;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.1);
            gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.5);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
            
            setTimeout(() => audioContext.close(), 1000);
            
        } catch (error) {
            console.error('❌ Error playing test audio:', error);
            throw error;
        }
    }

    startPersistentVisualizer() {
        if (this.persistentVisualizerActive) return;

        console.log('📊 Starting persistent visualizer...');
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
            console.log('🧪 Testing microphone...');
            
            if (!this.initialized) {
                await this.initialize();
            }
            
            // Create test visualizer if it doesn't exist
            this.createMicTestVisualizer();
            
            const visualizerContainer = document.getElementById('micTestVisualizer');
            const volumeText = document.getElementById('volumeLevel');
            const levelFill = document.getElementById('micLevelFill');
            
            if (visualizerContainer) {
                visualizerContainer.style.display = 'block';
            }
            
            let maxVolumeDetected = 0;
            
            const testCallback = (volume, frequencyData) => {
                maxVolumeDetected = Math.max(maxVolumeDetected, volume);
                
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
                
                console.log('📊 Max volume detected:', maxVolumeDetected);
                if (maxVolumeDetected > 5) {
                    console.log('✅ Microphone is working!');
                } else {
                    console.warn('⚠️ Low microphone input detected');
                }
            }, 10000);
            
        } catch (error) {
            console.error('❌ Error testing microphone:', error);
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
        visualizerTitle.textContent = 'Microphone Test (10 seconds) - Speak now!';
        visualizerTitle.style.cssText = `
            color: var(--text-secondary);
            margin-bottom: 0.5rem;
            font-size: 0.9rem;
        `;
        
        const visualizerBar = document.createElement('div');
        visualizerBar.style.cssText = `
            width: 100%;
            height: 24px;
            background: var(--border);
            border-radius: 12px;
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
            border-radius: 12px;
        `;
        
        const volumeText = document.createElement('span');
        volumeText.id = 'volumeLevel';
        volumeText.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 0.85rem;
            font-weight: bold;
            color: var(--text-primary);
            text-shadow: 1px 1px 2px rgba(0,0,0,0.7);
        `;
        volumeText.textContent = '0%';
        
        visualizerBar.appendChild(visualizerFill);
        visualizerBar.appendChild(volumeText);
        visualizerContainer.appendChild(visualizerTitle);
        visualizerContainer.appendChild(visualizerBar);
        
        testMicContainer.appendChild(visualizerContainer);
    }

    async handleOffer(offer, from) {
        console.log('📥 Handling offer from:', from);
        
        const peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });
        this.peerConnections.set(from, peerConnection);

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });
        }

        peerConnection.ontrack = (event) => {
            console.log('📥 Received remote stream from:', from);
            const remoteStream = event.streams[0];
            
            const audioElement = document.createElement('audio');
            audioElement.autoplay = true;
            audioElement.srcObject = remoteStream;
            audioElement.volume = 1;
            audioElement.style.display = 'none';
            
            // Use locked output device if available
            if (this.isOutputLocked && this.lockedOutputDevice && typeof audioElement.setSinkId === 'function') {
                audioElement.setSinkId(this.lockedOutputDevice).catch(console.error);
            } else if (this.currentOutputDevice && typeof audioElement.setSinkId === 'function') {
                audioElement.setSinkId(this.currentOutputDevice).catch(console.error);
            }
            
            const participant = document.getElementById(`voice-participant-${from}-${window.proximityApp?.currentVoiceChannel?.replace('-voice', '')}`);
            if (participant) {
                participant.appendChild(audioElement);
            }
            
            if (window.proximityApp && window.proximityApp.proximityMap) {
                window.proximityApp.proximityMap.setUserAudioElement(from, audioElement);
            }
        };

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
            console.error('❌ Error handling offer:', error);
            this.peerConnections.delete(from);
        }
    }

    async handleAnswer(answer, from) {
        const peerConnection = this.peerConnections.get(from);
        if (!peerConnection) return;

        try {
            if (peerConnection.signalingState === 'have-local-offer') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            }
        } catch (error) {
            console.error('❌ Error handling answer:', error);
            this.disconnectFromUser(from);
        }
    }

    async handleIceCandidate(candidate, from) {
        const peerConnection = this.peerConnections.get(from);
        if (!peerConnection) return;

        try {
            if (peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (error) {
            console.error('❌ Error handling ICE candidate:', error);
        }
    }

    async connectToUser(userId, username, userColor) {
        if (this.peerConnections.has(userId)) return;

        console.log('🤝 Connecting to user:', userId);
        
        const peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });
        this.peerConnections.set(userId, peerConnection);

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });
        }

        peerConnection.ontrack = (event) => {
            console.log('📥 Received remote stream from:', userId);
            const remoteStream = event.streams[0];
            
            const audioElement = document.createElement('audio');
            audioElement.autoplay = true;
            audioElement.srcObject = remoteStream;
            audioElement.volume = 1;
            audioElement.style.display = 'none';
            
            // Use locked output device if available
            if (this.isOutputLocked && this.lockedOutputDevice && typeof audioElement.setSinkId === 'function') {
                audioElement.setSinkId(this.lockedOutputDevice).catch(console.error);
            } else if (this.currentOutputDevice && typeof audioElement.setSinkId === 'function') {
                audioElement.setSinkId(this.currentOutputDevice).catch(console.error);
            }
            
            const participant = document.getElementById(`voice-participant-${userId}-${window.proximityApp?.currentVoiceChannel?.replace('-voice', '')}`);
            if (participant) {
                participant.appendChild(audioElement);
            }
            
            if (window.proximityApp && window.proximityApp.proximityMap) {
                window.proximityApp.proximityMap.setUserAudioElement(userId, audioElement);
            }
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate && window.proximityApp) {
                window.proximityApp.connectionManager.emit('ice-candidate', {
                    target: userId,
                    candidate: event.candidate
                });
            }
        };

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
            console.error('❌ Error creating offer:', error);
            this.peerConnections.delete(userId);
        }
    }

    disconnectFromUser(userId) {
        const peerConnection = this.peerConnections.get(userId);
        if (peerConnection) {
            peerConnection.close();
            this.peerConnections.delete(userId);
        }
    }

    disconnectAll() {
        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();
    }

    toggleMute() {
        if (!this.localStream) return;

        this.isMuted = !this.isMuted;
        
        this.localStream.getAudioTracks().forEach(track => {
            track.enabled = !this.isMuted;
        });

        if (window.proximityApp && window.proximityApp.uiManager) {
            window.proximityApp.uiManager.updateMuteStatus(this.isMuted);
        }

        if (window.proximityApp) {
            window.proximityApp.updateMicStatus(this.isMuted);
        }
    }

    setGain(value) {
        // Simple gain control - just store the value for now
        this.gainValue = value;
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

        this.volumeCallbacks = [];
        this.initialized = false;
    }
}

/***/ }),

/***/ "./src/renderer/js/chat/ChatManager.js":
/*!*********************************************!*\
  !*** ./src/renderer/js/chat/ChatManager.js ***!
  \*********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ChatManager: () => (/* binding */ ChatManager)
/* harmony export */ });
// src/renderer/js/chat/ChatManager.js - Updated with channel support
class ChatManager {
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

/***/ }),

/***/ "./src/renderer/js/core/ConnectionManager.js":
/*!***************************************************!*\
  !*** ./src/renderer/js/core/ConnectionManager.js ***!
  \***************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ConnectionManager: () => (/* binding */ ConnectionManager)
/* harmony export */ });
// src/renderer/js/core/ConnectionManager.js - Fixed connection status updates
class ConnectionManager {
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

/***/ }),

/***/ "./src/renderer/js/proximity/ProximityMap.js":
/*!***************************************************!*\
  !*** ./src/renderer/js/proximity/ProximityMap.js ***!
  \***************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ProximityMap: () => (/* binding */ ProximityMap)
/* harmony export */ });
// src/renderer/js/proximity/ProximityMap.js - Fixed bot toggle and mini map consistency
class ProximityMap {
    constructor(canvas, app) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.app = app;
        this.users = new Map(); // userId -> {x, y, username, isSelf, audioElement}
        this.myUserId = null;
        this.proximityRange = 100;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.testBotId = null;
        this.testBotMovementInterval = null;
        this.isMinimapInstance = false; // Track if this is a minimap
        this.syncing = false; // Prevent infinite sync loops
        
        // Audio constants for proximity calculation
        this.EDGE_START = 0.75; // When edge effects begin
        this.OUTER_RANGE = 1.3; // Allow audio to continue beyond visible range
        
        this.setupEventListeners();
        this.startRenderLoop();
        this.resizeCanvas();
        
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    // Set if this is a minimap instance
    setMinimapMode(isMinimapInstance = false) {
        this.isMinimapInstance = isMinimapInstance;
    }

    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
        this.canvas.addEventListener('mouseleave', () => this.handleMouseUp());
        
        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', () => this.handleMouseUp());
    }

    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (this.myUserId && this.users.has(this.myUserId)) {
            const myUser = this.users.get(this.myUserId);
            const distance = Math.sqrt((x - myUser.x) ** 2 + (y - myUser.y) ** 2);
            
            if (distance <= 20) { // User circle radius is 20px
                this.isDragging = true;
                this.dragOffset = { x: x - myUser.x, y: y - myUser.y };
                this.canvas.style.cursor = 'grabbing';
            }
        }
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (this.isDragging && this.myUserId) {
            const newX = Math.max(20, Math.min(this.canvas.width - 20, x - this.dragOffset.x));
            const newY = Math.max(20, Math.min(this.canvas.height - 20, y - this.dragOffset.y));
            
            this.updateUserPosition(this.myUserId, newX, newY);
            this.updateAudioProximity();
            
            // Emit position update to other users and sync with other map instances
            if (this.app && this.app.sendPositionUpdate) {
                this.app.sendPositionUpdate(newX, newY);
            }
            
            // FIXED: Sync position between main map and minimap
            this.syncWithOtherMaps(this.myUserId, newX, newY);
        } else {
            // Update cursor based on hover
            let isHovering = false;
            if (this.myUserId && this.users.has(this.myUserId)) {
                const myUser = this.users.get(this.myUserId);
                const distance = Math.sqrt((x - myUser.x) ** 2 + (y - myUser.y) ** 2);
                isHovering = distance <= 20;
            }
            this.canvas.style.cursor = isHovering ? 'grab' : 'crosshair';
        }
    }

    // FIXED: Sync position between main map and minimap
    syncWithOtherMaps(userId, x, y) {
        // Don't create infinite loops
        if (this.syncing) return;
        
        // Sync with main map if this is minimap
        if (this.isMinimapInstance && window.proximityApp?.proximityMap) {
            window.proximityApp.proximityMap.syncing = true;
            window.proximityApp.proximityMap.updateUserPosition(userId, x, y);
            window.proximityApp.proximityMap.updateAudioProximity();
            setTimeout(() => {
                if (window.proximityApp?.proximityMap) {
                    window.proximityApp.proximityMap.syncing = false;
                }
            }, 10);
        }
        
        // Sync with minimap if this is main map
        if (!this.isMinimapInstance && window.proximityApp?.miniProximityMap) {
            window.proximityApp.miniProximityMap.syncing = true;
            window.proximityApp.miniProximityMap.updateUserPosition(userId, x, y);
            window.proximityApp.miniProximityMap.updateAudioProximity();
            setTimeout(() => {
                if (window.proximityApp?.miniProximityMap) {
                    window.proximityApp.miniProximityMap.syncing = false;
                }
            }, 10);
        }
    }

    handleMouseUp() {
        this.isDragging = false;
        this.canvas.style.cursor = 'crosshair';
    }

    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.handleMouseDown(mouseEvent);
    }

    handleTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.handleMouseMove(mouseEvent);
    }

    addUser(userId, username, isSelf = false, audioElement = null) {
        // Center spawn position with slight randomization
        const x = this.canvas.width / 2 + (Math.random() - 0.5) * 100;
        const y = this.canvas.height / 2 + (Math.random() - 0.5) * 100;
        
        let userColor = 'blue';
        if (isSelf && this.app && this.app.settingsManager) {
            userColor = this.app.settingsManager.get('userColor') || 'purple';
        }
        
        this.users.set(userId, {
            x,
            y,
            username: username || `User ${userId.slice(0, 4)}`,
            isSelf,
            audioElement,
            lastUpdate: Date.now(),
            color: userColor
        });

        if (isSelf) {
            this.myUserId = userId;
        }

        this.updateAudioProximity();
        
        // FIXED: Sync user addition between maps
        this.syncUserWithOtherMaps(userId, username, isSelf, audioElement, userColor);
    }

    // FIXED: Sync user operations between main map and minimap
    syncUserWithOtherMaps(userId, username, isSelf, audioElement, userColor) {
        if (this.syncing) return;
        
        const user = this.users.get(userId);
        if (!user) return;
        
        // Sync with main map if this is minimap
        if (this.isMinimapInstance && window.proximityApp?.proximityMap) {
            if (!window.proximityApp.proximityMap.users.has(userId)) {
                window.proximityApp.proximityMap.syncing = true;
                window.proximityApp.proximityMap.users.set(userId, { ...user });
                setTimeout(() => {
                    if (window.proximityApp?.proximityMap) {
                        window.proximityApp.proximityMap.syncing = false;
                    }
                }, 10);
            }
        }
        
        // Sync with minimap if this is main map
        if (!this.isMinimapInstance && window.proximityApp?.miniProximityMap) {
            if (!window.proximityApp.miniProximityMap.users.has(userId)) {
                window.proximityApp.miniProximityMap.syncing = true;
                window.proximityApp.miniProximityMap.users.set(userId, { ...user });
                setTimeout(() => {
                    if (window.proximityApp?.miniProximityMap) {
                        window.proximityApp.miniProximityMap.syncing = false;
                    }
                }, 10);
            }
        }
    }

    removeUser(userId) {
        this.users.delete(userId);
        if (this.myUserId === userId) {
            this.myUserId = null;
        }
        this.updateAudioProximity();
        
        // FIXED: Sync user removal between maps
        if (!this.syncing) {
            if (this.isMinimapInstance && window.proximityApp?.proximityMap) {
                window.proximityApp.proximityMap.syncing = true;
                window.proximityApp.proximityMap.users.delete(userId);
                setTimeout(() => {
                    if (window.proximityApp?.proximityMap) {
                        window.proximityApp.proximityMap.syncing = false;
                    }
                }, 10);
            }
            
            if (!this.isMinimapInstance && window.proximityApp?.miniProximityMap) {
                window.proximityApp.miniProximityMap.syncing = true;
                window.proximityApp.miniProximityMap.users.delete(userId);
                setTimeout(() => {
                    if (window.proximityApp?.miniProximityMap) {
                        window.proximityApp.miniProximityMap.syncing = false;
                    }
                }, 10);
            }
        }
    }

    clearUsers() {
        this.users.clear();
        this.myUserId = null;
        
        // FIXED: Sync clear operation between maps
        if (!this.syncing) {
            if (this.isMinimapInstance && window.proximityApp?.proximityMap) {
                window.proximityApp.proximityMap.syncing = true;
                window.proximityApp.proximityMap.users.clear();
                window.proximityApp.proximityMap.myUserId = null;
                setTimeout(() => {
                    if (window.proximityApp?.proximityMap) {
                        window.proximityApp.proximityMap.syncing = false;
                    }
                }, 10);
            }
            
            if (!this.isMinimapInstance && window.proximityApp?.miniProximityMap) {
                window.proximityApp.miniProximityMap.syncing = true;
                window.proximityApp.miniProximityMap.users.clear();
                window.proximityApp.miniProximityMap.myUserId = null;
                setTimeout(() => {
                    if (window.proximityApp?.miniProximityMap) {
                        window.proximityApp.miniProximityMap.syncing = false;
                    }
                }, 10);
            }
        }
    }

    updateUserPosition(userId, x, y) {
        if (this.users.has(userId)) {
            const user = this.users.get(userId);
            user.x = x;
            user.y = y;
            user.lastUpdate = Date.now();
        }
    }

    updateUserColor(userId, color) {
        if (this.users.has(userId)) {
            this.users.get(userId).color = color;
        }
    }

    setUserAudioElement(userId, audioElement) {
        if (this.users.has(userId)) {
            this.users.get(userId).audioElement = audioElement;
            this.updateAudioProximity();
        }
    }

    centerMyPosition() {
        if (!this.myUserId || !this.users.has(this.myUserId)) return;

        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        this.updateUserPosition(this.myUserId, centerX, centerY);
        this.updateAudioProximity();
        
        // Emit position update
        if (this.app && this.app.sendPositionUpdate) {
            this.app.sendPositionUpdate(centerX, centerY);
        }
        
        // FIXED: Sync center operation between maps
        this.syncWithOtherMaps(this.myUserId, centerX, centerY);
    }

    setProximityRange(range) {
        console.log('Setting proximity range to:', range);
        this.proximityRange = range;
        this.updateAudioProximity();
        
        // FIXED: Sync proximity range between maps
        if (!this.syncing) {
            if (this.isMinimapInstance && window.proximityApp?.proximityMap) {
                window.proximityApp.proximityMap.syncing = true;
                window.proximityApp.proximityMap.proximityRange = range;
                window.proximityApp.proximityMap.updateAudioProximity();
                setTimeout(() => {
                    if (window.proximityApp?.proximityMap) {
                        window.proximityApp.proximityMap.syncing = false;
                    }
                }, 10);
            }
            
            if (!this.isMinimapInstance && window.proximityApp?.miniProximityMap) {
                window.proximityApp.miniProximityMap.syncing = true;
                window.proximityApp.miniProximityMap.proximityRange = range;
                window.proximityApp.miniProximityMap.updateAudioProximity();
                setTimeout(() => {
                    if (window.proximityApp?.miniProximityMap) {
                        window.proximityApp.miniProximityMap.syncing = false;
                    }
                }, 10);
            }
        }
    }

    updateAudioProximity() {
        if (!this.myUserId || !this.users.has(this.myUserId)) return;

        const myUser = this.users.get(this.myUserId);
        
        this.users.forEach((user, userId) => {
            if (userId === this.myUserId || !user.audioElement) return;

            const distance = Math.sqrt(
                (myUser.x - user.x) ** 2 + (myUser.y - user.y) ** 2
            );

            // Calculate volume based on proximity (0 to 1)
            let volume = 0;
            
            const normalizedDistance = distance / this.proximityRange;
            
            if (normalizedDistance <= this.OUTER_RANGE) {
                if (normalizedDistance > this.EDGE_START && normalizedDistance <= 1.0) {
                    // Extra feathering at the edge
                    const edgeFactor = (1 - normalizedDistance) / (1 - this.EDGE_START);
                    volume = Math.pow(edgeFactor, 2) * 0.3;
                } else if (normalizedDistance > 1.0 && normalizedDistance <= this.OUTER_RANGE) {
                    // Extended fadeout beyond visible range
                    const fadeoutFactor = (this.OUTER_RANGE - normalizedDistance) / (this.OUTER_RANGE - 1.0);
                    volume = Math.pow(fadeoutFactor, 3) * 0.1;
                } else {
                    // Normal falloff for closer distances
                    volume = Math.max(0, 1 - normalizedDistance);
                    volume = Math.pow(volume, 0.4);
                }
            }

            // Apply volume with smoothing
            if (user.audioElement) {
                const currentVolume = user.audioElement.volume;
                const smoothedVolume = currentVolume * 0.8 + volume * 0.2;
                user.audioElement.volume = smoothedVolume;
            }
        });
    }

    startRenderLoop() {
        const render = () => {
            this.render();
            requestAnimationFrame(render);
        };
        render();
    }

    render() {
        // Clear canvas
        this.ctx.fillStyle = '#0f0f23';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid
        this.drawGrid();

        // Draw proximity ranges and users
        this.users.forEach((user, userId) => {
            if (userId === this.myUserId) {
                this.drawProximityRange(user.x, user.y, user.color);
            }
        });

        this.users.forEach((user, userId) => {
            this.drawUser(user, userId === this.myUserId);
        });

        // Draw connection lines
        if (this.myUserId && this.users.has(this.myUserId)) {
            this.drawConnectionLines();
        }
    }

    drawGrid() {
        this.ctx.strokeStyle = 'rgba(107, 70, 193, 0.1)';
        this.ctx.lineWidth = 1;
        
        const gridSize = 50;
        
        for (let x = 0; x <= this.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        
        for (let y = 0; y <= this.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }

    drawProximityRange(x, y, color = 'purple') {
        const colorMap = {
            blue: ['rgba(59,130,246,0.3)', 'rgba(59,130,246,0.08)', 'rgba(59,130,246,0.15)'],
            green: ['rgba(16,185,129,0.3)', 'rgba(16,185,129,0.08)', 'rgba(16,185,129,0.15)'],
            purple: ['rgba(139,92,246,0.3)', 'rgba(139,92,246,0.08)', 'rgba(139,92,246,0.15)'],
            red: ['rgba(239,68,68,0.3)', 'rgba(239,68,68,0.08)', 'rgba(239,68,68,0.15)'],
            orange: ['rgba(245,158,11,0.3)', 'rgba(245,158,11,0.08)', 'rgba(245,158,11,0.15)'],
            pink: ['rgba(236,72,153,0.3)', 'rgba(236,72,153,0.08)', 'rgba(236,72,153,0.15)'],
            indigo: ['rgba(99,102,241,0.3)', 'rgba(99,102,241,0.08)', 'rgba(99,102,241,0.15)'],
            cyan: ['rgba(6,182,212,0.3)', 'rgba(6,182,212,0.08)', 'rgba(6,182,212,0.15)']
        };
        
        const [strokeColor, fillColor, extendedStrokeColor] = colorMap[color] || colorMap['purple'];
        
        // Draw extended audible range (faded)
        this.ctx.strokeStyle = extendedStrokeColor;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([2, 4]);
        this.ctx.beginPath();
        this.ctx.arc(x, y, this.proximityRange * this.OUTER_RANGE, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // Draw main proximity range
        this.ctx.strokeStyle = strokeColor;
        this.ctx.fillStyle = fillColor;
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.arc(x, y, this.proximityRange, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    drawUser(user, isSelf) {
        const { x, y, username, color } = user;
        
        const colorMap = {
            blue: ['#3b82f6', '#60a5fa'],
            green: ['#10b981', '#34d399'],
            purple: ['#8b5cf6', '#a78bfa'],
            red: ['#ef4444', '#f87171'],
            orange: ['#f59e0b', '#fbbf24'],
            pink: ['#ec4899', '#f472b6'],
            indigo: ['#6366f1', '#818cf8'],
            cyan: ['#06b6d4', '#22d3ee']
        };
        
        const [fillColor, strokeColor] = colorMap[color] || colorMap['purple'];
        
        // Enhanced activity indicator with larger glow
        if (user.isActive) {
            const pulseRadius = 35 + Math.sin(Date.now() * 0.015) * 8;
            const glowColor = colorMap[color] ? colorMap[color][0] : '#8b5cf6';
            
            // Outer glow
            this.ctx.shadowColor = glowColor;
            this.ctx.shadowBlur = 20;
            this.ctx.strokeStyle = glowColor.replace(')', ', 0.4)').replace('rgb', 'rgba');
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.arc(x, y, pulseRadius, 0, Math.PI * 2);
            this.ctx.stroke();
            
            // Inner pulse
            this.ctx.shadowBlur = 10;
            this.ctx.strokeStyle = glowColor.replace(')', ', 0.6)').replace('rgb', 'rgba');
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(x, y, pulseRadius * 0.7, 0, Math.PI * 2);
            this.ctx.stroke();
            
            // Reset shadow
            this.ctx.shadowColor = 'transparent';
            this.ctx.shadowBlur = 0;
        }
        
        // Draw main user circle
        this.ctx.fillStyle = fillColor;
        this.ctx.strokeStyle = strokeColor;
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 20, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        
        // User initial/icon
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 16px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        const initial = username.charAt(0).toUpperCase();
        this.ctx.fillText(initial, x, y);
        
        // Username label
        this.ctx.fillStyle = isSelf ? strokeColor : '#cbd5e1';
        this.ctx.font = '12px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        const displayName = isSelf ? `${username} (You)` : username;
        this.ctx.fillText(displayName, x, y + 30);
    }

    drawConnectionLines() {
        if (!this.myUserId || !this.users.has(this.myUserId)) return;

        const myUser = this.users.get(this.myUserId);
        
        this.users.forEach((user, userId) => {
            if (userId === this.myUserId) return;

            const distance = Math.sqrt(
                (myUser.x - user.x) ** 2 + (myUser.y - user.y) ** 2
            );

            if (distance <= this.proximityRange) {
                const opacity = Math.max(0.1, 1 - (distance / this.proximityRange));
                this.ctx.strokeStyle = `rgba(16, 185, 129, ${opacity * 0.5})`;
                this.ctx.lineWidth = 2;
                
                this.ctx.beginPath();
                this.ctx.moveTo(myUser.x, myUser.y);
                this.ctx.lineTo(user.x, user.y);
                this.ctx.stroke();
            }
        });
    }

    // Called when user speaks to show activity
    setUserActivity(userId, isActive) {
        if (this.users.has(userId)) {
            const user = this.users.get(userId);
            user.isActive = isActive;
            
            // Create glow effect when user starts speaking
            if (isActive && userId === this.myUserId) {
                this.createUserGlowEffect(user.x, user.y, user.color);
            }
        }
    }

    createUserGlowEffect(x, y, color) {
        // Create glow element
        const glowElement = document.createElement('div');
        glowElement.className = `proximity-user-glow user-glow-${color}`;
        glowElement.style.cssText = `
            position: absolute;
            left: ${x - 40}px;
            top: ${y - 40}px;
            width: 80px;
            height: 80px;
            border-radius: 50%;
            pointer-events: none;
            z-index: 0;
        `;
        
        // Add to canvas container
        const canvasContainer = this.canvas.parentElement;
        if (canvasContainer) {
            canvasContainer.style.position = 'relative';
            canvasContainer.appendChild(glowElement);
            
            // Remove after animation completes
            setTimeout(() => {
                if (glowElement.parentElement) {
                    glowElement.parentElement.removeChild(glowElement);
                }
            }, 500);
        }
    }

    // FIXED: Test bot functionality - proper state management
    addTestBot() {
        console.log('Adding test bot...');
        
        // FIXED: Only allow one test bot per map type
        if (this.testBotId) {
            console.log('Test bot already exists, removing first...');
            this.removeTestBot();
        }

        this.testBotId = 'test-bot-' + Date.now() + (this.isMinimapInstance ? '-mini' : '-main');
        
        // Create audio element for test sound
        const audioElement = new Audio('assets/TestNoise.mp3');
        audioElement.loop = true;
        audioElement.volume = 0; // Start at 0, proximity will adjust
        
        let x, y;
        if (this.myUserId && this.users.has(this.myUserId)) {
            const myUser = this.users.get(this.myUserId);
            const angle = Math.random() * Math.PI * 2;
            const distance = this.proximityRange * 0.9; // 90% of proximity range
            
            x = myUser.x + Math.cos(angle) * distance;
            y = myUser.y + Math.sin(angle) * distance;
            
            // Ensure within canvas bounds
            x = Math.max(20, Math.min(this.canvas.width - 20, x));
            y = Math.max(20, Math.min(this.canvas.height - 20, y));
        } else {
            x = Math.random() * (this.canvas.width - 40) + 20;
            y = Math.random() * (this.canvas.height - 40) + 20;
        }
        
        this.users.set(this.testBotId, {
            x, y,
            username: 'Test Bot',
            isSelf: false,
            audioElement,
            lastUpdate: Date.now(),
            color: 'green',
            isBot: true
        });
        
        // Play the audio
        audioElement.play().catch(error => {
            console.log('Audio autoplay prevented, will work after user interaction');
        });
        
        this.updateAudioProximity();
        this.startTestBotMovement();
        
        // FIXED: Sync test bot addition with other map (only from main map)
        if (!this.isMinimapInstance) {
            this.syncTestBotWithMinimap('add');
        }
        
        console.log('Test bot added successfully');
        return this.testBotId;
    }
    
    removeTestBot() {
        console.log('Removing test bot...');
        
        if (this.testBotMovementInterval) {
            clearInterval(this.testBotMovementInterval);
            this.testBotMovementInterval = null;
        }
        
        if (this.testBotId && this.users.has(this.testBotId)) {
            const bot = this.users.get(this.testBotId);
            
            if (bot.audioElement) {
                bot.audioElement.pause();
                bot.audioElement.currentTime = 0;
                bot.audioElement.srcObject = null;
            }
            
            this.users.delete(this.testBotId);
            this.testBotId = null;
            this.updateAudioProximity();
            
            // FIXED: Sync test bot removal with other map (only from main map)
            if (!this.isMinimapInstance) {
                this.syncTestBotWithMinimap('remove');
            }
            
            console.log('Test bot removed successfully');
        }
    }

    // FIXED: Sync test bot operations between main map and minimap
    syncTestBotWithMinimap(operation) {
        if (this.syncing) return;
        
        if (operation === 'add' && window.proximityApp?.miniProximityMap) {
            const bot = this.users.get(this.testBotId);
            if (bot) {
                window.proximityApp.miniProximityMap.syncing = true;
                
                // Add bot to minimap without audio element (only main map handles audio)
                window.proximityApp.miniProximityMap.testBotId = this.testBotId;
                window.proximityApp.miniProximityMap.users.set(this.testBotId, {
                    ...bot,
                    audioElement: null // No audio for minimap
                });
                
                setTimeout(() => {
                    if (window.proximityApp?.miniProximityMap) {
                        window.proximityApp.miniProximityMap.syncing = false;
                    }
                }, 10);
            }
        } else if (operation === 'remove' && window.proximityApp?.miniProximityMap) {
            window.proximityApp.miniProximityMap.syncing = true;
            window.proximityApp.miniProximityMap.users.delete(window.proximityApp.miniProximityMap.testBotId);
            window.proximityApp.miniProximityMap.testBotId = null;
            
            setTimeout(() => {
                if (window.proximityApp?.miniProximityMap) {
                    window.proximityApp.miniProximityMap.syncing = false;
                }
            }, 10);
        }
    }
    
    startTestBotMovement() {
        if (this.testBotMovementInterval) {
            clearInterval(this.testBotMovementInterval);
        }
        
        this.testBotMovementInterval = setInterval(() => {
            if (this.testBotId && this.users.has(this.testBotId)) {
                const bot = this.users.get(this.testBotId);
                
                // Random movement direction
                const targetX = Math.random() * (this.canvas.width - 40) + 20;
                const targetY = Math.random() * (this.canvas.height - 40) + 20;
                
                // Animate the movement over 3 seconds
                const startX = bot.x;
                const startY = bot.y;
                const startTime = Date.now();
                const duration = 3000;
                
                const animateMovement = () => {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    
                    // Ease-in-out movement
                    const easing = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                    
                    bot.x = startX + (targetX - startX) * easing;
                    bot.y = startY + (targetY - startY) * easing;
                    
                    // FIXED: Sync bot position with other map during movement
                    if (!this.isMinimapInstance && window.proximityApp?.miniProximityMap) {
                        const miniBot = window.proximityApp.miniProximityMap.users.get(this.testBotId);
                        if (miniBot) {
                            miniBot.x = bot.x;
                            miniBot.y = bot.y;
                        }
                    }
                    
                    if (progress < 1) {
                        requestAnimationFrame(animateMovement);
                    }
                    
                    // Update audio proximity after each movement step
                    this.updateAudioProximity();
                };
                
                animateMovement();
                
                // Show speaking activity for half a second
                bot.isActive = true;
                setTimeout(() => {
                    if (this.testBotId && this.users.has(this.testBotId)) {
                        this.users.get(this.testBotId).isActive = false;
                    }
                }, 500);
            }
        }, 5000); // Move every 5 seconds
    }

    // Get current user positions for saving/restoring
    getUserPositions() {
        const positions = {};
        this.users.forEach((user, userId) => {
            positions[userId] = { x: user.x, y: user.y };
        });
        return positions;
    }

    // Restore user positions
    setUserPositions(positions) {
        Object.entries(positions).forEach(([userId, pos]) => {
            if (this.users.has(userId)) {
                this.updateUserPosition(userId, pos.x, pos.y);
            }
        });
        this.updateAudioProximity();
    }
}

/***/ }),

/***/ "./src/renderer/js/server/ServerManager.js":
/*!*************************************************!*\
  !*** ./src/renderer/js/server/ServerManager.js ***!
  \*************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ServerManager: () => (/* binding */ ServerManager)
/* harmony export */ });
// src/renderer/js/server/ServerManager.js
class ServerManager {
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

/***/ }),

/***/ "./src/renderer/js/settings/SettingsManager.js":
/*!*****************************************************!*\
  !*** ./src/renderer/js/settings/SettingsManager.js ***!
  \*****************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   SettingsManager: () => (/* binding */ SettingsManager)
/* harmony export */ });
// src/renderer/js/settings/SettingsManager.js
class SettingsManager {
    constructor() {
        this.settings = {
            username: '',
            userColor: 'purple',
            audioGain: 50,
            noiseSupression: true,
            echoCancellation: true,
            autoJoin: false,
            muteHotkey: 'Ctrl+M',
            deafenHotkey: 'Ctrl+D',
            audioOutputDevice: ''
        };
        this.storageKey = 'proximity-settings';
    }

    async load() {
        try {
            const savedSettings = localStorage.getItem(this.storageKey);
            if (savedSettings) {
                this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
                console.log('Settings loaded:', this.settings);
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
        
        this.applyToUI();
    }

    save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
            console.log('Settings saved');
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    get(key) {
        return this.settings[key];
    }

    set(key, value) {
        this.settings[key] = value;
        this.save();
        this.applyToUI();
    }

    update(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.save();
        this.applyToUI();
    }

    reset() {
        this.settings = {
            username: '',
            userColor: 'purple',
            audioGain: 50,
            noiseSupression: true,
            echoCancellation: true,
            autoJoin: false,
            muteHotkey: 'Ctrl+M',
            deafenHotkey: 'Ctrl+D',
            audioOutputDevice: ''
        };
        this.save();
        this.applyToUI();
    }

    applyToUI() {
        // Username
        const usernameInput = document.getElementById('username');
        if (usernameInput) {
            usernameInput.value = this.settings.username;
        }

        // Audio gain
        const audioGainSlider = document.getElementById('audioGain');
        if (audioGainSlider) {
            audioGainSlider.value = this.settings.audioGain;
            const valueDisplay = document.querySelector('.slider-value');
            if (valueDisplay) {
                valueDisplay.textContent = `${this.settings.audioGain}%`;
            }
        }

        // Checkboxes
        const noiseSupressionCheck = document.getElementById('noiseSupression');
        if (noiseSupressionCheck) {
            noiseSupressionCheck.checked = this.settings.noiseSupression;
        }

        const echoCancellationCheck = document.getElementById('echoCancellation');
        if (echoCancellationCheck) {
            echoCancellationCheck.checked = this.settings.echoCancellation;
        }

        const autoJoinCheck = document.getElementById('autoJoin');
        if (autoJoinCheck) {
            autoJoinCheck.checked = this.settings.autoJoin;
        }

        // Color picker
        const colorOptions = document.querySelectorAll('.color-option');
        colorOptions.forEach(option => {
            option.classList.remove('selected');
            if (option.dataset.color === this.settings.userColor) {
                option.classList.add('selected');
            }
        });

        // Audio output device
        const audioOutputDeviceSelect = document.getElementById('audioOutputDevice');
        if (audioOutputDeviceSelect) {
            audioOutputDeviceSelect.value = this.settings.audioOutputDevice || '';
        }

        // Apply audio gain to audio manager
        if (window.proximityApp && window.proximityApp.audioManager) {
            window.proximityApp.audioManager.setGain(this.settings.audioGain);
        }
    }
}

/***/ }),

/***/ "./src/renderer/js/ui/UIManager.js":
/*!*****************************************!*\
  !*** ./src/renderer/js/ui/UIManager.js ***!
  \*****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   UIManager: () => (/* binding */ UIManager)
/* harmony export */ });
// src/renderer/js/ui/UIManager.js - Updated with chat message delete and improved functionality
class UIManager {
    constructor() {
        this.eventHandlers = {};
        this.elements = {};
        this.currentVoiceChannel = null;
        this.currentTextChannel = 'diamond';
    }

    init() {
        this.cacheElements();
        this.setupEventListeners();
        this.addHubToServers();
        this.setupHomePageEvents();
        this.setupChannelHandlers();
    }

    cacheElements() {
        // Navigation
        this.elements.navItems = document.querySelectorAll('.nav-item');
        this.elements.pages = document.querySelectorAll('.page');
        
        // Connection status
        this.elements.connectionIndicator = document.getElementById('connectionIndicator');
        this.elements.connectionText = document.getElementById('connectionText');
        
        // Server view
        this.elements.currentServerName = document.getElementById('currentServerName');
        this.elements.participantsList = document.getElementById('participantsList');
        
        // Chat
        this.elements.chatMessages = document.getElementById('chatMessages');
        this.elements.messageInput = document.getElementById('messageInput');
        this.elements.sendMessageBtn = document.getElementById('sendMessageBtn');
        this.elements.currentChannelName = document.getElementById('currentChannelName');
        this.elements.currentChannelDescription = document.getElementById('currentChannelDescription');
        
        // Voice controls
        this.elements.muteButton = document.getElementById('muteButton');
        this.elements.mapMuteButton = document.getElementById('mapMuteButton');
        this.elements.leaveChannelBtn = document.getElementById('leaveChannelBtn');
        
        // Audio devices
        this.elements.audioDeviceSelect = document.getElementById('audioDevice');
        this.elements.audioOutputDeviceSelect = document.getElementById('audioOutputDevice');
        
        // Home page elements
        this.elements.joinHubBtn = document.getElementById('joinHubBtn');
        
        // Channel lists
        this.elements.textChannelsList = document.getElementById('textChannelsList');
        this.elements.voiceChannelsList = document.getElementById('voiceChannelsList');
    }

    setupEventListeners() {
        // Navigation
        this.elements.navItems.forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                this.switchPage(page);
                this.emit('page-change', page);
            });
        });

        // Chat - Single event listener setup
        if (this.elements.sendMessageBtn) {
            this.elements.sendMessageBtn.addEventListener('click', () => {
                this.sendChatMessage();
            });
        }

        if (this.elements.messageInput) {
            this.elements.messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendChatMessage();
                }
            });
        }

        // Voice controls
        [this.elements.muteButton, this.elements.mapMuteButton].forEach(btn => {
            if (btn) {
                btn.addEventListener('click', () => {
                    this.emit('mute-toggle');
                });
            }
        });

        // Leave button - single event listener
        if (this.elements.leaveChannelBtn) {
            this.elements.leaveChannelBtn.addEventListener('click', () => {
                console.log('Leave button clicked in UI');
                this.emit('leave-channel');
            });
        }
    }

    setupChannelHandlers() {
        // Text channel handlers
        const textChannels = document.querySelectorAll('[data-channel-type="text"]');
        textChannels.forEach(channel => {
            channel.addEventListener('click', () => {
                const channelId = channel.dataset.channelId;
                this.switchToTextChannel(channelId);
            });
        });

        // Voice channel handlers
        const voiceChannelHeaders = document.querySelectorAll('.voice-channel-header');
        voiceChannelHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const channelData = header.closest('.voice-channel').dataset;
                const channelId = channelData.channelId;
                this.toggleVoiceChannel(channelId);
            });
        });
    }

    setupHomePageEvents() {
        // Home page hub button
        if (this.elements.joinHubBtn) {
            this.elements.joinHubBtn.addEventListener('click', () => {
                console.log('Home page hub button clicked');
                this.emit('join-hub');
            });
        }
    }

    addHubToServers() {
        // Add Community Hub to My Servers section
        const myServersList = document.getElementById('myServersList');
        if (myServersList) {
            const hubServer = document.createElement('div');
            hubServer.className = 'server-item';
            hubServer.dataset.serverId = 'hub';
            hubServer.innerHTML = `
                <div class="server-icon">🏢</div>
                <span class="server-name">Community Hub</span>
            `;
            
            hubServer.addEventListener('click', () => {
                console.log('Server hub button clicked');
                this.switchPage('server-view');
                this.emit('join-hub');
            });
            
            myServersList.appendChild(hubServer);
        }
    }

    switchPage(pageName) {
        console.log('Switching to page:', pageName);
        
        // Update navigation
        this.elements.navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.page === pageName);
        });

        // Update pages
        this.elements.pages.forEach(page => {
            page.classList.toggle('active', page.id === `${pageName}-page`);
        });

        // Special hub handling
        if (pageName === 'hub') {
            document.getElementById('server-view-page').classList.add('active');
        }
    }

    showServerView(server) {
        this.switchPage('server-view');
        
        if (this.elements.currentServerName) {
            this.elements.currentServerName.textContent = server.name;
        }

        // Set up hub channels if it's the hub
        if (server.id === 'hub') {
            this.setupHubChannels();
        }
    }

    setupHubChannels() {
        // Start in diamond text channel
        this.switchToTextChannel('diamond');
        this.currentVoiceChannel = null;
    }

    switchToTextChannel(channelId) {
        console.log('Switching to text channel:', channelId);
        
        this.currentTextChannel = channelId;
        
        // Update text channel selection
        const textChannels = document.querySelectorAll('[data-channel-type="text"]');
        textChannels.forEach(channel => {
            channel.classList.toggle('active', channel.dataset.channelId === channelId);
        });
        
        // Update chat UI
        const channelNames = {
            diamond: { name: '💎 diamond', desc: 'Welcome to the diamond chat' },
            spade: { name: '♠️ spade', desc: 'Welcome to the spade chat' },
            club: { name: '♣️ club', desc: 'Welcome to the club chat' },
            heart: { name: '♥️ heart', desc: 'Welcome to the heart chat' }
        };
        
        const channelInfo = channelNames[channelId] || channelNames.diamond;
        
        if (this.elements.currentChannelName) {
            this.elements.currentChannelName.textContent = `# ${channelId}`;
        }
        if (this.elements.currentChannelDescription) {
            this.elements.currentChannelDescription.textContent = channelInfo.desc;
        }
        if (this.elements.messageInput) {
            this.elements.messageInput.placeholder = `Message #${channelId}`;
        }
        
        // Show text chat view
        this.switchToContentView('text-chat-view');
        
        // Emit channel change
        this.emit('text-channel-change', channelId);
    }

    toggleVoiceChannel(channelId) {
        console.log('Toggle voice channel:', channelId, 'Current:', this.currentVoiceChannel);
        
        if (this.currentVoiceChannel === channelId) {
            // Already in this voice channel, do nothing
            this.showNotification('Already in this voice channel', 'info');
            return;
        }
        
        // Leave current voice channel if in one
        if (this.currentVoiceChannel) {
            this.emit('leave-voice-channel', this.currentVoiceChannel);
        }
        
        // Join new voice channel
        this.currentVoiceChannel = channelId;
        this.emit('join-voice-channel', channelId);
        
        // Update voice channel UI
        this.updateVoiceChannelUI(channelId);
        
        // Update voice header but DON'T switch to voice view
        const channelNames = {
            'diamond-voice': '💎 Diamond Voice',
            'spade-voice': '♠️ Spade Voice', 
            'club-voice': '♣️ Club Voice',
            'heart-voice': '♥️ Heart Voice'
        };
        
        const voiceChannelName = document.getElementById('currentVoiceChannelName');
        if (voiceChannelName) {
            voiceChannelName.textContent = channelNames[channelId] || '🔊 Voice Channel';
        }
    }

    updateVoiceChannelUI(activeChannelId) {
        // Update voice channel header states
        const voiceChannelHeaders = document.querySelectorAll('.voice-channel-header');
        voiceChannelHeaders.forEach(header => {
            const channelData = header.closest('.voice-channel').dataset;
            header.classList.toggle('active', channelData.channelId === activeChannelId);
        });
    }

    switchToContentView(viewId) {
        document.querySelectorAll('.content-view').forEach(view => {
            view.classList.remove('active');
        });
        
        const targetView = document.getElementById(viewId);
        if (targetView) {
            targetView.classList.add('active');
        }
    }

    addVoiceParticipant(userId, username, userColor, channelId, isSelf = false) {
        // Get the specific voice channel participants container
        const channelKey = channelId.replace('-voice', '');
        const participantsContainer = document.getElementById(`voiceParticipants-${channelKey}`);
        
        if (!participantsContainer) {
            console.warn('Voice participants container not found for channel:', channelId);
            return;
        }

        // Remove existing participant if present
        this.removeVoiceParticipant(userId, channelId);

        const participant = document.createElement('div');
        participant.className = 'voice-participant';
        participant.id = `voice-participant-${userId}-${channelKey}`;
        
        const micStatus = document.createElement('div');
        micStatus.className = 'mic-status';
        
        const avatar = document.createElement('span');
        avatar.className = 'participant-avatar';
        avatar.textContent = this.getColorEmoji(userColor);
        
        const name = document.createElement('span');
        name.textContent = username;
        name.style.fontWeight = isSelf ? 'bold' : 'normal';
        
        participant.appendChild(micStatus);
        participant.appendChild(avatar);
        participant.appendChild(name);
        
        participantsContainer.appendChild(participant);
        
        console.log(`Added voice participant ${username} to ${channelId}`);
    }

    removeVoiceParticipant(userId, channelId) {
        if (channelId) {
            const channelKey = channelId.replace('-voice', '');
            const participant = document.getElementById(`voice-participant-${userId}-${channelKey}`);
            if (participant) {
                participant.remove();
            }
        } else {
            // Remove from all channels if no specific channel provided
            const allParticipants = document.querySelectorAll(`[id^="voice-participant-${userId}-"]`);
            allParticipants.forEach(p => p.remove());
        }
    }

    clearVoiceParticipants(channelId) {
        if (channelId) {
            const channelKey = channelId.replace('-voice', '');
            const participantsContainer = document.getElementById(`voiceParticipants-${channelKey}`);
            if (participantsContainer) {
                participantsContainer.innerHTML = '';
            }
        } else {
            // Clear all voice channels
            ['diamond', 'spade', 'club', 'heart'].forEach(channel => {
                const container = document.getElementById(`voiceParticipants-${channel}`);
                if (container) {
                    container.innerHTML = '';
                }
            });
        }
    }

    addParticipant(userId, stream, isSelf = false, username = 'Anonymous', userColor = 'purple') {
        // This is for the main voice view participants list (REMOVED - not needed)
        // We only show participants under voice channels now
        return;
    }

    removeParticipant(userId) {
        // Remove from main participants list (REMOVED - not needed)
        return;
    }

    clearParticipants() {
        // Clear main participants list (REMOVED - not needed)
        return;
    }

    updateMuteStatus(isMuted) {
        [this.elements.muteButton, this.elements.mapMuteButton].forEach(button => {
            if (button) {
                const textSpan = button.querySelector('.text');
                const iconSpan = button.querySelector('.icon');
                
                if (textSpan) textSpan.textContent = isMuted ? 'Unmute' : 'Mute';
                if (iconSpan) iconSpan.textContent = isMuted ? '🔇' : '🎤';
                
                button.classList.toggle('muted', isMuted);
            }
        });

        // Update mic status in voice participants
        const myParticipants = document.querySelectorAll(`[id*="voice-participant-${this.getUserId()}-"]`);
        myParticipants.forEach(participant => {
            const micStatus = participant.querySelector('.mic-status');
            if (micStatus) {
                micStatus.classList.toggle('muted', isMuted);
            }
        });
    }

    updateUserMicStatus(userId, isMuted) {
        // Update mic status for a specific user in voice participants
        const userParticipants = document.querySelectorAll(`[id*="voice-participant-${userId}-"]`);
        userParticipants.forEach(participant => {
            const micStatus = participant.querySelector('.mic-status');
            if (micStatus) {
                micStatus.classList.toggle('muted', isMuted);
            }
        });
    }

    updateConnectionStatus(status, text) {
        if (this.elements.connectionIndicator && this.elements.connectionText) {
            this.elements.connectionIndicator.classList.remove('online', 'offline', 'connecting');
            this.elements.connectionIndicator.classList.add(status);
            this.elements.connectionText.textContent = text;
        }
    }

    // Chat message sender
    sendChatMessage() {
        if (!this.elements.messageInput) return;
        
        const message = this.elements.messageInput.value.trim();
        if (!message) return;
        
        console.log('UI sending message:', message, 'to channel:', this.currentTextChannel);
        this.emit('send-message', { message, channel: this.currentTextChannel });
        this.elements.messageInput.value = '';
    }

    // ENHANCED: Add chat message with delete functionality
    addChatMessage(messageData) {
        if (!this.elements.chatMessages) return;

        const messageElement = document.createElement('div');
        messageElement.className = 'message';
        messageElement.id = `message-${messageData.id}`;

        const messageHeader = document.createElement('div');
        messageHeader.className = 'message-header';

        const author = document.createElement('span');
        author.className = 'message-author';
        author.textContent = messageData.username;

        const time = document.createElement('span');
        time.className = 'message-timestamp';
        time.textContent = new Date(messageData.timestamp).toLocaleTimeString();

        messageHeader.appendChild(author);
        messageHeader.appendChild(time);

        const content = document.createElement('div');
        content.className = 'message-content';
        content.textContent = messageData.message;

        // Add delete button for own messages
        const isOwnMessage = messageData.userId === this.getUserId();
        if (isOwnMessage) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'message-delete-btn';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.title = 'Delete message';
            deleteBtn.style.display = 'none'; // Hidden by default
            
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showDeleteConfirmation(messageData.id);
            });
            
            messageElement.appendChild(deleteBtn);
            
            // Show delete button on hover
            messageElement.addEventListener('mouseenter', () => {
                deleteBtn.style.display = 'block';
            });
            
            messageElement.addEventListener('mouseleave', () => {
                deleteBtn.style.display = 'none';
            });
        }

        messageElement.appendChild(messageHeader);
        messageElement.appendChild(content);

        this.elements.chatMessages.appendChild(messageElement);
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }

    showDeleteConfirmation(messageId) {
        const confirmed = confirm('Do you want to delete this message?');
        if (confirmed) {
            this.emit('delete-message', messageId);
        }
    }

    removeChatMessage(messageId) {
        const messageElement = document.getElementById(`message-${messageId}`);
        if (messageElement) {
            messageElement.remove();
        }
    }

    async populateAudioDevices() {
        if (!this.elements.audioDeviceSelect || !this.elements.audioOutputDeviceSelect) return;
        
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');
            const audioOutputs = devices.filter(device => device.kind === 'audiooutput');

            this.elements.audioDeviceSelect.innerHTML = '<option value="">Select Audio Device</option>';
            this.elements.audioOutputDeviceSelect.innerHTML = '<option value="">Select Output Device</option>';

            audioInputs.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Microphone ${index + 1}`;
                this.elements.audioDeviceSelect.appendChild(option);
            });

            audioOutputs.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Speaker ${index + 1}`;
                this.elements.audioOutputDeviceSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error populating audio devices:', error);
        }
    }

    showNotification(message, type = 'info') {
        console.log(`Notification [${type}]: ${message}`);
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '12px 20px',
            borderRadius: '8px',
            color: 'white',
            fontWeight: '500',
            zIndex: '9999',
            opacity: '0',
            transform: 'translateX(100%)',
            transition: 'all 0.3s ease'
        });
        
        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#6b46c1'
        };
        notification.style.backgroundColor = colors[type] || colors.info;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 10);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    getColorEmoji(color) {
        const colorEmojis = {
            blue: '🔵',
            green: '🟢', 
            purple: '🟣',
            red: '🔴',
            orange: '🟠',
            pink: '🩷',
            indigo: '💜',
            cyan: '🔹'
        };
        return colorEmojis[color] || colorEmojis['purple'];
    }

    getUserId() {
        return window.proximityApp ? window.proximityApp.myUserId : null;
    }

    getCurrentVoiceChannel() {
        return this.currentVoiceChannel;
    }

    getCurrentTextChannel() {
        return this.currentTextChannel;
    }

    // Event system
    on(event, callback) {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(callback);
    }

    emit(event, data) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach(callback => callback(data));
        }
    }
}

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!********************************!*\
  !*** ./src/renderer/js/app.js ***!
  \********************************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _core_ConnectionManager_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./core/ConnectionManager.js */ "./src/renderer/js/core/ConnectionManager.js");
/* harmony import */ var _ui_UIManager_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./ui/UIManager.js */ "./src/renderer/js/ui/UIManager.js");
/* harmony import */ var _audio_AudioManager_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./audio/AudioManager.js */ "./src/renderer/js/audio/AudioManager.js");
/* harmony import */ var _proximity_ProximityMap_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./proximity/ProximityMap.js */ "./src/renderer/js/proximity/ProximityMap.js");
/* harmony import */ var _server_ServerManager_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./server/ServerManager.js */ "./src/renderer/js/server/ServerManager.js");
/* harmony import */ var _chat_ChatManager_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./chat/ChatManager.js */ "./src/renderer/js/chat/ChatManager.js");
/* harmony import */ var _settings_SettingsManager_js__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./settings/SettingsManager.js */ "./src/renderer/js/settings/SettingsManager.js");
// src/renderer/js/app.js - Fixed navigation and channel persistence








// Try Railway first, fallback to localhost for development
const SERVER_URL = 'https://myserver2-production.up.railway.app';
const FALLBACK_URL = 'http://localhost:3000';

class ProximityApp {
    constructor() {
        console.log('ProximityApp initializing...');
        
        // Core managers
        this.connectionManager = new _core_ConnectionManager_js__WEBPACK_IMPORTED_MODULE_0__.ConnectionManager(SERVER_URL);
        this.uiManager = new _ui_UIManager_js__WEBPACK_IMPORTED_MODULE_1__.UIManager();
        this.audioManager = new _audio_AudioManager_js__WEBPACK_IMPORTED_MODULE_2__.AudioManager();
        this.settingsManager = new _settings_SettingsManager_js__WEBPACK_IMPORTED_MODULE_6__.SettingsManager();
        this.serverManager = new _server_ServerManager_js__WEBPACK_IMPORTED_MODULE_4__.ServerManager();
        this.chatManager = new _chat_ChatManager_js__WEBPACK_IMPORTED_MODULE_5__.ChatManager();
        this.proximityMap = null;
        this.miniProximityMap = null;
        
        // State
        this.currentServer = null;
        this.currentTextChannel = 'diamond';
        this.currentVoiceChannel = null;
        this.myUserId = null;
        this.isInHub = false;
        this.hubUsers = [];
        
        // Global chat message storage (persistent across sessions)
        this.globalChatHistory = this.loadGlobalChatHistory();
        
        this.init();
    }

    loadGlobalChatHistory() {
        try {
            const saved = localStorage.getItem('proximity-chat-history');
            return saved ? JSON.parse(saved) : {
                diamond: [],
                spade: [],
                club: [],
                heart: []
            };
        } catch (error) {
            console.error('Failed to load chat history:', error);
            return {
                diamond: [],
                spade: [],
                club: [],
                heart: []
            };
        }
    }

    saveGlobalChatHistory() {
        try {
            localStorage.setItem('proximity-chat-history', JSON.stringify(this.globalChatHistory));
        } catch (error) {
            console.error('Failed to save chat history:', error);
        }
    }

    async init() {
        try {
            // Initialize settings first
            await this.settingsManager.load();
            
            // Initialize UI
            this.uiManager.init();
            this.setupEventListeners();
            
            // Initialize proximity map
            this.proximityMap = new _proximity_ProximityMap_js__WEBPACK_IMPORTED_MODULE_3__.ProximityMap(
                document.getElementById('proximityMap'), 
                this
            );
            
            // Setup map controls
            this.setupMapControls();
            
            // Setup settings controls
            this.setupSettingsControls();
            
            // Setup map buttons for voice channels
            this.setupMapButtons();
            
            // Setup mini map modal
            this.setupMiniMapModal();
            
            // Try to connect to server with fallback
            await this.connectWithFallback();
            
            console.log('ProximityApp initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.uiManager.showNotification('Failed to initialize app', 'error');
        }
    }

    async connectWithFallback() {
        try {
            await this.connectionManager.connect();
            this.myUserId = this.connectionManager.socket.id;
            this.setupConnectionHandlers();
        } catch (error) {
            console.warn('Railway server failed, trying localhost...', error);
            try {
                this.connectionManager = new _core_ConnectionManager_js__WEBPACK_IMPORTED_MODULE_0__.ConnectionManager(FALLBACK_URL);
                await this.connectionManager.connect();
                this.myUserId = this.connectionManager.socket.id;
                this.setupConnectionHandlers();
                this.uiManager.showNotification('Connected to local server', 'warning');
            } catch (fallbackError) {
                console.error('Both servers failed:', fallbackError);
                this.uiManager.showNotification('Could not connect to any server', 'error');
            }
        }
    }

    setupEventListeners() {
        // Navigation - FIXED: Don't leave voice channel when switching pages
        this.uiManager.on('page-change', (page) => this.handlePageChange(page));
        this.uiManager.on('join-hub', () => this.joinHub());
        this.uiManager.on('leave-channel', () => this.leaveCurrentChannel());
        this.uiManager.on('mute-toggle', () => this.audioManager.toggleMute());
        
        // Channel events
        this.uiManager.on('text-channel-change', (channelId) => this.switchTextChannel(channelId));
        this.uiManager.on('join-voice-channel', (channelId) => this.joinVoiceChannel(channelId));
        this.uiManager.on('leave-voice-channel', (channelId) => this.leaveVoiceChannel(channelId));
        
        // Chat events
        this.uiManager.on('send-message', (data) => {
            console.log('App received send-message event:', data);
            this.sendChatMessage(data.message, data.channel);
        });
        
        this.uiManager.on('delete-message', (messageId) => this.deleteMessage(messageId));
        
        // Settings
        this.uiManager.on('settings-change', (settings) => this.settingsManager.update(settings));
    }

    setupMiniMapModal() {
        // Create mini map modal
        const modalHTML = `
            <div id="miniMapModal" class="mini-map-modal" style="display: none;">
                <div class="mini-map-content">
                    <div class="mini-map-header">
                        <h4>Channel Map</h4>
                        <button id="closeMiniMap" class="close-btn">×</button>
                    </div>
                    <canvas id="miniProximityMap" width="400" height="300"></canvas>
                    <div class="mini-map-controls">
                        <div class="proximity-info">
                            <span>Range: <span id="miniProximityRange">100px</span></span>
                            <input type="range" id="miniProximitySlider" min="50" max="300" value="100" class="proximity-slider">
                        </div>
                        <button id="miniCenterBtn" class="btn secondary">Center</button>
                        <button id="miniToggleTestBot" class="btn secondary">
                            <span class="icon">🤖</span>
                            <span class="text">Add Test Bot</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Setup mini map controls
        const closeMiniMap = document.getElementById('closeMiniMap');
        const miniProximitySlider = document.getElementById('miniProximitySlider');
        const miniProximityRange = document.getElementById('miniProximityRange');
        const miniCenterBtn = document.getElementById('miniCenterBtn');
        const miniToggleTestBot = document.getElementById('miniToggleTestBot');
        
        if (closeMiniMap) {
            closeMiniMap.addEventListener('click', () => this.closeMiniMap());
        }
        
        if (miniProximitySlider && miniProximityRange) {
            miniProximitySlider.addEventListener('input', (e) => {
                const range = parseInt(e.target.value);
                miniProximityRange.textContent = `${range}px`;
                
                // Update both maps
                if (this.proximityMap) {
                    this.proximityMap.setProximityRange(range);
                }
                if (this.miniProximityMap) {
                    this.miniProximityMap.setProximityRange(range);
                }
                
                // Sync with main slider
                const mainSlider = document.getElementById('proximitySlider');
                if (mainSlider) {
                    mainSlider.value = range;
                    document.getElementById('proximityRange').textContent = `${range}px`;
                }
            });
        }
        
        if (miniCenterBtn) {
            miniCenterBtn.addEventListener('click', () => {
                if (this.proximityMap) {
                    this.proximityMap.centerMyPosition();
                }
            });
        }
        
        // FIXED: Test bot toggle for mini map
        if (miniToggleTestBot) {
            miniToggleTestBot.addEventListener('click', () => {
                if (this.proximityMap) {
                    if (this.proximityMap.testBotId) {
                        // Remove test bot
                        this.proximityMap.removeTestBot();
                        miniToggleTestBot.innerHTML = '<span class="icon">🤖</span><span class="text">Add Test Bot</span>';
                        
                        // Update main toggle button too
                        const mainToggleBtn = document.getElementById('toggleTestBot');
                        if (mainToggleBtn) {
                            mainToggleBtn.innerHTML = '<span class="icon">🤖</span><span class="text">Add Test Bot</span>';
                        }
                        
                        this.uiManager.showNotification('Test bot removed', 'info');
                    } else {
                        // Add test bot
                        this.proximityMap.addTestBot();
                        miniToggleTestBot.innerHTML = '<span class="icon">🤖</span><span class="text">Remove Test Bot</span>';
                        
                        // Update main toggle button too
                        const mainToggleBtn = document.getElementById('toggleTestBot');
                        if (mainToggleBtn) {
                            mainToggleBtn.innerHTML = '<span class="icon">🤖</span><span class="text">Remove Test Bot</span>';
                        }
                        
                        this.uiManager.showNotification('Test bot added - move around to test proximity!', 'success');
                    }
                }
            });
        }
        
        // Click outside to close
        const modal = document.getElementById('miniMapModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeMiniMap();
                }
            });
        }
    }

    openMiniMap() {
        if (!this.currentVoiceChannel) {
            this.uiManager.showNotification('Join a voice channel first', 'warning');
            return;
        }
        
        const modal = document.getElementById('miniMapModal');
        if (modal) {
            modal.style.display = 'flex';
            
            // FIXED: Initialize mini proximity map properly
            const miniCanvas = document.getElementById('miniProximityMap');
            if (miniCanvas && this.proximityMap) {
                // Create new minimap instance
                this.miniProximityMap = new _proximity_ProximityMap_js__WEBPACK_IMPORTED_MODULE_3__.ProximityMap(miniCanvas, this);
                this.miniProximityMap.setMinimapMode(true);
                
                // Copy ALL users from main map to mini map
                this.proximityMap.users.forEach((user, userId) => {
                    // Don't copy audio elements to minimap, only main map handles audio
                    const audioElement = userId === this.proximityMap.testBotId ? null : user.audioElement;
                    
                    this.miniProximityMap.users.set(userId, {
                        x: user.x,
                        y: user.y,
                        username: user.username,
                        isSelf: user.isSelf,
                        audioElement: audioElement,
                        lastUpdate: user.lastUpdate,
                        color: user.color,
                        isBot: user.isBot || false,
                        isActive: user.isActive || false
                    });
                    
                    if (user.isSelf) {
                        this.miniProximityMap.myUserId = userId;
                    }
                });
                
                // Copy test bot state
                if (this.proximityMap.testBotId) {
                    this.miniProximityMap.testBotId = this.proximityMap.testBotId;
                    
                    // Update mini map test bot button
                    const miniToggleBtn = document.getElementById('miniToggleTestBot');
                    if (miniToggleBtn) {
                        miniToggleBtn.innerHTML = '<span class="icon">🤖</span><span class="text">Remove Test Bot</span>';
                    }
                }
                
                // Copy proximity range
                this.miniProximityMap.setProximityRange(this.proximityMap.proximityRange);
                
                // Update mini map range display
                const miniSlider = document.getElementById('miniProximitySlider');
                const miniRangeDisplay = document.getElementById('miniProximityRange');
                if (miniSlider && miniRangeDisplay) {
                    miniSlider.value = this.proximityMap.proximityRange;
                    miniRangeDisplay.textContent = `${this.proximityMap.proximityRange}px`;
                }
            }
        }
    }

    closeMiniMap() {
        const modal = document.getElementById('miniMapModal');
        if (modal) {
            modal.style.display = 'none';
        }
        
        // FIXED: Properly clean up minimap instance
        if (this.miniProximityMap) {
            // Stop any test bot movement in minimap
            if (this.miniProximityMap.testBotMovementInterval) {
                clearInterval(this.miniProximityMap.testBotMovementInterval);
            }
            
            this.miniProximityMap = null;
        }
    }

    setupMapButtons() {
        // Setup map buttons for voice channels
        const mapButtons = document.querySelectorAll('.map-button');
        mapButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent voice channel toggle
                const voiceChannel = button.dataset.voiceChannel;
                
                if (this.currentVoiceChannel !== voiceChannel) {
                    this.uiManager.showNotification('Join the voice channel first to access the map', 'warning');
                    return;
                }
                
                // Open mini map instead of switching pages
                this.openMiniMap();
            });
        });
    }

    // FIXED: Don't remove duplicate send function
    sendChatMessage(message, channel) {
        if (!message.trim()) return;

        if (!this.connectionManager.socket) {
            console.error('Not connected to server');
            return;
        }

        if (!this.isInHub) {
            console.error('Not in hub');
            return;
        }

        const username = this.settingsManager.get('username') || 'Anonymous';
        const targetChannel = channel || this.currentTextChannel;
        
        console.log('Sending chat message:', message, 'to channel:', targetChannel);

        // Create message with unique ID
        const messageData = {
            id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            roomId: 'hub',
            message: message,
            username: username,
            channel: targetChannel,
            timestamp: Date.now(),
            userId: this.myUserId
        };

        this.connectionManager.socket.emit('send-chat-message', messageData);
    }

    deleteMessage(messageId) {
        if (!this.connectionManager.socket) {
            console.error('Not connected to server');
            return;
        }

        console.log('Deleting message:', messageId);

        this.connectionManager.socket.emit('delete-chat-message', {
            messageId: messageId,
            userId: this.myUserId
        });
    }

    setupMapControls() {
        // Proximity slider
        const proximitySlider = document.getElementById('proximitySlider');
        const proximityRangeDisplay = document.getElementById('proximityRange');
        
        if (proximitySlider && proximityRangeDisplay) {
            proximitySlider.addEventListener('input', (e) => {
                const range = parseInt(e.target.value);
                proximityRangeDisplay.textContent = `${range}px`;
                if (this.proximityMap) {
                    this.proximityMap.setProximityRange(range);
                }
                // Sync with mini map slider
                const miniSlider = document.getElementById('miniProximitySlider');
                if (miniSlider) {
                    miniSlider.value = range;
                    document.getElementById('miniProximityRange').textContent = `${range}px`;
                }
            });
        }

        // Center map button
        const centerMapBtn = document.getElementById('centerMapBtn');
        if (centerMapBtn) {
            centerMapBtn.addEventListener('click', () => {
                if (this.proximityMap) {
                    this.proximityMap.centerMyPosition();
                }
            });
        }
        
        // FIXED: Test bot toggle with proper state management
        const toggleTestBotBtn = document.getElementById('toggleTestBot');
        if (toggleTestBotBtn) {
            toggleTestBotBtn.addEventListener('click', () => {
                if (this.proximityMap) {
                    if (this.proximityMap.testBotId) {
                        // Remove test bot
                        this.proximityMap.removeTestBot();
                        toggleTestBotBtn.innerHTML = '<span class="icon">🤖</span><span class="text">Add Test Bot</span>';
                        
                        // Update mini map test bot button too
                        const miniToggleBtn = document.getElementById('miniToggleTestBot');
                        if (miniToggleBtn) {
                            miniToggleBtn.innerHTML = '<span class="icon">🤖</span><span class="text">Add Test Bot</span>';
                        }
                        
                        this.uiManager.showNotification('Test bot removed', 'info');
                    } else {
                        // Add test bot
                        this.proximityMap.addTestBot();
                        toggleTestBotBtn.innerHTML = '<span class="icon">🤖</span><span class="text">Remove Test Bot</span>';
                        
                        // Update mini map test bot button too
                        const miniToggleBtn = document.getElementById('miniToggleTestBot');
                        if (miniToggleBtn) {
                            miniToggleBtn.innerHTML = '<span class="icon">🤖</span><span class="text">Remove Test Bot</span>';
                        }
                        
                        this.uiManager.showNotification('Test bot added - move around to test proximity!', 'success');
                    }
                }
            });
        }

        // Map leave channel button
        const mapLeaveChannelBtn = document.getElementById('mapLeaveChannelBtn');
        if (mapLeaveChannelBtn) {
            mapLeaveChannelBtn.addEventListener('click', () => {
                console.log('Map leave button clicked');
                this.leaveCurrentChannel();
            });
        }
    }

    setupSettingsControls() {
        // Username input
        const usernameInput = document.getElementById('username');
        if (usernameInput) {
            usernameInput.addEventListener('input', (e) => {
                this.settingsManager.set('username', e.target.value.trim());
                this.updateParticipantName();
            });
        }

        // Audio device selectors - FIXED: Prevent auto-switching on page change
        const audioDeviceSelect = document.getElementById('audioDevice');
        if (audioDeviceSelect) {
            audioDeviceSelect.addEventListener('change', (e) => {
                if (e.target.value && !this.isPopulatingDevices) {
                    this.settingsManager.set('audioInputDevice', e.target.value);
                    this.audioManager.changeInputDevice(e.target.value)
                        .then(() => this.uiManager.showNotification('Audio input device changed', 'success'))
                        .catch(() => this.uiManager.showNotification('Failed to change audio input device', 'error'));
                }
            });
        }

        const audioOutputDeviceSelect = document.getElementById('audioOutputDevice');
        if (audioOutputDeviceSelect) {
            audioOutputDeviceSelect.addEventListener('change', (e) => {
                if (e.target.value && !this.isPopulatingDevices) {
                    this.settingsManager.set('audioOutputDevice', e.target.value);
                    this.audioManager.changeOutputDevice(e.target.value)
                        .then(() => this.uiManager.showNotification('Audio output device changed', 'success'))
                        .catch(() => this.uiManager.showNotification('Failed to change audio output device', 'error'));
                }
            });
        }

        // Audio gain slider
        const audioGainSlider = document.getElementById('audioGain');
        if (audioGainSlider) {
            audioGainSlider.addEventListener('input', (e) => {
                this.settingsManager.set('audioGain', parseInt(e.target.value));
                this.audioManager.setGain(parseInt(e.target.value));
                
                const valueDisplay = document.querySelector('.slider-value');
                if (valueDisplay) {
                    valueDisplay.textContent = `${e.target.value}%`;
                }
            });
        }

        // Color picker
        const colorOptions = document.querySelectorAll('.color-option');
        colorOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                const selectedColor = e.target.dataset.color;
                colorOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                
                this.settingsManager.set('userColor', selectedColor);
                this.updateParticipantColor();
                this.uiManager.showNotification(`User color changed to ${selectedColor}`, 'success');
            });
        });

        // Checkboxes
        const noiseSupressionCheck = document.getElementById('noiseSupression');
        if (noiseSupressionCheck) {
            noiseSupressionCheck.addEventListener('change', (e) => {
                this.settingsManager.set('noiseSupression', e.target.checked);
            });
        }

        const echoCancellationCheck = document.getElementById('echoCancellation');
        if (echoCancellationCheck) {
            echoCancellationCheck.addEventListener('change', (e) => {
                this.settingsManager.set('echoCancellation', e.target.checked);
            });
        }

        const autoJoinCheck = document.getElementById('autoJoin');
        if (autoJoinCheck) {
            autoJoinCheck.addEventListener('change', (e) => {
                this.settingsManager.set('autoJoin', e.target.checked);
            });
        }

        // Test buttons
        const testMicrophoneBtn = document.getElementById('testMicrophone');
        if (testMicrophoneBtn) {
            testMicrophoneBtn.addEventListener('click', () => this.testMicrophone());
        }

        const testOutputButton = document.getElementById('testOutputButton');
        if (testOutputButton) {
            testOutputButton.addEventListener('click', () => this.testOutput());
        }

        const resetSettingsBtn = document.getElementById('resetSettings');
        if (resetSettingsBtn) {
            resetSettingsBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to reset all settings to defaults?')) {
                    this.settingsManager.reset();
                    this.uiManager.showNotification('Settings reset to defaults', 'success');
                }
            });
        }
    }

    setupConnectionHandlers() {
        const socket = this.connectionManager.socket;
        
        socket.on('connect', () => {
            console.log('Connected to server');
            this.myUserId = socket.id;
            this.uiManager.updateConnectionStatus('online', 'Connected');
            this.uiManager.showNotification('Connected to server', 'success');
        });

        socket.on('disconnect', () => {
            this.uiManager.updateConnectionStatus('offline', 'Disconnected');
            this.uiManager.showNotification('Disconnected from server', 'warning');
        });

        // Hub events
        socket.on('hub-users', (users) => {
            console.log('Hub users received:', users);
            this.handleHubUsers(users);
        });

        socket.on('user-joined-hub', (user) => {
            console.log('User joined hub:', user);
            this.uiManager.showNotification(`${user.username} joined the hub`, 'info');
            this.handleUserJoined(user);
        });

        socket.on('user-left-hub', (user) => {
            console.log('User left hub:', user);
            this.uiManager.showNotification(`${user.username} left the hub`, 'info');
            this.handleUserLeft(user);
        });

        // Voice events
        socket.on('offer', ({ offer, from }) => this.audioManager.handleOffer(offer, from));
        socket.on('answer', ({ answer, from }) => this.audioManager.handleAnswer(answer, from));
        socket.on('ice-candidate', ({ candidate, from }) => this.audioManager.handleIceCandidate(candidate, from));
        
        // Mic status events
        socket.on('user-mic-status', ({ userId, isMuted }) => {
            this.uiManager.updateUserMicStatus(userId, isMuted);
        });
        
        // Chat events - FIXED: Store messages globally and permanently
        socket.on('chat-message', (data) => {
            console.log('Chat message received:', data);
            const channel = data.channel || 'diamond';
            
            // Store message globally and permanently
            if (!this.globalChatHistory[channel]) {
                this.globalChatHistory[channel] = [];
            }
            
            const messageData = {
                id: data.id,
                username: data.username,
                message: data.message,
                timestamp: data.timestamp,
                userId: data.userId
            };
            
            this.globalChatHistory[channel].push(messageData);
            this.saveGlobalChatHistory();
            
            // Show message if it's for current channel
            if (channel === this.currentTextChannel) {
                this.uiManager.addChatMessage(messageData);
            }
        });
        
        socket.on('message-deleted', (data) => {
            console.log('Message deleted:', data);
            const { messageId, channel } = data;
            
            // Remove from global history
            if (this.globalChatHistory[channel]) {
                this.globalChatHistory[channel] = this.globalChatHistory[channel].filter(msg => msg.id !== messageId);
                this.saveGlobalChatHistory();
            }
            
            // Remove from UI if in current channel
            if (channel === this.currentTextChannel) {
                this.uiManager.removeChatMessage(messageId);
            }
        });
        
        // Position events
        socket.on('position-update', ({ userId, x, y }) => {
            if (this.proximityMap) {
                this.proximityMap.updateUserPosition(userId, x, y);
            }
            if (this.miniProximityMap) {
                this.miniProximityMap.updateUserPosition(userId, x, y);
            }
        });
    }

    async joinHub() {
        try {
            console.log('Joining hub...');
            
            const username = this.settingsManager.get('username') || 'Anonymous';
            const userColor = this.settingsManager.get('userColor') || 'purple';
            
            // Join the hub room
            this.connectionManager.socket.emit('join-hub', {
                username,
                userColor
            });
            
            this.isInHub = true;
            this.currentServer = { id: 'hub', name: 'Community Hub' };
            this.currentTextChannel = 'diamond';
            // DON'T reset voice channel - preserve it across navigation
            
            // Update UI - start in text channel
            this.uiManager.showServerView(this.currentServer);
            
            // Load persistent chat history
            this.loadChatForCurrentChannel();
            
            // Hide leave channel button initially (unless in voice)
            this.updateLeaveButtonVisibility();
            
            this.uiManager.showNotification('Joined Community Hub', 'success');
            
        } catch (error) {
            console.error('Failed to join hub:', error);
            this.uiManager.showNotification('Failed to join hub', 'error');
        }
    }

    // FIXED: Load persistent chat history when switching channels
    switchTextChannel(channelId) {
        console.log('Switching text channel to:', channelId);
        this.currentTextChannel = channelId;
        this.loadChatForCurrentChannel();
        this.chatManager.setCurrentChannel(channelId);
    }

    loadChatForCurrentChannel() {
        // Clear current chat
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = `
                <div class="welcome-message">
                    <p>Welcome to the ${this.currentTextChannel} channel!</p>
                </div>
            `;
            
            // Load persistent chat history for this channel
            if (this.globalChatHistory[this.currentTextChannel]) {
                this.globalChatHistory[this.currentTextChannel].forEach(msg => {
                    this.uiManager.addChatMessage(msg);
                });
            }
        }
    }

    async joinVoiceChannel(channelId) {
        // FIXED: Check if already in this voice channel
        if (this.currentVoiceChannel === channelId) {
            this.uiManager.showNotification('Already in this voice channel', 'info');
            return;
        }
        
        try {
            console.log('Joining voice channel:', channelId);
            
            // Initialize audio if needed with better error handling
            if (!this.audioManager.isInitialized()) {
                try {
                    await this.audioManager.initialize();
                } catch (audioError) {
                    this.uiManager.showNotification(audioError.message, 'error');
                    return;
                }
            }
            
            // Leave current voice channel if in one
            if (this.currentVoiceChannel) {
                await this.leaveVoiceChannel(this.currentVoiceChannel);
            }
            
            this.currentVoiceChannel = channelId;
            
            // Emit to server
            this.connectionManager.socket.emit('join-voice-channel', { channelId });
            
            // Add self to voice channel participants
            const username = this.settingsManager.get('username') || 'Anonymous';
            const userColor = this.settingsManager.get('userColor') || 'purple';
            
            this.uiManager.addVoiceParticipant(this.myUserId, username, userColor, channelId, true);
            
            // Add self to proximity map
            if (this.proximityMap) {
                this.proximityMap.addUser(this.myUserId, username, true);
                this.proximityMap.updateUserColor(this.myUserId, userColor);
            }
            
            // Connect to existing voice users in this channel
            this.hubUsers.forEach(user => {
                if (user.userId !== this.myUserId && user.voiceChannel === channelId) {
                    this.audioManager.connectToUser(user.userId, user.username, user.userColor);
                    this.uiManager.addVoiceParticipant(user.userId, user.username, user.userColor, channelId, false);
                }
            });
            
            // Show leave channel button now that we're in voice
            this.updateLeaveButtonVisibility();
            
            // ADDED: Play join sound
            await this.audioManager.playJoinSound();
            
            this.uiManager.showNotification(`Joined ${channelId} voice channel`, 'success');
            
        } catch (error) {
            console.error('Failed to join voice channel:', error);
            this.uiManager.showNotification('Failed to join voice channel. Please allow microphone access.', 'error');
            this.currentVoiceChannel = null;
        }
    }

    async leaveVoiceChannel(channelId) {
        console.log('Leaving voice channel:', channelId);
        
        if (this.currentVoiceChannel === channelId) {
            // ADDED: Play leave sound before disconnecting
            try {
                await this.audioManager.playLeaveSound();
            } catch (error) {
                console.warn('Could not play leave sound:', error);
            }
            
            // Emit to server
            this.connectionManager.socket.emit('leave-voice-channel', { channelId });
            
            // Disconnect from all users
            this.audioManager.disconnectAll();
            
            // Clear voice UI
            this.uiManager.removeVoiceParticipant(this.myUserId, channelId);
            
            if (this.proximityMap) {
                this.proximityMap.clearUsers();
            }
            
            this.currentVoiceChannel = null;
            
            // Hide leave channel button
            this.updateLeaveButtonVisibility();
            
            this.uiManager.showNotification(`Left ${channelId} voice channel`, 'info');
        }
    }

    setupSettingsControls() {
        // Username input
        const usernameInput = document.getElementById('username');
        if (usernameInput) {
            usernameInput.addEventListener('input', (e) => {
                this.settingsManager.set('username', e.target.value.trim());
                this.updateParticipantName();
            });
        }

        // Audio device selectors with lock functionality
        const audioDeviceSelect = document.getElementById('audioDevice');
        if (audioDeviceSelect) {
            audioDeviceSelect.addEventListener('change', (e) => {
                if (e.target.value && !this.isPopulatingDevices) {
                    this.settingsManager.set('audioInputDevice', e.target.value);
                    this.audioManager.changeInputDevice(e.target.value)
                        .then(() => this.uiManager.showNotification('Audio input device changed', 'success'))
                        .catch(() => this.uiManager.showNotification('Failed to change audio input device', 'error'));
                }
            });
        }

        const audioOutputDeviceSelect = document.getElementById('audioOutputDevice');
        if (audioOutputDeviceSelect) {
            audioOutputDeviceSelect.addEventListener('change', (e) => {
                if (e.target.value && !this.isPopulatingDevices) {
                    this.settingsManager.set('audioOutputDevice', e.target.value);
                    this.audioManager.changeOutputDevice(e.target.value)
                        .then(() => this.uiManager.showNotification('Audio output device changed', 'success'))
                        .catch(() => this.uiManager.showNotification('Failed to change audio output device', 'error'));
                }
            });
        }

        // ADDED: Device lock buttons
        this.setupDeviceLockButtons();

        // Audio gain slider
        const audioGainSlider = document.getElementById('audioGain');
        if (audioGainSlider) {
            audioGainSlider.addEventListener('input', (e) => {
                this.settingsManager.set('audioGain', parseInt(e.target.value));
                this.audioManager.setGain(parseInt(e.target.value));
                
                const valueDisplay = document.querySelector('.slider-value');
                if (valueDisplay) {
                    valueDisplay.textContent = `${e.target.value}%`;
                }
            });
        }

        // Color picker
        const colorOptions = document.querySelectorAll('.color-option');
        colorOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                const selectedColor = e.target.dataset.color;
                colorOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                
                this.settingsManager.set('userColor', selectedColor);
                this.updateParticipantColor();
                this.uiManager.showNotification(`User color changed to ${selectedColor}`, 'success');
            });
        });

        // Checkboxes
        const noiseSupressionCheck = document.getElementById('noiseSupression');
        if (noiseSupressionCheck) {
            noiseSupressionCheck.addEventListener('change', (e) => {
                this.settingsManager.set('noiseSupression', e.target.checked);
            });
        }

        const echoCancellationCheck = document.getElementById('echoCancellation');
        if (echoCancellationCheck) {
            echoCancellationCheck.addEventListener('change', (e) => {
                this.settingsManager.set('echoCancellation', e.target.checked);
            });
        }

        const autoJoinCheck = document.getElementById('autoJoin');
        if (autoJoinCheck) {
            autoJoinCheck.addEventListener('change', (e) => {
                this.settingsManager.set('autoJoin', e.target.checked);
            });
        }

        // Test buttons
        const testMicrophoneBtn = document.getElementById('testMicrophone');
        if (testMicrophoneBtn) {
            testMicrophoneBtn.addEventListener('click', () => this.testMicrophone());
        }

        const testOutputButton = document.getElementById('testOutputButton');
        if (testOutputButton) {
            testOutputButton.addEventListener('click', () => this.testOutput());
        }

        const resetSettingsBtn = document.getElementById('resetSettings');
        if (resetSettingsBtn) {
            resetSettingsBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to reset all settings to defaults?')) {
                    this.settingsManager.reset();
                    this.uiManager.showNotification('Settings reset to defaults', 'success');
                }
            });
        }
    }

    // ADDED: Device lock button setup
    setupDeviceLockButtons() {
        // Create and add input device lock button
        const audioDeviceSelect = document.getElementById('audioDevice');
        if (audioDeviceSelect && !document.getElementById('inputDeviceLockBtn')) {
            const inputLockBtn = document.createElement('button');
            inputLockBtn.id = 'inputDeviceLockBtn';
            inputLockBtn.className = 'device-lock-btn';
            inputLockBtn.innerHTML = '🔓';
            inputLockBtn.title = 'Lock input device';
            
            inputLockBtn.addEventListener('click', () => {
                const currentDevice = audioDeviceSelect.value;
                const isLocked = this.audioManager.toggleInputDeviceLock(currentDevice);
                this.audioManager.updateDeviceLockUI();
            });
            
            audioDeviceSelect.parentElement.appendChild(inputLockBtn);
        }

        // Create and add output device lock button
        const audioOutputDeviceSelect = document.getElementById('audioOutputDevice');
        if (audioOutputDeviceSelect && !document.getElementById('outputDeviceLockBtn')) {
            const outputLockBtn = document.createElement('button');
            outputLockBtn.id = 'outputDeviceLockBtn';
            outputLockBtn.className = 'device-lock-btn';
            outputLockBtn.innerHTML = '🔓';
            outputLockBtn.title = 'Lock output device';
            
            outputLockBtn.addEventListener('click', () => {
                const currentDevice = audioOutputDeviceSelect.value;
                const isLocked = this.audioManager.toggleOutputDeviceLock(currentDevice);
                this.audioManager.updateDeviceLockUI();
            });
            
            audioOutputDeviceSelect.parentElement.appendChild(outputLockBtn);
        }

        // Update UI on page load
        this.audioManager.updateDeviceLockUI();
    }

    // FIXED: Update leave button visibility based on voice channel status
    updateLeaveButtonVisibility() {
        const leaveChannelBtn = document.getElementById('leaveChannelBtn');
        const mapLeaveChannelBtn = document.getElementById('mapLeaveChannelBtn');
        
        const shouldShow = this.currentVoiceChannel !== null;
        
        if (leaveChannelBtn) {
            leaveChannelBtn.style.display = shouldShow ? 'block' : 'none';
        }
        if (mapLeaveChannelBtn) {
            mapLeaveChannelBtn.style.display = shouldShow ? 'block' : 'none';
        }
    }

    handleHubUsers(users) {
        this.hubUsers = users;
        
        // Update all voice channel participant lists
        this.updateAllVoiceChannelParticipants(users);
        
        // If in voice channel, handle connections
        if (this.currentVoiceChannel) {
            // Clear proximity map and re-add users
            if (this.proximityMap) {
                this.proximityMap.clearUsers();
                
                // Re-add self
                const username = this.settingsManager.get('username') || 'Anonymous';
                const userColor = this.settingsManager.get('userColor') || 'purple';
                this.proximityMap.addUser(this.myUserId, username, true);
                this.proximityMap.updateUserColor(this.myUserId, userColor);
            }
            
            // Add other users in the same voice channel
            users.forEach(user => {
                if (user.userId !== this.myUserId && user.voiceChannel === this.currentVoiceChannel) {
                    this.handleUserJoined(user);
                    this.audioManager.connectToUser(user.userId, user.username, user.userColor);
                }
            });
        }
    }

    updateAllVoiceChannelParticipants(users) {
        // Clear all voice channel participants first
        this.uiManager.clearVoiceParticipants();
        
        // Group users by voice channel
        const usersByChannel = {};
        users.forEach(user => {
            if (user.voiceChannel) {
                if (!usersByChannel[user.voiceChannel]) {
                    usersByChannel[user.voiceChannel] = [];
                }
                usersByChannel[user.voiceChannel].push(user);
            }
        });
        
        // Add participants to each voice channel
        Object.entries(usersByChannel).forEach(([channelId, channelUsers]) => {
            channelUsers.forEach(user => {
                this.uiManager.addVoiceParticipant(user.userId, user.username, user.userColor, channelId, false);
            });
        });
        
        // Add self to current voice channel if in one
        if (this.currentVoiceChannel) {
            const username = this.settingsManager.get('username') || 'Anonymous';
            const userColor = this.settingsManager.get('userColor') || 'purple';
            this.uiManager.addVoiceParticipant(this.myUserId, username, userColor, this.currentVoiceChannel, true);
        }
    }

    handleUserJoined(user) {
        // Add to current voice channel if they're in the same one
        if (this.currentVoiceChannel && user.voiceChannel === this.currentVoiceChannel) {
            if (this.proximityMap) {
                this.proximityMap.addUser(user.userId, user.username, false);
                this.proximityMap.updateUserColor(user.userId, user.userColor);
            }
            
            // Establish WebRTC connection
            this.audioManager.connectToUser(user.userId, user.username, user.userColor);
        }
        
        // Always add to voice channel participant list if they're in a voice channel
        if (user.voiceChannel) {
            this.uiManager.addVoiceParticipant(user.userId, user.username, user.userColor, user.voiceChannel, false);
        }
    }

    handleUserLeft(user) {
        // Remove from all UI elements
        this.uiManager.removeVoiceParticipant(user.userId);
        
        if (this.proximityMap) {
            this.proximityMap.removeUser(user.userId);
        }
        
        this.audioManager.disconnectFromUser(user.userId);
    }

    handlePageChange(page) {
        // FIXED: Don't affect voice channel when switching pages
        if (page === 'map' && this.proximityMap) {
            this.proximityMap.resizeCanvas();
        }
        
        if (page === 'settings') {
            // FIXED: Prevent device switching on page change
            this.isPopulatingDevices = true;
            this.uiManager.populateAudioDevices().then(() => {
                // Restore saved devices
                const savedInputDevice = this.settingsManager.get('audioInputDevice');
                const savedOutputDevice = this.settingsManager.get('audioOutputDevice');
                
                if (savedInputDevice) {
                    const inputSelect = document.getElementById('audioDevice');
                    if (inputSelect) inputSelect.value = savedInputDevice;
                }
                
                if (savedOutputDevice) {
                    const outputSelect = document.getElementById('audioOutputDevice');
                    if (outputSelect) outputSelect.value = savedOutputDevice;
                }
                
                this.isPopulatingDevices = false;
            });
            
            this.audioManager.startPersistentVisualizer();
        } else {
            this.audioManager.stopPersistentVisualizer();
        }
    }

    // FIXED: Leave channel functionality - only leaves voice, not hub
    leaveCurrentChannel() {
        console.log('Leave channel called, current state:', {
            isInHub: this.isInHub,
            currentVoiceChannel: this.currentVoiceChannel
        });
        
        if (!this.isInHub) {
            this.uiManager.showNotification('Not in any channel', 'warning');
            return;
        }
        
        if (this.currentVoiceChannel) {
            // Leave voice channel only
            console.log('Leaving voice channel...');
            this.leaveVoiceChannel(this.currentVoiceChannel);
            
            // Update UI to remove voice channel selection
            this.uiManager.updateVoiceChannelUI(null);
        } else {
            this.uiManager.showNotification('Not in a voice channel', 'info');
        }
    }

    updateParticipantName() {
        const newUsername = this.settingsManager.get('username') || 'Anonymous';
        
        // Update in voice participants
        if (this.currentVoiceChannel) {
            const channelKey = this.currentVoiceChannel.replace('-voice', '');
            const voiceParticipant = document.getElementById(`voice-participant-${this.myUserId}-${channelKey}`);
            if (voiceParticipant) {
                const nameSpan = voiceParticipant.querySelector('span:last-child');
                if (nameSpan) {
                    nameSpan.textContent = newUsername;
                }
            }
        }
        
        // Update in proximity map
        if (this.proximityMap && this.myUserId) {
            const user = this.proximityMap.users.get(this.myUserId);
            if (user) {
                user.username = newUsername;
            }
        }
    }

    updateParticipantColor() {
        const newColor = this.settingsManager.get('userColor');
        
        if (this.proximityMap && this.myUserId) {
            this.proximityMap.updateUserColor(this.myUserId, newColor);
        }
        
        // Update voice participant avatar
        if (this.currentVoiceChannel) {
            const channelKey = this.currentVoiceChannel.replace('-voice', '');
            const voiceParticipant = document.getElementById(`voice-participant-${this.myUserId}-${channelKey}`);
            if (voiceParticipant) {
                const avatar = voiceParticipant.querySelector('.participant-avatar');
                if (avatar) {
                    avatar.textContent = this.uiManager.getColorEmoji(newColor);
                }
            }
        }
    }

    async testMicrophone() {
        try {
            if (!this.audioManager.isInitialized()) {
                await this.audioManager.initialize();
            }
            
            await this.audioManager.testMicrophone();
            this.uiManager.showNotification('Microphone test - speak now! 🎤', 'info');
            
            setTimeout(() => {
                this.uiManager.showNotification('Microphone test complete!', 'success');
            }, 10000);
            
        } catch (error) {
            console.error('Error testing microphone:', error);
            this.uiManager.showNotification('Failed to test microphone: ' + error.message, 'error');
        }
    }

    async testOutput() {
        try {
            await this.audioManager.testOutput();
            this.uiManager.showNotification('Playing test sound...', 'info');
        } catch (error) {
            this.uiManager.showNotification('Failed to play test sound', 'error');
        }
    }

    // Public methods for other managers to use
    sendPositionUpdate(x, y) {
        if (this.connectionManager.socket && this.isInHub && this.currentVoiceChannel) {
            this.connectionManager.socket.emit('position-update', {
                roomId: this.currentVoiceChannel,
                x, y
            });
        }
    }

    updateMicStatus(isMuted) {
        if (this.connectionManager.socket && this.isInHub && this.currentVoiceChannel) {
            this.connectionManager.socket.emit('mic-status', {
                roomId: this.currentVoiceChannel,
                isMuted
            });
        }
    }
}

// Initialize app when DOM is ready
function initApp() {
    try {
        window.proximityApp = new ProximityApp();
        console.log('App initialized successfully');
    } catch (error) {
        console.error('Error initializing app:', error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
})();

/******/ })()
;
//# sourceMappingURL=bundle.js.map