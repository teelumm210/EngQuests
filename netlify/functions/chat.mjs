// ============================================================
// POST /api/chat — proxy tới Gemini, giữ GEMINI_API_KEY trên server.
// Client chỉ gửi lịch sử hội thoại; persona, model và giới hạn token do server quyết định.
// ============================================================
import { originAllowed, withCors, preflight, forbidden } from "../lib/cors.mjs";
import { buildSystemInstruction } from "../../public/js/persona.js";
import { generate } from "../lib/gemini.mjs";

const MAX_OUTPUT_TOKENS = 2048;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // Netlify giới hạn ~6 MB cho request đồng bộ
const MAX_MESSAGES = 25;
const MAX_TEXT_CHARS = 20000; // đủ cho câu trả lời dài nhất của model (2048 token)
const MAX_IMAGE_B64_CHARS = 4_000_000;
const TOTAL_BUDGET_MS = 23_000; // tổng thời gian cho mọi lần thử (Netlify cắt hàm đồng bộ ở ~26 giây)

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

  const result = await generate({
    apiKey,
    budgetMs: TOTAL_BUDGET_MS,
    body: {
      systemInstruction: { parts: [{ text: buildSystemInstruction("chat", { knownWords }) }] },
      contents,
      generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.8 },
    },
  });
  if (result.error) return fail(result.error.status, result.error.code, result.error.message);
  const data = result.data;
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
