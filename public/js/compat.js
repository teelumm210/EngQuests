// ============================================================
// EngQuests - Kiểm tra khả năng của trình duyệt + thông báo rõ ràng
//  - Nhận biết trình duyệt trong app (Zalo, Facebook, Messenger, Instagram, TikTok, Line...)
//    thường chặn micro/camera, kèm hướng dẫn mở bằng Safari/Chrome.
//  - Giải thích lỗi nhận giọng nói (SpeechRecognition) thay vì im lặng hoặc treo.
//  - Icon Material: ẩn chữ tên icon trong lúc font chưa tải, nếu font không tải được thì
//    thay bằng emoji để không bao giờ hiện chữ như "book_2".
// ============================================================

const UA = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";

const IN_APP = [
  [/Zalo/i, "Zalo"],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, "Facebook"],
  [/Messenger/i, "Messenger"],
  [/Instagram/i, "Instagram"],
  [/TikTok|musical_ly|BytedanceWebview|Bytedance/i, "TikTok"],
  [/Line\//i, "Line"],
  [/MicroMessenger/i, "WeChat"],
  [/Snapchat/i, "Snapchat"],
];

export function getEnv() {
  const isIOS = /iPad|iPhone|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(UA);
  const inApp = (IN_APP.find(([re]) => re.test(UA)) || [])[1] || null;
  const isSafari = /Safari/i.test(UA) && !/Chrome|CriOS|FxiOS|EdgiOS|OPiOS|Android/i.test(UA);
  return {
    isIOS,
    isAndroid,
    isMobile: isIOS || isAndroid,
    isSafari: isSafari || (isIOS && !inApp && !/CriOS|FxiOS|EdgiOS/.test(UA)),
    inApp,
    secure: typeof window !== "undefined" ? window.isSecureContext !== false : true,
    hasGetUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    hasAudioContext: !!(window.AudioContext || window.webkitAudioContext),
    hasWebSocket: typeof WebSocket !== "undefined",
    hasSpeechRecognition: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  };
}

function openAdvice(env) {
  const where = env.isIOS ? "Safari" : "Chrome";
  if (env.inApp) {
    return `Bạn đang mở EngQuests bên trong ${env.inApp}. Trình duyệt này thường chặn micro. Hãy bấm nút ⋯ (hoặc biểu tượng chia sẻ) rồi chọn “Mở bằng ${where}”, hoặc sao chép liên kết và dán vào ${where}.`;
  }
  return `Hãy mở EngQuests bằng ${where} để dùng micro.`;
}

/** Cuộc gọi thoại cần micro + WebSocket + Web Audio. Trả về {title, message} nếu không dùng được, ngược lại null. */
export function liveCallBlocker() {
  const env = getEnv();
  if (!env.secure) {
    return { title: "Cần kết nối bảo mật (HTTPS)", message: "Micro chỉ hoạt động trên trang HTTPS. Hãy mở EngQuests bằng địa chỉ bắt đầu bằng https://." };
  }
  if (!env.hasGetUserMedia) {
    return {
      title: "Trình duyệt này không cho dùng micro",
      message: `${openAdvice(env)} Bạn vẫn có thể nhắn chữ và dùng các tính năng khác bình thường.`,
      copyLink: !!env.inApp,
    };
  }
  if (!env.hasAudioContext || !env.hasWebSocket) {
    return {
      title: "Trình duyệt chưa hỗ trợ cuộc gọi thoại",
      message: "Trình duyệt của bạn thiếu tính năng âm thanh thời gian thực. Hãy cập nhật iOS/Safari hoặc mở bằng Chrome mới nhất.",
      copyLink: true,
    };
  }
  return null;
}

/** Nhập chữ bằng giọng nói (SpeechRecognition) */
export function speechBlocker() {
  const env = getEnv();
  if (env.hasSpeechRecognition) {
    if (env.inApp) {
      return {
        title: "Nhận giọng nói có thể không hoạt động",
        message: `${openAdvice(env)} Nếu thử không được, bạn vẫn có thể gõ chữ.`,
        copyLink: true,
        soft: true, // cho phép thử
      };
    }
    return null;
  }
  const where = env.isIOS ? "Safari (iOS 14.5 trở lên, đã bật Đọc chính tả trong Cài đặt > Cài đặt chung > Bàn phím)" : "Chrome hoặc Edge";
  return {
    title: "Nhập bằng giọng nói chưa dùng được",
    message: env.inApp
      ? `${openAdvice(env)} Bạn cũng có thể dùng nút micro trên bàn phím điện thoại để đọc chính tả vào ô chat.`
      : `Trình duyệt này không hỗ trợ nhận giọng nói. Hãy thử ${where}, hoặc dùng nút micro trên bàn phím điện thoại để đọc chính tả vào ô chat.`,
    copyLink: !!env.inApp,
  };
}

