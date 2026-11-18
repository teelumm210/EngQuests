// ============================================================
// EngQuests - Realtime Gemini Live Client (WebSockets)
// Kết nối bằng token tạm lấy từ /api/live-token (API key thật nằm trên server)
// Hỗ trợ Realtime Tools / Function Calling để lưu từ & chấm điểm
// ============================================================

import { AudioRecorder, AudioStreamPlayer } from "./audio.js";
import { buildSystemInstruction } from "./persona.js";
import { API_BASE } from "./config.js";

// Token tạm (auth_tokens/...) chỉ dùng được với endpoint "Constrained" của v1alpha
const WS_BASE =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";
const MAX_RECONNECTS = 3;

// Đoán nguyên nhân từ mã đóng / lý do mà server trả về
function classifyClose(code, reason = "") {
  const r = reason.toLowerCase();
  if (/api key|api_key|unauthenticated|permission denied/.test(r)) return "key";
  if (/quota|exhaust|rate limit|resource_exhausted|billing/.test(r)) return "quota";
  if (/not found|not supported|unknown model|invalid model/.test(r)) return "model";
  return "other";
}

const CLOSE_MESSAGES = {
  key: "Phiên gọi thoại không hợp lệ hoặc đã hết hạn. Hãy bấm gọi lại.",
  quota: "EngQuests đã hết hạn mức gọi thoại (theo phút hoặc theo ngày) nên cuộc gọi bị ngắt. Thử lại sau nhé.",
  model: "Model gọi thoại hiện không khả dụng trên máy chủ.",
  other: "Kết nối cuộc gọi bị ngắt đột ngột.",
};

export class GeminiLiveClient {
  constructor(options = {}) {
    this.options = options;
    this.ws = null;
    this.isConnected = false;
    this.token = null; // token tạm từ server
    this.model = null;
    this.player = new AudioStreamPlayer(24000);
    this.recorder = null;
    this.videoInterval = null;

    // Quản lý phiên dài
    this.resumeHandle = null; // token để nối lại cùng một cuộc hội thoại
    this.reconnectAttempts = 0;
    this.reconnecting = false;
    this.closing = false;
    this.setupDone = false;

    // Callbacks
    this.onStateChange = options.onStateChange || (() => {});
    this.onTranscript = options.onTranscript || (() => {});
    this.onError = options.onError || (() => {});
    this.onNotice = options.onNotice || (() => {});
    this.onSpeakingChange = options.onSpeakingChange || (() => {});
    this.onToolCall = options.onToolCall || (() => {});
    this.player.onPlayStateChange = (playing) => this.onSpeakingChange(playing);
    this.muted = false;
  }

  // Mức âm lượng cho quả cầu & waveform (0..1)
  getInputLevel() {
    return this.recorder ? this.recorder.getLevel() : 0;
  }
  getOutputLevel() {
    return this.player ? this.player.getLevel() : 0;
  }
  get isSpeaking() {
    return !!(this.player && this.player.isPlaying);
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (this.recorder) this.recorder.setMuted(this.muted);
  }

  async connect() {
    this.onStateChange("connecting");
    this.closing = false;

    try {
      await this.fetchToken();
    } catch (err) {
      this.onError(err);
      this.onStateChange("disconnected");
      throw err;
    }

    try {
      await this.openSocket(null, true);
    } catch (err) {
      this.onError(err);
      this.disconnect();
      throw err;
    }
  }

  // Xin token tạm từ server (dùng 1 lần; nối lại cùng phiên không tốn thêm lượt dùng)
  async fetchToken() {
    let res;
    try {
      res = await fetch(`${API_BASE}/api/live-token`, { method: "POST" });
    } catch {
      throw new Error("Không kết nối được tới máy chủ. Kiểm tra mạng của bạn.");
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* body không phải JSON (vd. trang lỗi 429 của Netlify) */
    }
    if (!res.ok || !data?.token) {
      if (res.status === 429) throw new Error("Bạn gọi hơi nhanh rồi. Đợi một lát rồi thử lại nhé.");
      if (res.status === 404) throw new Error("Không tìm thấy máy chủ EngQuests (/api/live-token). Hãy chạy bằng `netlify dev` hoặc deploy lên Netlify.");
      throw new Error(data?.error?.message || "Không tạo được phiên gọi thoại. Bạn thử lại sau nhé.");
    }
    this.token = data.token;
    this.model = data.model;
  }

  // Mở WebSocket. first=true: lần đầu, sẽ bật mic; false: nối lại, giữ nguyên mic
  openSocket(handle = null, first = false) {
    const url = `${WS_BASE}?access_token=${encodeURIComponent(this.token)}`;

    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";
      } catch (err) {
        return reject(err);
      }
      this.ws = ws;
      this.setupDone = false;
      let opened = false;

