// ============================================================
// Tiện ích tài khoản dùng chung cho auth.mjs và progress.mjs.
//  - Mật khẩu: băm bằng scrypt (Node crypto) với salt ngẫu nhiên, không lưu mật khẩu gốc.
//  - Phiên: token ký HMAC-SHA256, hết hạn sau 60 ngày.
//  - Khoá ký: biến môi trường AUTH_SECRET; nếu chưa đặt thì tự sinh một lần và lưu trong Netlify Blobs.
// ============================================================
import { getStore } from "@netlify/blobs";
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHmac } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

export const TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;
export const USERNAME_RE = /^[a-z0-9_.]{3,24}$/;
export const MIN_PASSWORD = 6;
export const MAX_PASSWORD = 72;

export const usersStore = () => getStore({ name: "engquests-users", consistency: "strong" });
export const progressStore = () => getStore({ name: "engquests-progress", consistency: "strong" });
const metaStore = () => getStore({ name: "engquests-meta", consistency: "strong" });

export const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
export const fail = (status, code, message) => json(status, { error: { code, message } });

export function normalizeUsername(raw) {
  return String(raw || "").trim().toLowerCase();
}

export async function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : randomBytes(16);
  const hash = await scrypt(password, salt, 32);
  return { salt: salt.toString("hex"), hash: hash.toString("hex") };
}

export async function verifyPassword(password, user) {
  const { hash } = await hashPassword(password, user.salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(user.hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

let cachedSecret = null;
async function getSecret() {
  if (cachedSecret) return cachedSecret;
  const fromEnv = typeof Netlify !== "undefined" ? Netlify.env.get("AUTH_SECRET") : process.env.AUTH_SECRET;
  if (fromEnv && fromEnv.length >= 16) return (cachedSecret = fromEnv);
  const store = metaStore();
  let s = await store.get("auth-secret");
  if (!s) {
    // onlyIfNew: nếu hai request chạy cùng lúc thì chỉ một khoá được giữ lại
    await store.set("auth-secret", randomBytes(32).toString("hex"), { onlyIfNew: true });
    s = await store.get("auth-secret");
  }
  return (cachedSecret = s);
}

const b64 = (buf) => Buffer.from(buf).toString("base64url");

export async function signToken(username) {
  const payload = b64(JSON.stringify({ u: username, exp: Date.now() + TOKEN_TTL_MS }));
  const sig = createHmac("sha256", await getSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/** Trả về username nếu token hợp lệ và chưa hết hạn, ngược lại null */
export async function verifyToken(token) {
  if (typeof token !== "string") return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", await getSecret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { u, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!u || typeof exp !== "number" || exp < Date.now()) return null;
    return u;
  } catch {
    return null;
  }
}

export async function userFromRequest(req) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? verifyToken(m[1]) : null;
}
