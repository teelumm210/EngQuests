// ============================================================
// EngQuests - Tài khoản & đồng bộ tiến trình
// Người dùng có thể dùng ẩn danh như trước (dữ liệu nằm trong trình duyệt). Khi đăng nhập,
// tiến trình (từ vựng, XP, streak, điểm game, nhiệm vụ camera) được gộp với bản trên tài khoản
// và tự đồng bộ sau mỗi thay đổi, nên đổi máy hay xoá dữ liệu trình duyệt vẫn không mất.
// ============================================================

import { API_BASE } from "./config.js";
import { mergeSnapshots } from "./sync-merge.js";

const AUTH_KEY = "eq_auth";
const KEYS = {
  words: "voca_words",
  tombstones: "voca_deleted_words",
  stats: "voca_stats",
  streak: "voca_streak",
  xp: "voca_xp",
  goal: "voca_daily_goal",
  best: "engquests_game_best",
  quests: "engquests_quests",
};
const USERNAME_RE = /^[a-z0-9_.]{3,24}$/;
const SYNC_DEBOUNCE_MS = 4000;
const REQUEST_TIMEOUT_MS = 15000;

const $ = (sel) => document.querySelector(sel);

function readJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function collectLocal() {
  const out = {};
  for (const [name, key] of Object.entries(KEYS)) {
    const v = readJSON(key, undefined);
    if (v !== undefined) out[name] = v;
  }
  return out;
}

function applySnapshot(snap) {
  for (const [name, key] of Object.entries(KEYS)) {
    if (snap[name] === undefined) continue;
    try {
      localStorage.setItem(key, JSON.stringify(snap[name]));
    } catch {
      /* đầy bộ nhớ hoặc chế độ riêng tư: bỏ qua */
    }
  }
}

// So sánh nội dung không phụ thuộc thứ tự khoá
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function api(path, body, token) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${API_BASE}/api/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError("Không kết nối được tới máy chủ. Kiểm tra mạng của bạn.", 0, "NETWORK");
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* không phải JSON (trang lỗi 429 của Netlify...) */
  }
  if (!res.ok) {
    if (res.status === 404) throw new ApiError("Không tìm thấy máy chủ tài khoản (/api/" + path + "). Hãy chạy bằng `netlify dev` hoặc deploy lên Netlify.", 404, "NO_SERVER");
    if (res.status === 429) throw new ApiError("Bạn thao tác hơi nhanh. Đợi một lát rồi thử lại nhé.", 429, "RATE");
    throw new ApiError(data?.error?.message || "Máy chủ đang gặp sự cố. Bạn thử lại sau nhé.", res.status, data?.error?.code || "HTTP");
  }
  return data;
}

