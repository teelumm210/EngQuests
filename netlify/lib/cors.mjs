// ============================================================
// CORS dùng chung cho các Netlify Function.
// Cho phép trang EngQuests chạy ở GitHub Pages gọi API trên Netlify.
// Thêm domain khác bằng biến môi trường ALLOWED_ORIGINS (cách nhau bằng dấu phẩy),
// ví dụ: https://ten-ban.github.io,https://engquests.com
// ============================================================
const DEFAULT_ORIGINS = ["https://teelumm210.github.io"];

function allowedOrigins() {
  const extra = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return [...DEFAULT_ORIGINS, ...extra];
}

/** Không có Origin (gọi trực tiếp), cùng host với site, hoặc nằm trong danh sách cho phép */
export function originAllowed(req) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    if (new URL(origin).host === new URL(req.url).host) return true;
  } catch {
    return false;
  }
  return allowedOrigins().includes(origin);
}

export function withCors(req, res) {
  const origin = req.headers.get("origin");
  const headers = new Headers(res.headers);
  if (origin && originAllowed(req)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return new Response(res.body, { status: res.status, headers });
}

export function preflight(req) {
  if (!originAllowed(req)) return new Response(null, { status: 403 });
  return withCors(
    req,
    new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    })
  );
}

export const forbidden = () =>
  new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "Không được phép." } }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
