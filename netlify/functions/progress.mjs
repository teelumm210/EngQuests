// ============================================================
// POST /api/progress  (Authorization: Bearer <token>)
//   { action: "get" }            -> { data, updatedAt }
//   { action: "put", data }      -> { updatedAt }
// `data` là ảnh chụp tiến trình học (từ vựng, XP, streak, điểm game, nhiệm vụ camera).
// Việc gộp dữ liệu giữa thiết bị do trình duyệt làm; máy chủ chỉ lưu bản mới nhất.
// ============================================================
import { originAllowed, withCors, preflight, forbidden } from "../lib/cors.mjs";
import { progressStore, userFromRequest, json, fail } from "../lib/auth.mjs";

const MAX_BYTES = 600 * 1024;
const ALLOWED_KEYS = ["words", "tombstones", "stats", "streak", "xp", "goal", "best", "quests"];

function sanitize(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const out = {};
  for (const k of ALLOWED_KEYS) if (data[k] !== undefined) out[k] = data[k];
  if (out.words !== undefined && (!Array.isArray(out.words) || out.words.length > 5000)) return null;
  return out;
}

async function handle(req) {
  if (req.method !== "POST") return fail(405, "METHOD", "Method not allowed");

  const username = await userFromRequest(req);
  if (!username) return fail(401, "UNAUTHORIZED", "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.");

  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BYTES * 1.5) return fail(413, "TOO_LARGE", "Dữ liệu quá lớn.");

  let body;
  try {
    body = await req.json();
  } catch {
    return fail(400, "BAD_REQUEST", "Yêu cầu không hợp lệ.");
  }

  const store = progressStore();
  const key = `p/${username}`;

  if (body?.action === "get") {
    const rec = await store.get(key, { type: "json" });
    return json(200, rec ? { data: rec.data, updatedAt: rec.updatedAt } : { data: null, updatedAt: null });
  }

  if (body?.action === "put") {
    const data = sanitize(body.data);
    if (!data) return fail(400, "BAD_DATA", "Dữ liệu tiến trình không hợp lệ.");
    if (JSON.stringify(data).length > MAX_BYTES) return fail(413, "TOO_LARGE", "Dữ liệu quá lớn.");
    const updatedAt = new Date().toISOString();
    await store.setJSON(key, { data, updatedAt });
    return json(200, { updatedAt });
  }

  return fail(400, "BAD_REQUEST", "Yêu cầu không hợp lệ.");
}

export default async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (!originAllowed(req)) return forbidden();
  try {
    return withCors(req, await handle(req));
  } catch (err) {
    console.error("progress error:", err);
    return withCors(req, fail(500, "SERVER", "Máy chủ đang gặp sự cố. Bạn thử lại sau nhé."));
  }
};

export const config = {
  path: "/api/progress",
  rateLimit: { windowLimit: 40, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
