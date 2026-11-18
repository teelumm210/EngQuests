// ============================================================
// POST /api/chat — proxy tới Gemini, giữ GEMINI_API_KEY trên server.
// Client chỉ gửi lịch sử hội thoại; persona, model và giới hạn token do server quyết định.
// ============================================================
import { originAllowed, withCors, preflight, forbidden } from "../lib/cors.mjs";
import { buildSystemInstruction } from "../../public/js/persona.js";

// Model chính (đổi được bằng biến môi trường CHAT_MODEL) và các model dự phòng khi model chính quá tải (503/429)
const PRIMARY_MODEL = process.env.CHAT_MODEL || "gemini-3.8-flash";
const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite"];
const MODELS = [...new Set([PRIMARY_MODEL, ...FALLBACK_MODELS])];
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_OUTPUT_TOKENS = 2048;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // Netlify giới hạn ~6 MB cho request đồng bộ
const MAX_MESSAGES = 25;
const MAX_TEXT_CHARS = 20000; // đủ cho câu trả lời dài nhất của model (2048 token)
const MAX_IMAGE_B64_CHARS = 4_000_000;
const TOTAL_BUDGET_MS = 23_000; // tổng thời gian cho mọi lần thử (Netlify cắt hàm đồng bộ ở ~26 giây)
const MIN_ATTEMPT_MS = 4_000; // còn ít hơn mức này thì không bắt đầu thêm lần thử mới
const RETRY_DELAY_MS = 700;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const fail = (status, code, message) => json(status, { error: { code, message } });

/** Kiểm tra và làm sạch `contents`; trả về mảng mới hoặc null nếu sai định dạng */
function sanitizeContents(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_MESSAGES) return null;
  const out = [];
  for (const turn of raw) {
    if (!turn || (turn.role !== "user" && turn.role !== "model")) return null;
    if (!Array.isArray(turn.parts) || turn.parts.length < 1 || turn.parts.length > 3) return null;
    const parts = [];
    for (const p of turn.parts) {
      if (p && typeof p.text === "string") {
        if (p.text.length > MAX_TEXT_CHARS) return null;
        parts.push({ text: p.text });
      } else if (p && p.inlineData && turn.role === "user") {
        const { mimeType, data } = p.inlineData;
        if (!/^image\/(jpeg|png|webp|gif)$/.test(mimeType || "")) return null;
        if (typeof data !== "string" || data.length > MAX_IMAGE_B64_CHARS) return null;
        parts.push({ inlineData: { mimeType, data } });
      } else {
        return null;
      }
    }
    out.push({ role: turn.role, parts });
  }
  return out;
}

async function handle(req) {
  if (req.method !== "POST") return fail(405, "METHOD", "Method not allowed");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fail(500, "SERVER_CONFIG", "Máy chủ chưa được cấu hình GEMINI_API_KEY.");

  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BODY_BYTES) return fail(413, "TOO_LARGE", "Ảnh hoặc tin nhắn quá lớn.");

  let body;
  try {
    body = await req.json();
  } catch {
    return fail(400, "BAD_REQUEST", "Yêu cầu không hợp lệ.");
  }

  const contents = sanitizeContents(body?.contents);
  if (!contents) return fail(400, "BAD_REQUEST", "Nội dung hội thoại không hợp lệ.");

  const knownWords = Array.isArray(body?.knownWords)
    ? body.knownWords.filter((w) => typeof w === "string").map((w) => w.slice(0, 40)).slice(0, 150)
    : [];

  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: buildSystemInstruction("chat", { knownWords }) }] },
    contents,
    generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.8 },
  });

  // Thử lần lượt từng model; lỗi tạm thời (503/500/429/timeout) thì chuyển model tiếp theo.
  const startedAt = Date.now();
  let res = null;
  let lastFail = fail(502, "UPSTREAM", "Máy chủ AI đang gặp sự cố. Bạn thử lại sau ít giây nhé.");

  for (let i = 0; i < MODELS.length; i++) {
    const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt);
    if (remaining < MIN_ATTEMPT_MS) break;
    // Model chính được nhiều thời gian nhất; model dự phòng nhanh hơn nên chia phần còn lại
    const slice = i === MODELS.length - 1 ? remaining : Math.max(MIN_ATTEMPT_MS, Math.round(remaining * 0.55));

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), slice);
    let attempt;
    try {
      attempt = await fetch(`${API_BASE}/${encodeURIComponent(MODELS[i])}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        signal: ctrl.signal,
        body: payload,
      });
    } catch (e) {
      console.error("Gemini fetch failed", MODELS[i], e?.name || e);
      lastFail =
        e?.name === "AbortError"
          ? fail(504, "TIMEOUT", "AI phản hồi quá lâu. Bạn thử lại nhé.")
          : fail(502, "UPSTREAM", "Không kết nối được tới máy chủ AI.");
      continue;
    } finally {
      clearTimeout(timer);
    }

    if (attempt.ok) {
      res = attempt;
      if (i > 0) console.warn("Dùng model dự phòng:", MODELS[i]);
      break;
    }

    let msg = "";
    try {
      msg = (await attempt.json())?.error?.message || "";
    } catch {
      /* không phải JSON */
    }
    const s = attempt.status;
    console.error("Gemini error", MODELS[i], s, msg);

    if (s === 400 && /token|too long|exceeds|context/i.test(msg)) {
      return fail(400, "CONTEXT_TOO_LONG", "Cuộc trò chuyện đã quá dài so với giới hạn của model.");
    }
    if (s === 400 || s === 401 || s === 403) return fail(500, "SERVER_CONFIG", "Cấu hình AI trên máy chủ chưa đúng.");
    // 404 (model đã ngừng), 429 (quá tải lượt), 5xx: thử model kế tiếp
    if (s === 404) lastFail = fail(500, "MODEL_NOT_FOUND", "Model AI trên máy chủ không còn khả dụng.");
    else if (s === 429) lastFail = fail(429, "QUOTA", "EngQuests đang quá tải lượt dùng. Bạn đợi một lát rồi thử lại nhé.");
    else lastFail = fail(502, "UPSTREAM", "Máy chủ AI đang bận. Bạn thử lại sau ít giây nhé.");
    await sleep(RETRY_DELAY_MS);
  }

  if (!res) return lastFail;

  const data = await res.json();
  return json(200, { candidates: data.candidates, promptFeedback: data.promptFeedback });
}

export default async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (!originAllowed(req)) return forbidden();
  return withCors(req, await handle(req));
};

export const config = {
  path: "/api/chat",
  // Giới hạn theo IP (cấu hình trong code, chạy trên mọi gói Netlify)
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
