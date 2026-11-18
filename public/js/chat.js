// ============================================================
// EngQuests - Chat chữ: gọi /api/chat (Netlify Function giữ API key và persona trên server)
//
// Xử lý giới hạn token ở 3 tầng:
//  1. Câu trả lời bị cắt (finishReason = MAX_TOKENS)  -> trả về truncated=true để UI hiện nút "Tiếp tục"
//  2. Lịch sử quá dài                                  -> chỉ gửi N lượt gần nhất, bỏ ảnh cũ, tự cắt đôi rồi thử lại nếu API báo quá dài
//  3. Hết quota / rate limit (HTTP 429)                -> báo lỗi dễ hiểu, không làm mất tin nhắn
// ============================================================

import { LearningStore } from "./store.js";
import { API_BASE } from "./config.js";

const API_URL = `${API_BASE}/api/chat`;
const MAX_HISTORY_MESSAGES = 24; // tối đa 12 lượt hỏi-đáp được gửi lại mỗi lần

export class ChatError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ChatError";
    this.code = code;
  }
}

async function toChatError(res) {
  let code = "";
  let msg = "";
  try {
    const body = await res.json();
    code = body?.error?.code || "";
    msg = body?.error?.message || "";
  } catch {
    /* body không phải JSON (vd. trang lỗi 429 của Netlify) */
  }
  const s = res.status;

  if (code === "CONTEXT_TOO_LONG") return new ChatError(msg, "CONTEXT_TOO_LONG");
  if (s === 429) {
    return new ChatError(msg || "Bạn gửi hơi nhanh rồi. Đợi một lát rồi thử lại nhé.", "QUOTA");
  }
  if (s === 413 || code === "TOO_LARGE") {
    return new ChatError("Ảnh hoặc tin nhắn quá lớn. Hãy thử ảnh nhỏ hơn.", "TOO_LARGE");
  }
  if (s === 404) {
    return new ChatError("Không tìm thấy máy chủ EngQuests (/api/chat). Hãy chạy bằng `netlify dev` hoặc deploy lên Netlify.", "NO_SERVER");
  }
  if (s >= 500 || s === 400) {
    return new ChatError(msg || "Máy chủ AI đang gặp sự cố. Bạn thử lại sau ít giây nhé.", "OVERLOADED");
  }
  return new ChatError(msg || `Lỗi không xác định (HTTP ${s}).`, "HTTP");
}

export class VocaChat {
  constructor() {
    this.history = [];
  }

  reset() {
    this.history = [];
  }

  /** Cắt lịch sử: giữ N tin gần nhất và luôn bắt đầu bằng lượt của người dùng */
  _trim(contents) {
    let out = contents.slice(-MAX_HISTORY_MESSAGES);
    while (out.length > 1 && out[0].role !== "user") out.shift();
    return out;
  }

  async _callOnce(contents) {
    let res;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          knownWords: LearningStore.getWords().map((w) => w.word),
        }),
      });
    } catch {
      throw new ChatError("Không kết nối được tới máy chủ. Kiểm tra mạng của bạn.", "NETWORK");
    }
    if (!res.ok) {
      const err = await toChatError(res);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  // Lỗi tạm thời đến nhanh (mạng chập chờn, 502 do model bận) thì tự thử lại đúng 1 lần
  async _call(contents) {
    const t0 = Date.now();
    try {
      return await this._callOnce(contents);
    } catch (e) {
      const transient = e.code === "NETWORK" || e.status === 502 || e.status === 504;
      if (!transient || Date.now() - t0 > 10_000) throw e;
      await new Promise((r) => setTimeout(r, 1200));
      return this._callOnce(contents);
    }
  }

  /**
   * @param {{text: string, image?: string|null}} input  image là data URL (jpeg/png)
   * @returns {Promise<{text: string, truncated: boolean}>}
   */
  async send({ text, image }) {
    const parts = [];
    const m = image && image.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
    if (m) parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
    parts.push({ text: text || "Đồ vật này tiếng Anh gọi là gì?" });
    const userTurn = { role: "user", parts };

    // Lịch sử lưu dạng chỉ-chữ: ảnh chỉ cần cho đúng lượt đó, giữ lại sẽ tốn token vô ích
    const storedUser = {
      role: "user",
      parts: [{ text: (m ? "[Người dùng đã gửi một ảnh] " : "") + (text || "") }],
    };

    let contents = this._trim([...this.history, userTurn]);
    let data;
    try {
      data = await this._call(contents);
    } catch (e) {
      if (e.code !== "CONTEXT_TOO_LONG" || contents.length < 2) throw e;
      // Quá dài: cắt còn một nửa rồi thử lại đúng 1 lần
      let half = contents.slice(-Math.max(1, Math.floor(contents.length / 2)));
      while (half.length > 1 && half[0].role !== "user") half.shift();
      this.history = half.slice(0, -1); // phần cũ còn lại (chỉ-chữ); lượt cuối là tin vừa gửi
      data = await this._call(half);
    }

    const cand = data.candidates?.[0];
    if (!cand) {
      const reason = data.promptFeedback?.blockReason;
      throw new ChatError(
        reason
          ? "Tin nhắn bị bộ lọc an toàn chặn. Bạn thử diễn đạt khác nhé."
          : "AI không trả về nội dung nào. Bạn thử gửi lại nhé.",
        "BLOCKED"
      );
    }

    const reply = (cand.content?.parts || [])
      .filter((p) => typeof p.text === "string" && !p.thought)
      .map((p) => p.text)
      .join("");
    const truncated = cand.finishReason === "MAX_TOKENS";

    if (!reply.trim()) {
      if (truncated) {
        throw new ChatError(
          "Phản hồi bị cắt trước khi có nội dung (đã hết giới hạn token). Bạn thử hỏi ngắn gọn hơn hoặc bắt đầu cuộc trò chuyện mới.",
          "MAX_TOKENS"
        );
      }
      throw new ChatError("AI không tạo được phản hồi (có thể do bộ lọc an toàn). Bạn thử lại nhé.", "BLOCKED");
    }

    this.history.push(storedUser, { role: "model", parts: [{ text: reply }] });
    this.history = this.history.slice(-MAX_HISTORY_MESSAGES);
    return { text: reply, truncated };
  }
}
