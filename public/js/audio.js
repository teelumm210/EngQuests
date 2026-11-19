// ============================================================
// EngQuests - Audio Streamer (PCM 24kHz Little-Endian Playback)
// & Audio Recorder (PCM 16kHz Little-Endian Streaming)
// Bổ sung: đo mức âm lượng (getLevel) để điều khiển quả cầu giọng nói,
// và setMuted() để tắt/bật mic.
// ============================================================

export class AudioStreamPlayer {
  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
    this.audioCtx = null;
    this.analyser = null;
    this.outNode = null;
    this.levelBuf = null;
    this.nextPlayTime = 0;
    this.isPlaying = false;
    this.scheduledNodes = [];
    this.onPlayStateChange = null;
  }

  init() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtxClass({ sampleRate: this.sampleRate });

      // Chuỗi: source -> analyser -> loa (analyser dùng để lấy mức âm lượng AI)
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.6;
      this.levelBuf = new Uint8Array(this.analyser.fftSize);
      this.analyser.connect(this.audioCtx.destination);
      this.outNode = this.analyser;
    }
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
  }

  // Mức âm lượng đang phát ra, 0..1
  getLevel() {
    if (!this.analyser || !this.isPlaying) return 0;
    this.analyser.getByteTimeDomainData(this.levelBuf);
    let sum = 0;
    for (let i = 0; i < this.levelBuf.length; i++) {
      const v = (this.levelBuf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.levelBuf.length) * 3.2);
  }

  // base64: raw 16-bit PCM little-endian audio chunk at 24kHz
  playChunkBase64(base64) {
    this.init();

    const binaryString = window.atob(base64);
    const len = binaryString.length;
    // Must be even length for 16-bit samples
    const evenLen = len - (len % 2);
    if (evenLen <= 0) return;

    const bytes = new Uint8Array(evenLen);
    for (let i = 0; i < evenLen; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const int16View = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    const float32Data = new Float32Array(int16View.length);
    for (let i = 0; i < int16View.length; i++) {
      float32Data[i] = int16View[i] / 32768.0;
    }

    const buffer = this.audioCtx.createBuffer(1, float32Data.length, this.sampleRate);
    buffer.getChannelData(0).set(float32Data);

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.outNode);

    // Queue scheduling: wait until previous chunk finishes
    const currentTime = this.audioCtx.currentTime;
    if (this.nextPlayTime < currentTime) {
      this.nextPlayTime = currentTime + 0.04;
    }

    const startTime = this.nextPlayTime;
    source.start(startTime);
    this.nextPlayTime = startTime + buffer.duration;

    if (!this.isPlaying) {
      this.isPlaying = true;
      if (this.onPlayStateChange) this.onPlayStateChange(true);
    }

    this.scheduledNodes.push(source);
    source.onended = () => {
      const idx = this.scheduledNodes.indexOf(source);
      if (idx !== -1) this.scheduledNodes.splice(idx, 1);
      if (this.scheduledNodes.length === 0) {
        this.isPlaying = false;
        if (this.onPlayStateChange) this.onPlayStateChange(false);
      }
    };
  }

  // Interruption: when user speaks while AI is talking, stop instantly
  stop() {
    for (const node of this.scheduledNodes) {
      try {
        node.stop();
      } catch (e) {}
    }
    this.scheduledNodes = [];
    if (this.audioCtx) {
      this.nextPlayTime = 0;
    }
    if (this.isPlaying) {
      this.isPlaying = false;
      if (this.onPlayStateChange) this.onPlayStateChange(false);
    }
  }
}

export class AudioRecorder {
  constructor(onAudioChunk) {
    this.onAudioChunk = onAudioChunk; // callback receiving base64 PCM 16kHz
    this.audioCtx = null;
    this.mediaStream = null;
    this.processor = null;
    this.source = null;
    this.isRecording = false;
    this.muted = false;
    this.level = 0; // mức âm lượng mic, 0..1 (đã làm mượt)
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((t) => (t.enabled = !this.muted));
    }
    if (this.muted) this.level = 0;
  }

  getLevel() {
    return this.level;
  }

  async start() {
    if (this.isRecording) return;

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new AudioCtxClass({ sampleRate: 16000 });
    // iOS Safari tạo AudioContext ở trạng thái "suspended" nếu không nằm trong lần chạm: mở lại để mic có tín hiệu
    if (this.audioCtx.state === "suspended") {
      try {
        await this.audioCtx.resume();
      } catch {
        /* bỏ qua */
      }
    }
    this.source = this.audioCtx.createMediaStreamSource(this.mediaStream);

    // Buffer size 2048 at 16kHz ≈ 128ms chunks
    this.processor = this.audioCtx.createScriptProcessor(2048, 1, 1);

    this.processor.onaudioprocess = (e) => {
      if (!this.isRecording) return;
      const inputData = e.inputBuffer.getChannelData(0);

      // Đo RMS để hiển thị mức nói của người dùng
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
      const rms = Math.sqrt(sum / inputData.length);
      const target = this.muted ? 0 : Math.min(1, rms * 9);
      this.level = this.level * 0.5 + target * 0.5;

      if (this.muted) return; // tắt mic: không gửi dữ liệu

      // Convert Float32 to Int16 Little-Endian
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        let s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      const uint8 = new Uint8Array(pcm16.buffer);
      let binary = "";
      for (let i = 0; i < uint8.byteLength; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      const b64 = window.btoa(binary);
      if (this.onAudioChunk) {
        this.onAudioChunk(b64);
      }
    };

    this.source.connect(this.processor);
    this.processor.connect(this.audioCtx.destination);
    this.isRecording = true;
  }

  stop() {
    this.isRecording = false;
    this.level = 0;
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
  }
}
