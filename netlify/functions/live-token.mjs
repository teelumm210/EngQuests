// ============================================================
// POST /api/live-token — cấp token tạm (dùng 1 lần, hết hạn sau 30 phút) để trình duyệt
// mở WebSocket Gemini Live. KHÔNG bao giờ trả API key thật về client.
// Model và persona bị khoá trong token nên client không thể đổi sang việc khác.
// ============================================================
import { GoogleGenAI } from "@google/genai";
import { buildSystemInstruction } from "../../public/js/persona.js";
import { originAllowed, withCors, preflight, forbidden } from "../lib/cors.mjs";

const LIVE_MODEL = process.env.LIVE_MODEL || "gemini-3.8-live";
const SESSION_MS = 30 * 60 * 1000; // thời lượng tối đa của một cuộc gọi
const START_WINDOW_MS = 2 * 60 * 1000; // phải mở kết nối trong 2 phút kể từ lúc cấp token

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function handle(req) {
  if (req.method !== "POST") return json(405, { error: { code: "METHOD", message: "Method not allowed" } });


  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(500, { error: { code: "SERVER_CONFIG", message: "Máy chủ chưa được cấu hình GEMINI_API_KEY." } });
  }

  try {
    const client = new GoogleGenAI({ apiKey, apiVersion: "v1alpha" });
    const now = Date.now();
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(now + SESSION_MS).toISOString(),
        newSessionExpireTime: new Date(now + START_WINDOW_MS).toISOString(),
        liveConnectConstraints: {
          model: LIVE_MODEL,
          config: {
            responseModalities: ["AUDIO"],
            systemInstruction: buildSystemInstruction("live"),
          },
        },
      },
    });
    return json(200, { token: token.name, model: LIVE_MODEL });
  } catch (err) {
    // Không có nhánh dự phòng trả API key: lỗi thì báo lỗi.
    console.error("authTokens.create failed:", err);
    return json(502, { error: { code: "UPSTREAM", message: "Không tạo được phiên gọi thoại. Bạn thử lại sau nhé." } });
  }
}

export default async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (!originAllowed(req)) return forbidden();
  return withCors(req, await handle(req));
};

export const config = {
  path: "/api/live-token",
  rateLimit: { windowLimit: 6, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
