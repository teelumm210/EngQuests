// ============================================================
// POST /api/auth  { action: "register" | "login", username, password }
// Trả về { token, username }. Tài khoản lưu trong Netlify Blobs (không cần email).
// ============================================================
import { originAllowed, withCors, preflight, forbidden } from "../lib/cors.mjs";
import {
  usersStore, json, fail, normalizeUsername, hashPassword, verifyPassword, signToken,
  USERNAME_RE, MIN_PASSWORD, MAX_PASSWORD,
} from "../lib/auth.mjs";

async function handle(req) {
  if (req.method !== "POST") return fail(405, "METHOD", "Method not allowed");

  let body;
  try {
    body = await req.json();
  } catch {
    return fail(400, "BAD_REQUEST", "Yêu cầu không hợp lệ.");
  }

  const action = body?.action;
  const username = normalizeUsername(body?.username);
  const password = typeof body?.password === "string" ? body.password : "";

  if (!USERNAME_RE.test(username)) {
    return fail(400, "BAD_USERNAME", "Tên đăng nhập gồm 3-24 ký tự: chữ thường không dấu, số, dấu chấm hoặc gạch dưới.");
  }
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    return fail(400, "BAD_PASSWORD", `Mật khẩu cần từ ${MIN_PASSWORD} đến ${MAX_PASSWORD} ký tự.`);
  }

  const users = usersStore();
  const key = `u/${username}`;

  if (action === "register") {
    const { salt, hash } = await hashPassword(password);
    const rec = { username, salt, hash, createdAt: new Date().toISOString() };
    // onlyIfNew: hai người đăng ký cùng tên cùng lúc thì chỉ một người được tạo
    const { modified } = await users.setJSON(key, rec, { onlyIfNew: true });
    if (!modified) return fail(409, "TAKEN", "Tên đăng nhập này đã có người dùng. Hãy chọn tên khác.");
    return json(200, { token: await signToken(username), username });
  }

  if (action === "login") {
    const user = await users.get(key, { type: "json" });
    // Luôn băm một lần để thời gian phản hồi không lộ tài khoản có tồn tại hay không
    const ok = user ? await verifyPassword(password, user) : (await hashPassword(password), false);
    if (!ok) return fail(401, "BAD_CREDENTIALS", "Tên đăng nhập hoặc mật khẩu không đúng.");
    return json(200, { token: await signToken(username), username });
  }

  return fail(400, "BAD_REQUEST", "Yêu cầu không hợp lệ.");
}

export default async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (!originAllowed(req)) return forbidden();
  try {
    return withCors(req, await handle(req));
  } catch (err) {
    console.error("auth error:", err);
    return withCors(req, fail(500, "SERVER", "Máy chủ đang gặp sự cố. Bạn thử lại sau nhé."));
  }
};

export const config = {
  path: "/api/auth",
  rateLimit: { windowLimit: 12, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