export function createAccounts({ showToast = () => {}, onApplied = () => {} } = {}) {
  // ---- DOM ----
  const btnAccount = $("#btn-account");
  const accountLabel = $("#account-label");
  const modal = $("#modal-account");
  const btnClose = $("#btn-close-account");
  const viewGuest = $("#account-view-guest");
  const viewUser = $("#account-view-user");
  const tabLogin = $("#acc-tab-login");
  const tabRegister = $("#acc-tab-register");
  const form = $("#account-form");
  const inUser = $("#acc-username");
  const inPass = $("#acc-password");
  const chkShow = $("#acc-show-pass");
  const btnSubmit = $("#acc-submit");
  const errEl = $("#acc-error");
  const userName = $("#acc-user-name");
  const syncStatus = $("#acc-sync-status");
  const btnSyncNow = $("#acc-sync-now");
  const btnLogout = $("#acc-logout");

  let auth = readJSON(AUTH_KEY, null);
  if (!auth || !auth.token || !auth.username) auth = null;
  let mode = "login";
  let dirty = false;
  let syncing = false;
  let pending = false;
  let applying = false;
  let timer = null;
  let lastSync = null;
  let lastError = "";

  // ---- Hiển thị ----
  function timeText(d) {
    return d ? d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "";
  }

  function renderStatus() {
    if (!syncStatus) return;
    if (syncing) syncStatus.textContent = "Đang đồng bộ…";
    else if (lastError) syncStatus.textContent = lastError;
    else if (dirty) syncStatus.textContent = "Có thay đổi, sắp đồng bộ…";
    else if (lastSync) syncStatus.textContent = `Đã đồng bộ lúc ${timeText(lastSync)}`;
    else syncStatus.textContent = "Chưa đồng bộ";
  }

  function render() {
    const loggedIn = !!auth;
    if (btnAccount) {
      btnAccount.classList.toggle("logged-in", loggedIn);
      btnAccount.title = loggedIn ? `Tài khoản: ${auth.username}` : "Đăng nhập để lưu tiến trình";
      btnAccount.setAttribute("aria-label", btnAccount.title);
    }
    if (accountLabel) accountLabel.textContent = loggedIn ? auth.username.slice(0, 1).toUpperCase() : "";
    if (viewGuest) viewGuest.hidden = loggedIn;
    if (viewUser) viewUser.hidden = !loggedIn;
    if (userName && auth) userName.textContent = auth.username;
    renderStatus();
  }

  function setMode(next) {
    mode = next;
    tabLogin?.classList.toggle("active", mode === "login");
    tabRegister?.classList.toggle("active", mode === "register");
    tabLogin?.setAttribute("aria-selected", String(mode === "login"));
    tabRegister?.setAttribute("aria-selected", String(mode === "register"));
    if (btnSubmit) btnSubmit.textContent = mode === "login" ? "Đăng nhập" : "Tạo tài khoản";
    if (inPass) inPass.autocomplete = mode === "login" ? "current-password" : "new-password";
    setError("");
  }

  function setError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || "";
    errEl.hidden = !msg;
  }

  function open() {
    render();
    setMode(mode);
    if (modal) modal.style.display = "flex";
    if (!auth) setTimeout(() => inUser?.focus({ preventScroll: true }), 50);
  }

  function close() {
    if (modal) modal.style.display = "none";
  }

  // ---- Phiên ----
  function saveAuth(a) {
    auth = a;
    try {
      if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a));
      else localStorage.removeItem(AUTH_KEY);
    } catch {
      /* bỏ qua */
    }
  }

  function logout({ silent = false } = {}) {
    saveAuth(null);
    clearTimeout(timer);
    dirty = false;
    lastSync = null;
    lastError = "";
    render();
    if (!silent) showToast("Đã đăng xuất. Dữ liệu vẫn được giữ trên máy này.", "info");
  }

  // ---- Đồng bộ ----
  async function syncNow() {
    if (!auth) return;
    if (syncing) {
      pending = true;
      return;
    }
    clearTimeout(timer);
    syncing = true;
    lastError = "";
    renderStatus();
    try {
      const cloud = await api("progress", { action: "get" }, auth.token);
      const local = collectLocal();
      const merged = mergeSnapshots(local, cloud.data || {});

      if (stable(merged) !== stable(local)) {
        applying = true;
        try {
          applySnapshot(merged);
        } finally {
          applying = false;
        }
        onApplied();
      }
      if (!cloud.data || stable(merged) !== stable(cloud.data)) {
        await api("progress", { action: "put", data: merged }, auth.token);
      }
      dirty = pending; // nếu có thay đổi trong lúc đồng bộ thì vòng sau xử lý
      lastSync = new Date();
    } catch (err) {
      if (err.status === 401) {
        logout({ silent: true });
        showToast("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.", "warning");
      } else {
        lastError = err.code === "NETWORK" ? "Chưa đồng bộ được (mất mạng). Sẽ thử lại khi có mạng." : err.message;
      }
    } finally {
      syncing = false;
      renderStatus();
      if (pending && auth) {
        pending = false;
        schedule();
      }
    }
  }

  function schedule() {
    if (!auth) return;
    dirty = true;
    renderStatus();
    clearTimeout(timer);
    timer = setTimeout(syncNow, SYNC_DEBOUNCE_MS);
  }

  // ---- Đăng nhập / đăng ký ----
  async function submit(e) {
    e?.preventDefault();
    const username = (inUser.value || "").trim().toLowerCase();
    const password = inPass.value || "";
    if (!USERNAME_RE.test(username)) return setError("Tên đăng nhập gồm 3-24 ký tự: chữ thường không dấu, số, dấu chấm hoặc gạch dưới.");
    if (password.length < 6) return setError("Mật khẩu cần ít nhất 6 ký tự.");
    setError("");
    btnSubmit.disabled = true;
    const label = btnSubmit.textContent;
    btnSubmit.textContent = "Đang xử lý…";
    try {
      const res = await api("auth", { action: mode, username, password });
      saveAuth({ token: res.token, username: res.username });
      inPass.value = "";
      render();
      showToast(mode === "register" ? "Đã tạo tài khoản! Đang lưu tiến trình của bạn…" : `Chào mừng trở lại, ${res.username}!`, "success");
      await syncNow();
    } catch (err) {
      setError(err.message);
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = label;
    }
  }

  // ---- Gắn sự kiện ----
  function init() {
    btnAccount?.addEventListener("click", open);
    btnClose?.addEventListener("click", close);
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
    tabLogin?.addEventListener("click", () => setMode("login"));
    tabRegister?.addEventListener("click", () => setMode("register"));
    form?.addEventListener("submit", submit);
    chkShow?.addEventListener("change", () => {
      inPass.type = chkShow.checked ? "text" : "password";
    });
    btnSyncNow?.addEventListener("click", async () => {
      await syncNow();
      if (!lastError) showToast("Đã đồng bộ tiến trình", "success");
      else showToast(lastError, "warning");
    });
    btnLogout?.addEventListener("click", () => {
      logout();
      close();
    });

    window.addEventListener("voca-data-changed", () => {
      if (!applying) schedule();
    });
    window.addEventListener("online", () => {
      if (auth && (dirty || lastError)) syncNow();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && auth && dirty) syncNow();
    });

    render();
    // Mở lại trang: kéo dữ liệu mới từ các thiết bị khác
    if (auth) setTimeout(syncNow, 1500);
  }

  return { init, open, close, syncNow, isLoggedIn: () => !!auth, username: () => auth?.username || null };
}
