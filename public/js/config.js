// ============================================
// EngQuests - Cấu hình địa chỉ API
//  - Chạy trên Netlify (hoặc netlify dev): gọi /api/... cùng domain.
//  - Chạy trên GitHub Pages: tự trỏ sang bản Netlify để dùng chat AI và gọi thoại.
// Có thể ghi đè bằng cách đặt window.ENGQUESTS_API_BASE trước khi tải app.js.
// ============================================
const NETLIFY_SITE = "https://engquests.netlify.app";

export const API_BASE =
  (typeof window !== "undefined" && window.ENGQUESTS_API_BASE) ||
  (typeof location !== "undefined" && /\.github\.io$/.test(location.hostname) ? NETLIFY_SITE : "");
