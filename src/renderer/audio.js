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
            this.visualizer = new AudioVisualizer();
            await this.visualizer.initialize(this.stream);
            this.isRecording = true;
            console.log('Microphone input initialized');
            return this.stream;
        } catch (error) {
            console.error('Error initializing microphone:', error);
            throw error;
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