/** Dịch mã lỗi SpeechRecognition sang câu dễ hiểu */
export function speechErrorMessage(code) {
  const env = getEnv();
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return env.isIOS
        ? "Chưa được phép dùng micro hoặc đọc chính tả. Vào Cài đặt > Safari > Micro để cho phép, và bật Đọc chính tả trong Cài đặt > Cài đặt chung > Bàn phím."
        : "Chưa được phép dùng micro. Hãy bấm biểu tượng ổ khoá cạnh địa chỉ trang và cho phép Micro.";
    case "audio-capture":
      return "Không tìm thấy micro. Hãy kiểm tra micro của thiết bị rồi thử lại.";
    case "no-speech":
      return "Mình chưa nghe thấy bạn nói. Hãy bấm micro và nói lại nhé.";
    case "network":
      return "Nhận giọng nói cần có mạng. Hãy kiểm tra kết nối rồi thử lại.";
    case "language-not-supported":
      return "Trình duyệt chưa hỗ trợ ngôn ngữ này để nhận giọng nói.";
    case "aborted":
      return "";
    default:
      return "Nhận giọng nói gặp sự cố. Bạn thử lại hoặc gõ chữ nhé.";
  }
}

/** Dịch lỗi getUserMedia (micro/camera) */
export function mediaErrorMessage(err, what = "micro") {
  const env = getEnv();
  const name = err?.name || "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return env.isIOS
      ? `Chưa được phép dùng ${what}. Vào Cài đặt > Safari > ${what === "camera" ? "Camera" : "Micro"} và chọn Hỏi hoặc Cho phép, rồi tải lại trang.`
      : `Chưa được phép dùng ${what}. Hãy bấm biểu tượng ổ khoá cạnh địa chỉ trang, cho phép ${what}, rồi thử lại.`;
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return `Không tìm thấy ${what} trên thiết bị này.`;
  if (name === "NotReadableError" || name === "AbortError") return `${what[0].toUpperCase() + what.slice(1)} đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại.`;
  if (!env.hasGetUserMedia) return `Trình duyệt này không cho dùng ${what}. ${openAdvice(env)}`;
  return `Không mở được ${what}. Bạn thử lại nhé.`;
}

// ---------- Hộp thông báo ----------
let noticeEl = null;

export function showNotice({ title, message, copyLink = false } = {}) {
  hideNotice();
  const wrap = document.createElement("div");
  wrap.className = "modal-overlay eq-notice";
  wrap.setAttribute("role", "alertdialog");
  wrap.setAttribute("aria-modal", "true");
  const card = document.createElement("div");
  card.className = "modal-card eq-notice-card";
  const h = document.createElement("h3");
  h.textContent = title || "Thông báo";
  const p = document.createElement("p");
  p.textContent = message || "";
  const row = document.createElement("div");
  row.className = "eq-notice-actions";
  if (copyLink) {
    const copy = document.createElement("button");
    copy.className = "btn-secondary";
    copy.type = "button";
    copy.textContent = "Sao chép liên kết";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        copy.textContent = "Đã sao chép ✓";
      } catch {
        window.prompt("Sao chép liên kết này:", location.href);
      }
    });
    row.appendChild(copy);
  }
  const ok = document.createElement("button");
  ok.className = "btn-primary";
  ok.type = "button";
  ok.textContent = "Đã hiểu";
  ok.addEventListener("click", hideNotice);
  row.appendChild(ok);
  card.append(h, p, row);
  wrap.appendChild(card);
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) hideNotice();
  });
  document.body.appendChild(wrap);
  noticeEl = wrap;
  ok.focus({ preventScroll: true });
}

export function hideNotice() {
  if (noticeEl) {
    noticeEl.remove();
    noticeEl = null;
  }
}

// ---------- Icon Material Symbols ----------
const ICON_EMOJI = {
  arrow_back: "←", arrow_forward: "→", arrow_upward: "↑", bar_chart: "📊", book_2: "📖", menu_book: "📖",
  call: "📞", close: "✕", extension: "🧩", flag: "🚩", format_quote: "❝", graphic_eq: "🎙️",
  list_alt: "📋", mic: "🎙️", photo_camera: "📷", settings: "⚙️", sports_esports: "🎮", style: "🃏",
  timer: "⏱️", translate: "🌐", volume_up: "🔊", search: "🔍", restaurant_menu: "🍽️", home: "🏠",
  check_circle: "✅", refresh: "🔄", person: "👤", logout: "🚪", sync: "🔄",
};

function applyEmojiFallback(root) {
  root.querySelectorAll?.(".material-symbols-rounded:not([data-fb])").forEach((el) => {
    const name = el.textContent.trim();
    el.dataset.fb = name;
    el.textContent = ICON_EMOJI[name] || "•";
  });
}

export function initIcons() {
  const root = document.documentElement;
  const ready = () => {
    if (root.classList.contains("icons-fallback")) return;
    root.classList.add("icons-ready");
  };
  const fallback = () => {
    if (root.classList.contains("icons-ready")) return;
    root.classList.add("icons-fallback");
    applyEmojiFallback(document);
    new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach((n) => n.nodeType === 1 && (n.matches?.(".material-symbols-rounded") ? applyEmojiFallback(n.parentNode) : applyEmojiFallback(n)));
    }).observe(document.body, { childList: true, subtree: true });
  };

  if (!document.fonts || !document.fonts.load) return ready();
  // Chờ font thật; quá 6 giây vẫn chưa có thì dùng emoji để không hiện chữ tên icon
  const timer = setTimeout(fallback, 6000);
  document.fonts
    .load('24px "Material Symbols Rounded"', "menu_book mic")
    .then((faces) => {
      clearTimeout(timer);
      faces && faces.length ? ready() : fallback();
    })
    .catch(() => {
      clearTimeout(timer);
      fallback();
    });
}