      ws.onopen = async () => {
        if (ws !== this.ws) return;
        opened = true;
        this.isConnected = true;
        this.sendSetup(handle);
        // Dự phòng: nếu server không gửi setupComplete thì vẫn mở luồng âm thanh sau 1.5s
        setTimeout(() => {
          if (ws === this.ws) this.setupDone = true;
        }, 1500);

        if (!first) return resolve();

        this.onStateChange("connected");
        try {
          const rec = new AudioRecorder((pcm16Base64) => {
            // Chống tự nghe lại tiếng của AI: khi AI đang nói thì không gửi mic lên
            if (this.player && this.player.isPlaying) return;
            this.sendAudioChunk(pcm16Base64);
          });
          this.recorder = rec;
          await rec.start();
          if (this.closing) {
            rec.stop(); // bị ngắt trong lúc đang bật mic
            return resolve();
          }
          rec.setMuted(this.muted);
        } catch (recErr) {
          console.warn("Microphone access error:", recErr);
          this.onError(new Error("Vui lòng cấp quyền Microphone để trò chuyện bằng giọng nói."));
        }
        resolve();
      };

      ws.onmessage = async (event) => {
        if (ws !== this.ws) return;
        try {
          let textData = event.data;
          if (event.data instanceof Blob) textData = await event.data.text();
          else if (event.data instanceof ArrayBuffer) textData = new TextDecoder().decode(event.data);
          this.handleServerMessage(JSON.parse(textData));
        } catch (e) {
          console.error("Lỗi parse tin nhắn Live API:", e);
        }
      };

      ws.onerror = (event) => {
        console.error("Live WebSocket error:", event);
        if (!opened && ws === this.ws) reject(new Error("Không kết nối được tới Gemini Live. Kiểm tra mạng của bạn."));
      };

