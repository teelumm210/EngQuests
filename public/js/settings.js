// ============================================================
// EngQuests - Cài đặt người dùng (giao diện sáng/tối), lưu trong localStorage của trình duyệt.
// API key và model do server (Netlify Functions) quản lý, không nằm ở trình duyệt.
// ============================================================

const KEYS = {
  THEME: "voca_theme",
};

const THEME_COLORS = { light: "#ffffff", dark: "#212121" };

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    if (value === null || value === "") localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* bỏ qua: chế độ riêng tư có thể chặn localStorage */
  }
}

export class Settings {
  // ---- Giao diện sáng / tối ----
  /** Lựa chọn người dùng đã lưu ("light" | "dark"), hoặc null nếu chưa chọn */
  static getSavedTheme() {
    const t = read(KEYS.THEME);
    return t === "light" || t === "dark" ? t : null;
  }
  static systemTheme() {
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  static currentTheme() {
    return document.documentElement.dataset.theme === "light" ? "light" : "dark";
  }
  static applyTheme(theme) {
    const t = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = THEME_COLORS[t];
    return t;
  }
  static setTheme(theme) {
    write(KEYS.THEME, theme);
    return this.applyTheme(theme);
  }
  static toggleTheme() {
    return this.setTheme(this.currentTheme() === "light" ? "dark" : "light");
  }
  /** Gọi 1 lần khi khởi động: áp theme đã lưu, nếu chưa có thì theo hệ điều hành */
  static initTheme(onChange) {
    this.applyTheme(this.getSavedTheme() || this.systemTheme());
    onChange?.(this.currentTheme());
    // Chưa chọn thủ công thì tự đổi theo hệ điều hành
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    mq?.addEventListener?.("change", () => {
      if (!this.getSavedTheme()) {
        this.applyTheme(this.systemTheme());
        onChange?.(this.currentTheme());
      }
    });
  }
}
