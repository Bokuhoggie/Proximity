// Audio-related classes for Proximity

class AudioVisualizer {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.dataArray = null;
        this.isActive = false;
        this.callbacks = [];
    }

    async initialize(stream) {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            this.microphone.connect(this.analyser);
            this.isActive = true;
            
            this.startAnalyzing();
            console.log('Audio visualizer initialized');
        } catch (error) {
            console.error('Error initializing audio visualizer:', error);
        }
    }

    async initializeFromNode(node) {
        try {
            this.audioContext = node.context;
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            node.connect(this.analyser);
            this.isActive = true;
            this.startAnalyzing();
            console.log('Audio visualizer initialized from node');
        } catch (error) {
            console.error('Error initializing audio visualizer from node:', error);
        }
    }

    startAnalyzing() {
        if (!this.isActive) return;
        
        this.analyser.getByteFrequencyData(this.dataArray);
        
        // Calculate volume level (0-100)
        const average = this.dataArray.reduce((a, b) => a + b) / this.dataArray.length;
        const volume = Math.min(100, (average / 128) * 100);
        
        // Notify all callbacks
        this.callbacks.forEach(callback => callback(volume, this.dataArray));
        
        requestAnimationFrame(() => this.startAnalyzing());
    }

    addCallback(callback) {
        this.callbacks.push(callback);
    }

    removeCallback(callback) {
        this.callbacks = this.callbacks.filter(cb => cb !== callback);
    }

    stop() {
        this.isActive = false;
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        this.callbacks = [];
    }
}

class MicrophoneInput {
    constructor() {
        this.stream = null;
        this.visualizer = null;
        this.isRecording = false;
        this.gainNode = null;
        this.gainValue = 1.0;
        this.constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false
        };
    }

    async initialize(constraints = {}) {
        this.constraints = { ...this.constraints, ...constraints };
        try {
            this.stream = await navigator.mediaDevices.getUserMedia(this.constraints);
            // Setup audio context and gain node
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.gainNode = this.audioContext.createGain();
            // Set initial gain
            this.setGain((window.proximityApp && window.proximityApp.settings && window.proximityApp.settings.audioGain) || 50);
            // Connect mic to gain node
            this.micSource = this.audioContext.createMediaStreamSource(this.stream);
            this.micSource.connect(this.gainNode);
            // For visualizer, use the gain node output
            this.visualizer = new AudioVisualizer();
            await this.visualizer.initializeFromNode(this.gainNode);
            this.isRecording = true;
            console.log('Microphone input initialized with gain');
            return this.stream;
        } catch (error) {
            console.error('Error initializing microphone:', error);
            throw error;
        }
    }

    setGain(value) {
        // value: 0-100, map to 0-2
        this.gainValue = Math.max(0, Math.min(2, value / 50));
        if (this.gainNode) {
            this.gainNode.gain.value = this.gainValue;
        }
    }

    getStream() {
        return this.stream;
    }

    getVisualizer() {
        return this.visualizer;
    }

    addVolumeCallback(callback) {
        if (this.visualizer) {
            this.visualizer.addCallback(callback);
        }
    }

    removeVolumeCallback(callback) {
        if (this.visualizer) {
            this.visualizer.removeCallback(callback);
        }
    }

    stop() {
        this.isRecording = false;
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        if (this.visualizer) {
            this.visualizer.stop();
        }
    }

    async changeDevice(deviceId) {
        if (this.stream) {
            this.stop();
        }
        
        const newConstraints = {
            ...this.constraints,
            audio: {
                ...this.constraints.audio,
                deviceId: { exact: deviceId }
            }
        };
        
        return await this.initialize(newConstraints);
    }
}

export { AudioVisualizer, MicrophoneInput }; 