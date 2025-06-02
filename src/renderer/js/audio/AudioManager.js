// src/renderer/js/audio/AudioManager.js - ACTUALLY Fixed microphone initialization and WebRTC
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
        this.initializationAttempts = 0;
        this.maxInitAttempts = 3;
        
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ];
    }

    async initialize() {
        this.initializationAttempts++;
        
        try {
            console.log(`🎤 [ATTEMPT ${this.initializationAttempts}] Initializing audio...`);
            
            // Force close any existing audio context first
            if (this.audioContext && this.audioContext.state !== 'closed') {
                await this.audioContext.close();
                console.log('🔄 Closed existing audio context');
            }
            
            // Stop any existing stream
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    console.log('🛑 Stopping existing track:', track.label);
                    track.stop();
                });
                this.localStream = null;
            }
            
            console.log('🎯 Requesting microphone access...');
            
            // More aggressive microphone constraints
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: { ideal: 48000, min: 16000 },
                    channelCount: { ideal: 1 },
                    latency: { ideal: 0.01 },
                    volume: { ideal: 1.0 }
                },
                video: false
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('✅ Microphone access granted!');
            console.log('📊 Stream details:', {
                id: this.localStream.id,
                active: this.localStream.active,
                tracks: this.localStream.getTracks().length
            });
            
            // Verify and log all audio tracks
            const audioTracks = this.localStream.getAudioTracks();
            console.log(`🎵 Found ${audioTracks.length} audio track(s):`);
            
            if (audioTracks.length === 0) {
                throw new Error('❌ No audio tracks found in stream');
            }
            
            audioTracks.forEach((track, index) => {
                console.log(`🎵 Track ${index + 1}:`, {
                    label: track.label || 'Unknown Device',
                    enabled: track.enabled,
                    muted: track.muted,
                    readyState: track.readyState,
                    kind: track.kind,
                    constraints: track.getConstraints(),
                    settings: track.getSettings()
                });
                
                // Add event listeners to track
                track.addEventListener('ended', () => {
                    console.warn('⚠️ Audio track ended unexpectedly');
                });
                
                track.addEventListener('mute', () => {
                    console.warn('⚠️ Audio track muted');
                });
                
                track.addEventListener('unmute', () => {
                    console.log('🔊 Audio track unmuted');
                });
            });
            
            // Create new audio context with optimal settings
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContextClass({
                sampleRate: 48000,
                latencyHint: 'interactive'
            });
            
            console.log('🎛️ AudioContext created:', {
                state: this.audioContext.state,
                sampleRate: this.audioContext.sampleRate,
                baseLatency: this.audioContext.baseLatency,
                outputLatency: this.audioContext.outputLatency
            });
            
            // Resume audio context if suspended (required by browser autoplay policies)
            if (this.audioContext.state === 'suspended') {
                console.log('▶️ Resuming suspended audio context...');
                await this.audioContext.resume();
                console.log('✅ Audio context resumed, state:', this.audioContext.state);
            }
            
            // Create audio processing nodes
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.setValueAtTime(1.0, this.audioContext.currentTime);
            
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 512; // Increased for better analysis
            this.analyser.smoothingTimeConstant = 0.3; // Less smoothing for more responsive
            this.analyser.minDecibels = -90;
            this.analyser.maxDecibels = -10;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            console.log('🔧 Audio nodes created:', {
                gainValue: this.gainNode.gain.value,
                analyserFFTSize: this.analyser.fftSize,
                frequencyBinCount: this.analyser.frequencyBinCount
            });
            
            // Connect audio pipeline
            this.micSource = this.audioContext.createMediaStreamSource(this.localStream);
            this.micSource.connect(this.gainNode);
            this.gainNode.connect(this.analyser);
            
            console.log('🔗 Audio pipeline connected successfully');
            
            // Start immediate audio testing
            this.startVolumeAnalysis();
            this.testAudioInputImmediate();
            
            this.initialized = true;
            this.initializationAttempts = 0; // Reset on success
            
            console.log('🎉 Audio initialization SUCCESSFUL!');
            
            // Notify success
            if (window.proximityApp?.uiManager) {
                window.proximityApp.uiManager.showNotification('🎤 Microphone initialized successfully!', 'success');
            }
            
        } catch (error) {
            console.error(`❌ Audio initialization failed (attempt ${this.initializationAttempts}):`, error);
            
            this.initialized = false;
            
            // Try again with fallback constraints if first attempt
            if (this.initializationAttempts < this.maxInitAttempts) {
                console.log('🔄 Retrying with fallback constraints...');
                await this.delay(1000);
                return this.initializeWithFallback();
            }
            
            // Provide specific error messages
            let errorMessage = 'Failed to access microphone: ';
            
            if (error.name === 'NotAllowedError') {
                errorMessage += 'Permission denied. Please allow microphone access and try again.';
            } else if (error.name === 'NotFoundError') {
                errorMessage += 'No microphone found. Please connect a microphone and try again.';
            } else if (error.name === 'NotReadableError') {
                errorMessage += 'Microphone is already in use by another application.';
            } else if (error.name === 'OverconstrainedError') {
                errorMessage += 'Microphone constraints not supported. Trying fallback...';
                return this.initializeWithFallback();
            } else {
                errorMessage += error.message;
            }
            
            throw new Error(errorMessage);
        }
    }

    async initializeWithFallback() {
        console.log('🔄 Attempting fallback initialization...');
        
        try {
            // Very basic constraints as fallback
            const fallbackConstraints = {
                audio: true,
                video: false
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
            console.log('✅ Fallback microphone access granted!');
            
            // Setup basic audio context
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContextClass();
            
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = 1.0;
            
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            this.micSource = this.audioContext.createMediaStreamSource(this.localStream);
            this.micSource.connect(this.gainNode);
            this.gainNode.connect(this.analyser);
            
            this.startVolumeAnalysis();
            this.testAudioInputImmediate();
            
            this.initialized = true;
            console.log('🎉 Fallback audio initialization successful!');
            
            if (window.proximityApp?.uiManager) {
                window.proximityApp.uiManager.showNotification('🎤 Microphone initialized with basic settings', 'warning');
            }
            
        } catch (fallbackError) {
            console.error('❌ Fallback initialization also failed:', fallbackError);
            throw new Error('Failed to initialize microphone with any settings: ' + fallbackError.message);
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    testAudioInputImmediate() {
        console.log('🧪 Starting immediate audio input test...');
        
        if (!this.analyser || !this.dataArray) {
            console.warn('⚠️ Audio analyser not available for testing');
            return;
        }
        
        let testCount = 0;
        let maxLevel = 0;
        let totalLevel = 0;
        const maxTests = 100; // Test for ~2 seconds
        
        const testInterval = setInterval(() => {
            this.analyser.getByteFrequencyData(this.dataArray);
            
            // Calculate both frequency average and time domain
            const freqAverage = this.dataArray.reduce((a, b) => a + b) / this.dataArray.length;
            
            // Also check time domain for more accurate voice detection
            const timeDataArray = new Uint8Array(this.analyser.fftSize);
            this.analyser.getByteTimeDomainData(timeDataArray);
            
            let sum = 0;
            for (let i = 0; i < timeDataArray.length; i++) {
                const sample = (timeDataArray[i] - 128) / 128;
                sum += sample * sample;
            }
            const rms = Math.sqrt(sum / timeDataArray.length);
            const volume = rms * 100;
            
            maxLevel = Math.max(maxLevel, freqAverage, volume);
            totalLevel += freqAverage;
            
            if (testCount % 20 === 0) { // Log every 20th test
                console.log(`🎯 Audio test ${testCount}: freq=${freqAverage.toFixed(2)}, rms=${volume.toFixed(2)}, max=${maxLevel.toFixed(2)}`);
            }
            
            testCount++;
            if (testCount >= maxTests) {
                clearInterval(testInterval);
                const averageLevel = totalLevel / maxTests;
                
                console.log('📊 Audio test results:', {
                    maxLevel: maxLevel.toFixed(2),
                    averageLevel: averageLevel.toFixed(2),
                    testDuration: `${maxTests * 20}ms`,
                    verdict: maxLevel > 1 ? '✅ WORKING' : '❌ NO INPUT DETECTED'
                });
                
                if (maxLevel > 1) {
                    console.log('🎉 Microphone input is working properly!');
                } else {
                    console.warn('⚠️ No audio input detected - check microphone permissions and levels');
                }
            }
        }, 20);
    }

    startVolumeAnalysis() {
        if (!this.analyser || !this.dataArray) {
            console.warn('⚠️ Cannot start volume analysis - analyser not ready');
            return;
        }
        
        console.log('📈 Starting volume analysis...');
        
        const analyze = () => {
            if (!this.initialized || !this.analyser) return;
            
            // Get frequency data
            this.analyser.getByteFrequencyData(this.dataArray);
            
            // Calculate volume level (0-100) with better sensitivity
            const average = this.dataArray.reduce((a, b) => a + b) / this.dataArray.length;
            let volume = Math.min(100, (average / 80) * 100); // More sensitive scaling
            
            // Also calculate RMS for better voice detection
            const timeDataArray = new Uint8Array(this.analyser.fftSize);
            this.analyser.getByteTimeDomainData(timeDataArray);
            
            let rmsSum = 0;
            for (let i = 0; i < timeDataArray.length; i++) {
                const sample = (timeDataArray[i] - 128) / 128;
                rmsSum += sample * sample;
            }
            const rms = Math.sqrt(rmsSum / timeDataArray.length);
            const rmsVolume = Math.min(100, rms * 200); // Scale RMS to 0-100
            
            // Use the higher of the two methods
            volume = Math.max(volume, rmsVolume);
            
            // Notify all callbacks
            this.volumeCallbacks.forEach(callback => {
                try {
                    callback(volume, this.dataArray);
                } catch (error) {
                    console.error('💥 Error in volume callback:', error);
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
        
        console.log('🔍 Audio status check:', {
            initialized: this.initialized,
            hasStream,
            hasActiveTrack,
            contextState: this.audioContext?.state
        });
        
        return this.initialized && hasActiveTrack;
    }

    async changeInputDevice(deviceId) {
        if (!deviceId) {
            console.warn('⚠️ No device ID provided for input change');
            return;
        }

        try {
            console.log('🔄 Changing input device to:', deviceId);
            
            // Stop current stream
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    console.log('🛑 Stopping track for device change:', track.label);
                    track.stop();
                });
            }

            // Get new stream with specific device
            const constraints = {
                audio: {
                    deviceId: { exact: deviceId },
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: { ideal: 48000 },
                    channelCount: { ideal: 1 }
                }
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('✅ New audio stream created with device:', deviceId);

            // Update audio context
            if (this.micSource) {
                this.micSource.disconnect();
            }
            this.micSource = this.audioContext.createMediaStreamSource(this.localStream);
            this.micSource.connect(this.gainNode);

            // Replace tracks in all peer connections
            const audioTrack = this.localStream.getAudioTracks()[0];
            console.log(`🔄 Updating ${this.peerConnections.size} peer connections with new track`);
            
            this.peerConnections.forEach((pc, userId) => {
                const senders = pc.getSenders();
                const audioSender = senders.find(sender => 
                    sender.track && sender.track.kind === 'audio'
                );
                if (audioSender) {
                    audioSender.replaceTrack(audioTrack);
                    console.log('✅ Replaced audio track for peer:', userId);
                }
            });

            console.log('🎉 Audio input device changed successfully');
        } catch (error) {
            console.error('❌ Error changing audio input device:', error);
            throw error;
        }
    }

    async changeOutputDevice(deviceId) {
        try {
            console.log('🔊 Changing output device to:', deviceId);
            
            // Update all existing audio elements
            const audioElements = document.querySelectorAll('audio');
            console.log(`🔄 Updating ${audioElements.length} audio elements`);
            
            for (const audio of audioElements) {
                if (typeof audio.setSinkId === 'function') {
                    await audio.setSinkId(deviceId);
                    console.log('✅ Updated audio element output device');
                }
            }
            
            // Store for future audio elements
            this.currentOutputDevice = deviceId;
            
            console.log('🎉 Audio output device changed successfully');
        } catch (error) {
            console.error('❌ Error changing audio output device:', error);
            throw error;
        }
    }

    async testOutput() {
        try {
            console.log('🔊 Testing audio output...');
            
            // Create a simple test tone instead of loading a file
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 440; // A4 note
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.1);
            gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.5);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
            
            console.log('🎵 Test tone played successfully');
            
            // Clean up
            setTimeout(() => {
                audioContext.close();
            }, 1000);
            
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
                
                // Change color based on volume
                if (volume > 50) {
                    micLevelFill.style.background = 'linear-gradient(90deg, var(--warning) 0%, var(--danger) 100%)';
                } else if (volume > 20) {
                    micLevelFill.style.background = 'linear-gradient(90deg, var(--success) 0%, var(--warning) 100%)';
                } else {
                    micLevelFill.style.background = 'var(--success)';
                }
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
        
        console.log('📊 Stopped persistent visualizer');
        
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
                console.log('🔄 Initializing audio for microphone test...');
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
            
            let maxVolumeDetected = 0;
            
            let testCallback = (volume, frequencyData) => {
                maxVolumeDetected = Math.max(maxVolumeDetected, volume);
                
                if (levelFill && volumeText) {
                    levelFill.style.width = `${volume}%`;
                    volumeText.textContent = `${Math.round(volume)}%`;
                    
                    // Dynamic color based on volume
                    if (volume > 50) {
                        levelFill.style.background = 'linear-gradient(90deg, var(--warning) 0%, var(--danger) 100%)';
                    } else if (volume > 20) {
                        levelFill.style.background = 'linear-gradient(90deg, var(--success) 0%, var(--warning) 100%)';
                    } else {
                        levelFill.style.background = 'var(--success)';
                    }
                }
            };
            
            this.addVolumeCallback(testCallback);
            
            setTimeout(() => {
                this.removeVolumeCallback(testCallback);
                if (visualizerContainer) {
                    visualizerContainer.style.display = 'none';
                }
                
                // Report results
                console.log('📊 Microphone test completed. Max volume detected:', maxVolumeDetected);
                if (maxVolumeDetected > 5) {
                    console.log('✅ Microphone is working properly!');
                } else {
                    console.warn('⚠️ Low or no microphone input detected');
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
        visualizerBar.id = 'micLevelBar';
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

    async connectToUser(userId, username, userColor) {
        if (this.peerConnections.has(userId)) {
            console.log('🔗 Already connected to user:', userId);
            return;
        }

        console.log('🤝 Connecting to user:', userId, username);
        
        const peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });
        this.peerConnections.set(userId, peerConnection);

        // Add local stream
        if (this.localStream && this.isInitialized()) {
            const audioTracks = this.localStream.getAudioTracks();
            console.log(`🎵 Adding ${audioTracks.length} audio track(s) for answer`);
            
            audioTracks.forEach(track => {
                console.log('➕ Adding track for answer:', {
                    label: track.label,
                    enabled: track.enabled,
                    readyState: track.readyState
                });
                peerConnection.addTrack(track, this.localStream);
            });
        }

        // Handle incoming stream
        peerConnection.ontrack = (event) => {
            console.log('📥 Received remote stream from:', userId);
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
            const participant = document.getElementById(`voice-participant-${userId}-${window.proximityApp?.currentVoiceChannel?.replace('-voice', '')}`);
            if (participant) {
                participant.appendChild(audioElement);
                console.log('🔊 Audio element attached to participant');
            }
            
            // Notify proximity map
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

        // Connection state monitoring
        peerConnection.onconnectionstatechange = () => {
            console.log(`🔗 Connection state with ${userId}:`, peerConnection.connectionState);
        };

        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            console.log('📤 Created answer for:', userId);
            
            if (window.proximityApp) {
                window.proximityApp.connectionManager.emit('answer', {
                    target: userId,
                    answer: answer
                });
            }
        } catch (error) {
            console.error('❌ Error handling offer from:', userId, error);
            this.peerConnections.delete(userId);
        }
    }

    async handleOffer(offer, from) {
        console.log('📥 Handling offer from:', from);
        
        if (this.peerConnections.has(from)) {
            console.log('🔗 Connection already exists for user:', from);
            return;
        }

        const peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });
        this.peerConnections.set(from, peerConnection);

        // Add local stream
        if (this.localStream) {
            const audioTracks = this.localStream.getAudioTracks();
            console.log('🎵 Adding audio tracks to answer peer connection:', audioTracks.length);
            
            audioTracks.forEach(track => {
                console.log('➕ Adding track for answer:', track.label, 'enabled:', track.enabled);
                peerConnection.addTrack(track, this.localStream);
            });
        }

        // Handle incoming stream
        peerConnection.ontrack = (event) => {
            console.log('📥 Received remote stream from:', from);
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
            const participant = document.getElementById(`voice-participant-${from}-${window.proximityApp?.currentVoiceChannel?.replace('-voice', '')}`);
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
            
            console.log('📤 Created answer for:', from);
            
            if (window.proximityApp) {
                window.proximityApp.connectionManager.emit('answer', {
                    target: from,
                    answer: answer
                });
            }
        } catch (error) {
            console.error('❌ Error handling offer from:', from, error);
            this.peerConnections.delete(from);
        }
    }

    async handleAnswer(answer, from) {
        console.log('📥 Handling answer from:', from);
        
        const peerConnection = this.peerConnections.get(from);
        if (!peerConnection) {
            console.warn('⚠️ No peer connection found for:', from);
            return;
        }

        try {
            if (peerConnection.signalingState === 'have-local-offer') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                console.log('✅ Set remote description for answer from:', from);
            } else {
                console.warn(`⚠️ Cannot set remote answer in state: ${peerConnection.signalingState}`);
            }
        } catch (error) {
            console.error('❌ Error handling answer from:', from, error);
            this.disconnectFromUser(from);
        }
    }

    async handleIceCandidate(candidate, from) {
        const peerConnection = this.peerConnections.get(from);
        if (!peerConnection) {
            console.warn('⚠️ No peer connection found for ICE candidate from:', from);
            return;
        }

        try {
            if (peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('✅ Added ICE candidate from:', from);
            } else {
                // Queue candidates if remote description not set yet
                if (!peerConnection.queuedCandidates) {
                    peerConnection.queuedCandidates = [];
                }
                peerConnection.queuedCandidates.push(candidate);
                console.log('📦 Queued ICE candidate from:', from);
            }
        } catch (error) {
            console.error('❌ Error handling ICE candidate from:', from, error);
        }
    }

    disconnectFromUser(userId) {
        const peerConnection = this.peerConnections.get(userId);
        if (peerConnection) {
            peerConnection.close();
            this.peerConnections.delete(userId);
            console.log('🔌 Disconnected from user:', userId);
        }
    }

    disconnectAll() {
        console.log(`🔌 Disconnecting from all ${this.peerConnections.size} users...`);
        this.peerConnections.forEach((pc, userId) => {
            pc.close();
            console.log('🔌 Closed connection to:', userId);
        });
        this.peerConnections.clear();
    }

    toggleMute() {
        if (!this.localStream) {
            console.warn('⚠️ No local stream to mute/unmute');
            return;
        }

        this.isMuted = !this.isMuted;
        
        this.localStream.getAudioTracks().forEach(track => {
            track.enabled = !this.isMuted;
            console.log(`🎤 Audio track ${track.label} enabled: ${track.enabled}`);
        });

        // Update UI
        if (window.proximityApp && window.proximityApp.uiManager) {
            window.proximityApp.uiManager.updateMuteStatus(this.isMuted);
        }

        // Notify server
        if (window.proximityApp) {
            window.proximityApp.updateMicStatus(this.isMuted);
        }

        console.log(`🎤 Microphone ${this.isMuted ? 'muted' : 'unmuted'}`);
    }

    setGain(value) {
        // value: 0-100, map to 0-2
        const gainValue = Math.max(0, Math.min(2, value / 50));
        if (this.gainNode) {
            this.gainNode.gain.setValueAtTime(gainValue, this.audioContext.currentTime);
            console.log(`🔊 Audio gain set to: ${gainValue} (from ${value}%)`);
        }
    }

    getLocalStream() {
        return this.localStream;
    }

    cleanup() {
        console.log('🧹 Cleaning up audio manager...');
        
        this.disconnectAll();
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                console.log('🛑 Stopping track during cleanup:', track.label);
                track.stop();
            });
            this.localStream = null;
        }

        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
            console.log('🔌 Closed audio context');
        }

        this.volumeCallbacks = [];
        this.initialized = false;
        this.initializationAttempts = 0;
        
        console.log('✅ Audio manager cleanup complete');
    }
}