      ws.onclose = (event) => {
        if (ws !== this.ws || this.closing) return;
        console.log("Live WebSocket closed:", event.code, event.reason);
        this.handleUnexpectedClose(event);
      };
    });
  }

  handleUnexpectedClose(event) {
    const kind = classifyClose(event.code, event.reason || "");
    if (kind === "other" && this.resumeHandle && this.reconnectAttempts < MAX_RECONNECTS) {
      this.reconnect();
      return;
    }
    const detail = kind === "other" && event.reason ? ` (${event.reason})` : "";
    this.onError(new Error(CLOSE_MESSAGES[kind] + detail));
    this.disconnect();
  }

  // Nối lại cùng phiên (giữ nguyên ngữ cảnh nhờ session resumption), mic vẫn chạy
  async reconnect() {
    if (this.reconnecting || this.closing || !this.resumeHandle) return;
    if (this.reconnectAttempts >= MAX_RECONNECTS) {
      this.onError(new Error("Không nối lại được cuộc gọi sau nhiều lần thử."));
      this.disconnect();
      return;
    }
    this.reconnecting = true;
    this.reconnectAttempts++;
    this.onNotice("Đang nối lại cuộc gọi…");

    const old = this.ws;
    this.ws = null;
    if (old) {
      old.onclose = old.onerror = old.onmessage = old.onopen = null;
      try {
        old.close();
      } catch {
        /* đã đóng */
      }
    }

    try {
      await this.openSocket(this.resumeHandle, false);
    } catch (err) {
      this.reconnecting = false;
      if (!this.closing) {
        this.onError(new Error("Không nối lại được cuộc gọi. Hãy bấm gọi lại nhé."));
        this.disconnect();
      }
      return;
    }
    this.reconnecting = false;
  }

  sendSetup(handle = null) {
    const setupMessage = {
      setup: {
        model: `models/${this.model}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
          },
        },
        systemInstruction: {
          parts: [{ text: buildSystemInstruction("live") }],
        },
        // Bật transcript để hiện phụ đề hai chiều
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        // Tools để AI tương tác trực tiếp với giao diện: đề xuất từ mới, lưu flashcard, chấm điểm
        tools: [
          {
            functionDeclarations: [
              {
                name: "propose_vocabulary",
                description: "Đề xuất hiển thị một từ vựng tiếng Anh mới trên màn hình để người dùng học và hỏi xem họ có muốn lưu vào flashcard không.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    word: { type: "STRING", description: "Từ vựng tiếng Anh (ví dụ: resilient)" },
                    ipa: { type: "STRING", description: "Phiên âm IPA chuẩn (ví dụ: /rɪˈzɪl.i.ənt/)" },
                    meaning: { type: "STRING", description: "Nghĩa tiếng Việt ngắn gọn (ví dụ: kiên cường, mau hồi phục)" },
                    example: { type: "STRING", description: "Câu ví dụ bằng tiếng Anh" },
                    category: { type: "STRING", description: "Chủ đề từ vựng" }
                  },
                  required: ["word", "meaning"]
                }
              },
              {
                name: "save_to_flashcard",
                description: "Lưu từ vựng vào flashcard ngay khi người dùng nói 'có', 'lưu đi', 'thêm đi', 'yes', 'ok' hoặc đồng ý lưu từ.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    word: { type: "STRING", description: "Từ vựng tiếng Anh cần lưu" },
                    ipa: { type: "STRING", description: "Phiên âm IPA" },
                    meaning: { type: "STRING", description: "Nghĩa tiếng Việt" },
                    category: { type: "STRING", description: "Chủ đề" }
                  },
                  required: ["word"]
                }
              },
              {
                name: "report_pronunciation_score",
                description: "Báo cáo điểm số phát âm (thang 100) để kích hoạt giao diện chấm điểm, vòng quay phần trăm và hiệu ứng pháo hoa sinh động trên màn hình.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    targetText: { type: "STRING", description: "Từ hoặc câu tiếng Anh cần phát âm" },
                    score: { type: "INTEGER", description: "Điểm số từ 0 đến 100" },
                    feedback: { type: "STRING", description: "Nhận xét ngắn về phát âm hoặc âm cần lưu ý" }
                  },
                  required: ["targetText", "score"]
                }
              }
            ]
          }
        ],
        // Cuộc gọi dài: nén bớt ngữ cảnh cũ thay vì bị ngắt khi đầy token
        contextWindowCompression: { slidingWindow: {} },
        // Cho phép nối lại phiên (handle nhận về qua sessionResumptionUpdate)
        sessionResumption: handle ? { handle } : {},
      },
    };
    this.send(setupMessage, true);
  }

  send(data, force = false) {
    if (!force && !this.setupDone) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  sendAudioChunk(base64Pcm16) {
    this.send({
      realtimeInput: {
        audio: { data: base64Pcm16, mimeType: "audio/pcm;rate=16000" },
      },
    });
  }

  sendVideoFrame(base64Jpeg) {
    this.send({
      realtimeInput: {
        video: { data: base64Jpeg, mimeType: "image/jpeg" },
      },
    });
  }

  sendText(text) {
    this.send({ realtimeInput: { text } });
  }

  handleServerMessage(msg) {
    if (msg.setupComplete) {
      this.setupDone = true;
      this.reconnectAttempts = 0; // kết nối ổn định -> reset bộ đếm
    }

    // Token để nối lại phiên về sau
    const upd = msg.sessionResumptionUpdate;
    if (upd?.resumable && upd.newHandle) this.resumeHandle = upd.newHandle;

    // Server báo sắp ngắt kết nối (giới hạn thời gian của kết nối) -> chủ động nối lại
    if (msg.goAway) {
      if (this.resumeHandle) this.reconnect();
      else this.onNotice("Cuộc gọi sắp đạt giới hạn thời gian của phiên.");
      return;
    }

    // Xử lý Tool Call / Function Calling từ Live API
    if (msg.toolCall) {
      const calls = msg.toolCall.functionCalls || [];
      const responses = [];
      for (const call of calls) {
        if (this.onToolCall) {
          try {
            this.onToolCall(call.name, call.args || {});
          } catch (e) {
            console.error("Lỗi khi xử lý Tool Call:", e);
          }
        }
        responses.push({
          id: call.id,
          name: call.name,
          response: { output: { success: true } }
        });
      }
      this.send({
        toolResponse: {
          functionResponses: responses
        }
      });
    }

    const serverContent = msg.serverContent;
    if (!serverContent) return;
    this.setupDone = true;

    // Người dùng nói chen ngang -> dừng tiếng AI
    if (serverContent.interrupted) {
      this.player.stop();
      return;
    }

    // Luồng âm thanh của AI
    if (serverContent.modelTurn?.parts) {
      for (const part of serverContent.modelTurn.parts) {
        if (part.inlineData && part.inlineData.mimeType?.startsWith("audio/")) {
          this.player.playChunkBase64(part.inlineData.data);
        }
      }
    }

    // Phụ đề: nối dần vào lượt hiện tại
    if (serverContent.inputTranscription?.text) {
      this.onTranscript({ role: "user", text: serverContent.inputTranscription.text, isDelta: true });
    }
    if (serverContent.outputTranscription?.text) {
      this.onTranscript({ role: "ai", text: serverContent.outputTranscription.text, isDelta: true });
    }

    if (serverContent.turnComplete) {
      this.onTranscript({ role: "turn_complete" });
    }
  }

  // Gửi khung hình camera liên tục (vd. 1 khung / 1.2s khi bật camera trong cuộc gọi)
  startVideoStreaming(videoElement, canvasElement, intervalMs = 1000) {
    this.stopVideoStreaming();
    this.videoInterval = setInterval(() => {
      if (!this.isConnected || !videoElement.videoWidth) return;
      canvasElement.width = 480;
      canvasElement.height = 360;
      const ctx = canvasElement.getContext("2d");
      ctx.drawImage(videoElement, 0, 0, 480, 360);
      const dataUrl = canvasElement.toDataURL("image/jpeg", 0.6);
      const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
      this.sendVideoFrame(base64);
    }, intervalMs);
  }

  stopVideoStreaming() {
    if (this.videoInterval) {
      clearInterval(this.videoInterval);
      this.videoInterval = null;
    }
  }

  disconnect() {
    this.closing = true;
    this.stopVideoStreaming();
    if (this.recorder) {
      this.recorder.stop();
      this.recorder = null;
    }
    if (this.player) {
      this.player.stop();
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      try {
        this.ws.close();
      } catch {
        /* đã đóng */
      }
      this.ws = null;
    }
    this.isConnected = false;
    this.setupDone = false;
    this.onStateChange("disconnected");
  }
}
