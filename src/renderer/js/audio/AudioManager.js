// src/renderer/js/audio/AudioManager.js - Enhanced with device lock and join/leave sounds
export class AudioManager {
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
            
            // Get the saved input device from settings
            const savedInputDevice = window.proximityApp?.settingsManager.get('audioInputDevice');

            // Determine the device to use: locked > saved > default
            let deviceId = null;
            if (this.isInputLocked && this.lockedInputDevice) {
                deviceId = this.lockedInputDevice;
                console.log('Using locked input device:', deviceId);
            } else if (savedInputDevice) {
                deviceId = savedInputDevice;
                console.log('Using saved input device:', deviceId);
            }

            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            };

            if (deviceId) {
                constraints.audio.deviceId = { exact: deviceId };
            }

            // Get microphone stream
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (error) {
                if (deviceId) {
                    console.warn('Failed to get preferred audio device, trying default device...');
                    delete constraints.audio.deviceId;
                    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
                } else {
                    throw error;
                }
            }
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
            console.log('🔊 Testing audio output on device:', this.currentOutputDevice || 'default');

            // Use audio element instead of AudioContext so we can setSinkId
            const audio = new Audio();

            // Create a simple beep using data URI
            const beepDataURI = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBi6Dzv7ZjjgJGWS57OiVUw0MUKXh8bllHgU2j9XwzH0vBSN1xPDdj0EJE12y6OyrWBIMRp7f8r5uIQYug83+2Y44CRlkuezolVMNDFCl4fG5ZR4FNo/V8Mx9LwUjdcTw3Y9BCRNdsujsq1gSDEae3/K+biEGLoPO/tmOOAkZZLns6JVTDQxQpeHxuWUeBTaP1fDMfS8FI3XE8N2PQQkTXbLo7KtYEgxGnt/yvm4hBi6Dzv7ZjjgJGWS57OiVUw0MUKXh8bllHgU2j9XwzH0vBSN1xPDdj0EJE12y6OyrWBIMRp7f8r5uIQYug87+2Y44CRlkuezolVMNDFCl4fG5ZR4FNo/V8Mx9LwUjdcTw3Y9BCRNdsujsq1gSDEae3/K+biEGLoPO/tmOOAkZZLns6JVTDQxQpeHxuWUeBTaP1fDMfS8FI3XE8N2PQQkTXbLo7KtYEgxGnt/yvm4hBi6Dzv7ZjjgJGWS57OiVUw0MUKXh8bllHgU2j9XwzH0vBSN1xPDdj0EJE12y6OyrWBIMRp7f8r5uIQYug87+2Y44CRlkuezolVMNDFCl4fG5ZR4FNo/V8Mx9LwUjdcTw3Y9BCRNdsujsq1gSDEae3/K+biEGLoPO/tmOOAkZZLns6JVTDQxQpeHxuWUeBTaP1fDMfS8FI3XE8N2PQQkTXbLo7KtYEgxGnt/yvm4hBi6Dzv7ZjjgJGWS57OiVUw0MUKXh8bllHgU2j9XwzH0vBSN1xPDdj0EJE12y6OyrWBIMRp7f8r5uIQYug87+2Y44CRlkuezolVMNDFCl4fG5ZR4FNo/V8Mx9LwUjdcTw3Y9BCRNdsujsq1gSDEae3/K+biEGLoPO/tmOOAkZZLns6JVTDQxQpeHxuWUeBTaP1fDMfS8FI3XE8N2PQQkTXbLo7KtYEgxGnt/yvm4hBi6Dzv7ZjjgJGWS57OiVUw0MUKXh8bllHgU2j9XwzH0vBSN1xPDdj0EJE12y6OyrWBIMRp7f8r5uIQYug87+2Y44CRlkuezolVMNDFCl4fG5ZR4FNo/V8Mx9LwUjdcTw3Y9BCRNdsujsq1gSDEae3/K+biEGLoPO/tmOOAkZZLns6JVTDQxQpeHxuWUeBTaP1fDMfS8FI3XE8N2PQQkTXbLo7KtYEgxGnt/yvm4hBi6Dzv7ZjjgJGWS57OiVUw0MUKXh8bllHgU2j9XwzH0vBSN1xPDdj0EJE12y6OyrWBIMRp7f8r5uIQYug87+';
            audio.src = beepDataURI;

            // Set the output device if available
            if (this.currentOutputDevice && typeof audio.setSinkId === 'function') {
                console.log('🔊 Setting output to:', this.currentOutputDevice);
                await audio.setSinkId(this.currentOutputDevice);
            } else {
                console.log('🔊 Using default output device');
            }

            audio.volume = 0.5;
            await audio.play();

            console.log('✅ Test sound played');
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

    async toggleMicrophoneMonitor() {
        try {
            const toggleBtn = document.getElementById('testMicrophoneToggle');
            const levelFill = document.getElementById('persistentMicLevelFill');
            const volumeLevel = document.getElementById('persistentVolumeLevel');

            if (!this.persistentVisualizerActive) {
                // Start monitoring
                console.log('🎤 Starting microphone monitor...');

                if (!this.initialized) {
                    await this.initialize();
                }

                this.persistentVisualizerActive = true;

                if (toggleBtn) {
                    toggleBtn.textContent = 'Stop Monitoring';
                    toggleBtn.classList.remove('secondary');
                    toggleBtn.classList.add('danger');
                }

                // Create callback for persistent visualizer
                this.persistentVisualizerCallback = (volume, frequencyData) => {
                    if (levelFill && volumeLevel) {
                        levelFill.style.width = `${volume}%`;
                        volumeLevel.textContent = `${Math.round(volume)}%`;
                    }
                };

                this.addVolumeCallback(this.persistentVisualizerCallback);

            } else {
                // Stop monitoring
                console.log('🛑 Stopping microphone monitor...');

                this.persistentVisualizerActive = false;

                if (toggleBtn) {
                    toggleBtn.textContent = 'Test Microphone';
                    toggleBtn.classList.remove('danger');
                    toggleBtn.classList.add('secondary');
                }

                if (this.persistentVisualizerCallback) {
                    this.removeVolumeCallback(this.persistentVisualizerCallback);
                    this.persistentVisualizerCallback = null;
                }

                // Reset visualizer
                if (levelFill && volumeLevel) {
                    levelFill.style.width = '0%';
                    volumeLevel.textContent = '0%';
                }
            }

        } catch (error) {
            console.error('❌ Error toggling microphone monitor:', error);
            this.persistentVisualizerActive = false;
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
            audioElement.id = `audio-${from}`;
            audioElement.setAttribute('data-user-id', from);
            audioElement.autoplay = true;
            audioElement.srcObject = remoteStream;
            audioElement.volume = 1.0;
            audioElement.style.display = 'none';

            // Use locked output device if available
            if (this.isOutputLocked && this.lockedOutputDevice && typeof audioElement.setSinkId === 'function') {
                audioElement.setSinkId(this.lockedOutputDevice).catch(console.error);
            } else if (this.currentOutputDevice && typeof audioElement.setSinkId === 'function') {
                audioElement.setSinkId(this.currentOutputDevice).catch(console.error);
            }

            // Always append to body to ensure audio plays
            document.body.appendChild(audioElement);

            // Also try to attach to participant div for organization
            const participant = document.getElementById(`voice-participant-${from}-${window.proximityApp?.currentVoiceChannel?.replace('-voice', '')}`);
            if (participant && !document.body.contains(audioElement)) {
                participant.appendChild(audioElement);
            }

            // Ensure audio plays (some browsers require user interaction)
            audioElement.play().catch(err => {
                console.warn('⚠️ Could not autoplay audio for', from, err);
            });

            if (window.proximityApp && window.proximityApp.proximityMap) {
                window.proximityApp.proximityMap.setUserAudioElement(from, audioElement);
            }

            console.log('🔊 Audio element created and playing for:', from);
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
        console.log('🔇 Disconnecting all audio connections');

        // Close all peer connections
        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();

        // Stop and remove all remote audio elements
        document.querySelectorAll('audio[data-user-id]').forEach(audio => {
            console.log('Stopping audio for:', audio.dataset.userId);
            audio.pause();
            audio.srcObject = null;
            audio.remove();
        });

        console.log('✅ All audio disconnected');
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