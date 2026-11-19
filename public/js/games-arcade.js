// ============================================================
// EngQuests - Nhóm game arcade (canvas thuần, không thư viện)
//
//  6. Khủng long gõ từ   - gõ đúng từ để khủng long nhảy qua xương rồng
//  7. Khủng long đọc từ  - đọc đúng từ (nhận giọng nói) để khủng long nhảy
//  8. Máy bay bắn chim   - di chuyển máy bay, gõ từ để bắn đạn thẳng lên, né chim lao xuống
//
// Mỗi hàm start nhận cùng "api" như các game trong games.js:
//   { area, setStats, finish, pool, say }
// và trả về hàm dọn dẹp (dừng vòng lặp, tắt micro).
// ============================================================

import { SpeechListener } from "./pronunciation.js";

// ---------- Tiện ích ----------
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function el(tag, cls = "", html = "") {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

const hearts = (n, max = 3) => "❤️".repeat(Math.max(0, n)) + "🖤".repeat(Math.max(0, max - n));

/** Chuẩn hoá để so sánh từ: chữ thường, bỏ dấu câu */
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Khoảng cách chỉnh sửa (đủ nhanh cho từ ngắn) - dùng để châm chước nhận dạng giọng nói */
function distance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[m][n];
}

/** Lấy màu từ biến CSS để canvas theo đúng giao diện sáng/tối */
function palette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fb) => cs.getPropertyValue(name).trim() || fb;
  return {
    bg: v("--surface-2", "#22222e"),
    ink: v("--text-strong", "#ffffff"),
    mute: v("--text-3", "#888888"),
    accent: v("--accent", "#3b82f6"),
    danger: v("--danger", "#ef4444"),
    warn: v("--warn", "#f59e0b"),
    line: v("--border-strong", "rgba(255,255,255,0.14)"),
  };
}

function makeCanvas(w, h) {
  const canvas = el("canvas", "gx-canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.aspectRatio = `${w} / ${h}`;
  canvas.setAttribute("role", "img");
  const ctx = canvas.getContext("2d");
  return { canvas, ctx, dpr };
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Vòng lặp requestAnimationFrame, trả về hàm dừng (gọi nhiều lần vẫn an toàn) */
function startLoop(update) {
  let alive = true;
  let raf = 0;
  let last = performance.now();
  const frame = (now) => {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    if (alive) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
  };
}

/** Chỉ lấy từ đơn, toàn chữ cái, độ dài vừa phải để gõ/đọc được */
function playableWords(pool, count) {
  return shuffle(pool.filter((w) => /^[a-z]{3,9}$/i.test(w.en))).slice(0, count);
}

/** Tô từng chữ theo phần người chơi đã gõ */
function renderTyped(word, typed) {
  const t = typed.toLowerCase();
  return [...word]
    .map((ch, i) => {
      const cls = i < t.length ? (t[i] === ch.toLowerCase() ? "ok" : "bad") : "";
      return `<span class="${cls}">${esc(ch)}</span>`;
    })
    .join("");
}

function startOverlay(stage, label, onStart) {
  const wrap = el("div", "gx-start");
  const btn = el("button", "gm-btn gm-btn-primary", label);
  btn.type = "button";
  btn.addEventListener("click", () => {
    wrap.remove();
    onStart();
  });
  wrap.appendChild(btn);
  stage.appendChild(wrap);
}

// ============================================================
//  GAME 6 + 7: Khủng long vượt xương rồng (gõ / đọc)
// ============================================================
function startDino(api, mode) {
  const { area, setStats, finish, pool, say } = api;
  const speakMode = mode === "speak";

  if (speakMode && !SpeechListener.supported) {
    area.innerHTML =
      '<p class="gm-hint">Trình duyệt này chưa hỗ trợ nhận dạng giọng nói. Hãy thử Chrome hoặc Safari, hoặc chơi bản <b>Khủng long gõ từ</b>.</p>';
    return () => {};
  }

  const words = playableWords(pool, 12);
  if (words.length < 4) {
    area.innerHTML = '<p class="gm-hint">Chưa đủ từ để chơi game này.</p>';
    return () => {};
  }
  const total = words.length;

  const W = 600;
  const H = 190;
  const GROUND = 160;
  const DX = 70; // vị trí khủng long
  const DW = 28;
  const DH = 30;
  const JUMP_TIME = 0.75;
  const JUMP_HEIGHT = 66;

  area.innerHTML = `
    <p class="gm-hint">${
      speakMode
        ? "Xương rồng nào cũng có một từ. <b>Đọc đúng từ</b> rồi khủng long sẽ <b>tự nhảy</b> khi tới gần xương rồng."
        : "Xương rồng nào cũng có một từ. <b>Gõ đúng từ</b> rồi khủng long sẽ <b>tự nhảy</b> khi tới gần xương rồng."
    }</p>
    <div class="gx-stage"></div>
    <div class="gx-panel">
      <div class="gx-target">
        <span class="gx-word" aria-live="polite"></span>
        <span class="gx-vi"></span>
      </div>
      <div class="gx-controls"></div>
      <div class="gx-msg" aria-live="polite"></div>
    </div>`;
  const stage = area.querySelector(".gx-stage");
  const wordEl = area.querySelector(".gx-word");
  const viEl = area.querySelector(".gx-vi");
  const controls = area.querySelector(".gx-controls");
  const msg = area.querySelector(".gx-msg");

  const { canvas, ctx, dpr } = makeCanvas(W, H);
  canvas.setAttribute("aria-label", "Khủng long chạy và nhảy qua xương rồng");
  stage.appendChild(canvas);

  // ---------- Trạng thái ----------
  let lives = 3;
  let cleared = 0;
  let idx = 0;
  let score = 0;
  let cactus = null;
  let gap = 0.5;
  let flash = 0;
  let over = false;
  let scroll = 0;
  let clock = 0;
  let jumpT = -1;
  const missed = [];
  let stopLoop = null;
  let pal = palette();

  const renderStats = () => setStats(`<span>${hearts(lives)}</span><span>🌵 ${cleared}/${total}</span>`);
  renderStats();

  // ---------- Điều khiển ----------
  let input = null;
  let micBtn = null;
  let heardEl = null;
  const listener = new SpeechListener("en-US");
  let listening = false;

  if (speakMode) {
    controls.innerHTML = `
      <button type="button" class="gm-btn gm-btn-primary gx-mic" disabled>Nhấn để đọc</button>
      <button type="button" class="gm-btn gm-btn-ghost gx-hear" disabled>Nghe mẫu</button>
      <div class="gx-heard"></div>`;
    micBtn = controls.querySelector(".gx-mic");
    heardEl = controls.querySelector(".gx-heard");
    controls.querySelector(".gx-hear").addEventListener("click", () => cactus && say(cactus.word.en));
  } else {
    controls.innerHTML = `
      <input class="gx-input" type="text" inputmode="text" enterkeyhint="done" autocomplete="off"
        autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Gõ từ trên xương rồng…"
        aria-label="Gõ từ tiếng Anh">`;
    input = controls.querySelector(".gx-input");
  }

  // Bàn phím điện thoại (Gboard...) đôi khi giữ lại chữ cũ sau khi xoá ô nhập, nên chỉ xét phần đuôi
  // có độ dài bằng từ cần gõ: "xcat" vẫn tính là đã gõ "cat".
  const tail = (typed, word) => {
    const t = norm(typed).replace(/ /g, "");
    const w = norm(word).replace(/ /g, "");
    return t.length > w.length ? t.slice(-w.length) : t;
  };
  const typedOk = (typed, word) => tail(typed, word) === norm(word).replace(/ /g, "");

  // Giữ con trỏ trong ô nhập suốt ván để không phải chạm lại (và bàn phím điện thoại không bị đóng)
  const focusInput = () => {
    if (!input || over) return;
    try {
      if (document.activeElement !== input) input.focus({ preventScroll: true });
    } catch {
      /* bỏ qua */
    }
  };
  // Khi bàn phím mở, kéo khung game lên để vẫn nhìn thấy khủng long
  const keepStageVisible = () => {
    setTimeout(() => {
      try {
        stage.scrollIntoView({ block: "nearest", behavior: "auto" });
      } catch {
        /* bỏ qua */
      }
    }, 250);
  };

  const showWord = (typed = "") => {
    if (!cactus) {
      wordEl.innerHTML = "";
      viEl.textContent = "";
      return;
    }
    wordEl.innerHTML = speakMode ? esc(cactus.word.en) : renderTyped(cactus.word.en, tail(typed, cactus.word.en));
    viEl.textContent = cactus.word.vi;
  };

  const setMsg = (text, kind = "") => {
    msg.textContent = text;
    msg.className = `gx-msg ${kind}`.trim();
  };

  function arm() {
    if (!cactus || cactus.armed) return;
    cactus.armed = true;
    if (!speakMode) say(cactus.word.en);
    setMsg("Chuẩn rồi! Khủng long sẽ tự nhảy khi tới gần xương rồng.", "ok");
    if (input) {
      input.value = "";
      focusInput();
    }
  }

  if (input) {
    input.addEventListener("input", () => {
      if (!cactus || cactus.armed || over) return;
      const typed = input.value.trim();
      showWord(typed);
      if (typedOk(typed, cactus.word.en)) arm();
    });
    input.addEventListener("focus", keepStageVisible);
    // Chạm vào khung game (cử chỉ của người dùng) để lấy lại bàn phím nếu lỡ bị tắt
    stage.addEventListener("pointerdown", () => focusInput());
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (!cactus || cactus.armed || over) return;
      if (typedOk(input.value, cactus.word.en)) arm();
      else setMsg("Chưa đúng, thử lại nhé.", "bad");
    });
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  // Sau lần bấm micro đầu tiên thành công, các xương rồng sau tự bật nghe, không cần bấm nữa
  let autoListen = false;

  async function listenOnce(fromAuto = false) {
    if (listening || !cactus || cactus.armed || over) return;
    const target = cactus;
    const want = norm(target.word.en);
    listening = true;
    let retry = false;
    micBtn.classList.add("is-live");
    micBtn.textContent = "Đang nghe…";
    heardEl.textContent = "";
    try {
      const matches = (text) => {
        const tokens = norm(text).split(" ").filter(Boolean);
        return tokens.some((tk) => tk === want || (want.length >= 5 && distance(tk, want) <= 1));
      };
      // earlyMatch: khớp ngay trên kết quả tạm thì nhảy luôn, không chờ trình duyệt tự cắt giọng
      const alts = await listener.listen({ onInterim: (t) => (heardEl.textContent = t), earlyMatch: matches });
      if (over || target !== cactus) return;
      if (!isIOS) autoListen = true;
      const ok = alts.some((a) => matches(a.text));
      if (ok) {
        heardEl.textContent = "";
        arm();
      } else {
        const heard = norm(alts[0]?.text || "");
        heardEl.textContent = heard ? `Nghe được: "${heard}". Thử lại nhé.` : "Chưa nghe rõ, thử lại nhé.";
        retry = true;
      }
    } catch (err) {
      const code = err?.code;
      if (code === "not-allowed" || code === "audio-capture" || code === "network" || code === "unsupported") autoListen = false;
      else if (code === "no-speech") retry = true;
      heardEl.textContent =
        code === "not-allowed"
          ? "Hãy cho phép trang web dùng micro rồi thử lại."
          : code === "no-speech"
            ? "Chưa nghe thấy gì, thử lại nhé."
            : code === "aborted"
              ? ""
              : "Không nhận dạng được, thử lại nhé.";
    } finally {
      listening = false;
      micBtn.classList.remove("is-live");
      micBtn.textContent = "Nhấn để đọc";
      // đang tự nghe: nghe lại ngay nếu chưa đọc đúng, không cần bấm
      if (autoListen && retry && !over && cactus && !cactus.armed) setTimeout(() => listenOnce(true), 80);
    }
  }

  if (micBtn) micBtn.addEventListener("click", () => listenOnce());

  // ---------- Vòng chơi ----------
  function spawn() {
    const word = words[idx];
    // Thời gian để gõ/đọc rút ngắn dần: tốc độ tính từ đó
    const lead = speakMode ? Math.max(3.6, 5.2 - cleared * 0.13) : Math.max(2.8, 3.9 - cleared * 0.1);
    const startX = W + 20;
    cactus = {
      word,
      x: startX,
      v: (startX - DX) / lead,
      w: 16 + Math.floor(Math.random() * 3) * 6,
      h: 28 + Math.floor(Math.random() * 3) * 6,
      armed: false,
      jumped: false,
    };
    showWord("");
    setMsg(speakMode ? "Nhấn nút micro và đọc to từ này." : "Gõ từ này thật nhanh.");
    if (input) {
      input.value = "";
      focusInput();
    }
    if (micBtn) {
      micBtn.disabled = false;
      controls.querySelector(".gx-hear").disabled = false;
      if (autoListen && !listening) listenOnce();
    }
  }

  function endGame() {
    if (over) return;
    over = true;
    const xp = Math.min(30, Math.round(cleared * (speakMode ? 2.5 : 2)) + (cleared === total ? 6 : 0));
    finish({
      score,
      xp,
      headline: lives > 0 ? "Về đích an toàn!" : "Hết mạng rồi!",
      lines: [`Vượt qua ${cleared}/${total} xương rồng`],
      missed,
    });
  }

  function resolveCactus(hit) {
    const word = cactus.word;
    if (hit) {
      lives--;
      flash = 0.45;
      missed.push(word);
      setMsg(`Va phải xương rồng. Từ đó là "${word.en}" (${word.vi}).`, "bad");
    } else {
      cleared++;
      score += 10 + Math.max(0, lives - 1) * 2;
    }
    cactus = null;
    idx++;
    showWord("");
    if (input) input.value = "";
    if (micBtn) {
      try {
        listener.abort();
      } catch {
        /* bỏ qua */
      }
      micBtn.disabled = true;
      controls.querySelector(".gx-hear").disabled = true;
    }
    renderStats();
    if (lives <= 0 || idx >= total) {
      setTimeout(endGame, 500);
      gap = Infinity;
    } else {
      gap = 0.9;
    }
  }

  function update(dt) {
    clock += dt;
    if (flash > 0) flash = Math.max(0, flash - dt);
    scroll = (scroll + (cactus ? cactus.v : 90) * dt) % 40;

    if (cactus && !over) {
      cactus.x -= cactus.v * dt;
      if (cactus.armed && !cactus.jumped && jumpT < 0) {
        // Đã gõ/đọc xong: khủng long tự nhảy khi xương rồng đã tới gần
        // (đỉnh cú nhảy rơi đúng vào giữa xương rồng). Nếu xong muộn thì nhảy ngay.
        const centerX = DX + DW / 2 - cactus.w / 2;
        if ((cactus.x - centerX) / cactus.v <= JUMP_TIME / 2) {
          jumpT = 0;
          cactus.jumped = true;
        }
      }
    }
    if (jumpT >= 0) {
      jumpT += dt;
      if (jumpT >= JUMP_TIME) jumpT = -1;
    }
    const jumpY = jumpT >= 0 ? 4 * JUMP_HEIGHT * (jumpT / JUMP_TIME) * (1 - jumpT / JUMP_TIME) : 0;

    if (cactus && !over) {
      const left = DX + 4;
      const right = DX + DW - 4;
      const safe = cactus.armed && cactus.jumped; // đã hoàn thành chữ và đang nhảy: luôn qua an toàn
      if (!safe && cactus.x < right && cactus.x + cactus.w > left && jumpY < cactus.h - 3) resolveCactus(true);
      else if (cactus.x + cactus.w < left) resolveCactus(false);
    } else if (!cactus && !over && idx < total) {
      gap -= dt;
      if (gap <= 0) spawn();
    }
    draw(jumpY);
  }

  function draw(jumpY) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);

    // mặt đất
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND + 1);
    ctx.lineTo(W, GROUND + 1);
    ctx.stroke();
    ctx.fillStyle = pal.mute;
    for (let x = -scroll; x < W; x += 40) ctx.fillRect(x + 10, GROUND + 10, 10, 2);

    // xương rồng + từ
    if (cactus) {
      const c = cactus;
      ctx.fillStyle = c.armed ? pal.accent : "#4b8f5a";
      roundRect(ctx, c.x, GROUND - c.h, c.w, c.h, 4);
      ctx.fill();
      roundRect(ctx, c.x - 7, GROUND - c.h * 0.7, 8, 5, 2);
      ctx.fill();
      roundRect(ctx, c.x - 7, GROUND - c.h * 0.7 - 8, 5, 12, 2);
      ctx.fill();
      roundRect(ctx, c.x + c.w - 1, GROUND - c.h * 0.55, 8, 5, 2);
      ctx.fill();
      roundRect(ctx, c.x + c.w + 2, GROUND - c.h * 0.55 - 8, 5, 12, 2);
      ctx.fill();

      ctx.font = '700 15px Inter, system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = c.word.en;
      const tw = ctx.measureText(label).width + 16;
      const lx = Math.min(W - tw / 2 - 4, Math.max(tw / 2 + 4, c.x + c.w / 2));
      const ly = GROUND - c.h - 24;
      ctx.fillStyle = c.armed ? pal.accent : pal.ink;
      roundRect(ctx, lx - tw / 2, ly - 12, tw, 24, 8);
      ctx.fill();
      ctx.fillStyle = c.armed ? "#06142e" : pal.bg;
      ctx.fillText(label, lx, ly + 1);
    }

    // khủng long
    const dy = GROUND - DH - jumpY;
    const step = jumpT >= 0 ? 0 : Math.floor(clock * 10) % 2;
    if (cactus && cactus.armed && jumpT < 0) {
      // vòng sáng nhấp nháy: đã sẵn sàng nhảy
      ctx.strokeStyle = pal.accent;
      ctx.globalAlpha = 0.45 + 0.35 * Math.sin(clock * 12);
      ctx.lineWidth = 2;
      roundRect(ctx, DX - 4, dy - 4, DW + 10, DH + 8, 8);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = pal.ink;
    ctx.fillRect(DX + 6, dy + 8, 18, 14); // thân
    ctx.fillRect(DX + 12, dy, 16, 12); // đầu
    ctx.fillRect(DX, dy + 12, 8, 6); // đuôi
    ctx.fillRect(DX + 9, dy + 22, 5, step ? 4 : 8); // chân
    ctx.fillRect(DX + 17, dy + 22, 5, step ? 8 : 4);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(DX + 22, dy + 3, 3, 3); // mắt

    if (flash > 0) {
      ctx.fillStyle = pal.danger;
      ctx.globalAlpha = Math.min(0.28, flash);
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Bắt đầu ----------
  draw(0);
  startOverlay(stage, "▶ Bắt đầu", () => {
    pal = palette();
    spawn();
    if (input) input.focus();
    stopLoop = startLoop(update);
  });

  return () => {
    stopLoop?.();
    try {
      listener.abort();
    } catch {
      /* bỏ qua */
    }
  };
}

// ============================================================
//  GAME 8: Máy bay bắn chim (gõ từ -> bắn đạn thẳng lên, né chim lao xuống)
// ============================================================
function startShooter(api) {
  const { area, setStats, finish, pool, say } = api;
  const base = playableWords(pool, 200);
  if (base.length < 4) {
    area.innerHTML = '<p class="gm-hint">Chưa đủ từ để chơi game này.</p>';
    return () => {};
  }

  const W = 400;
  const H = 440;
  const PLANE_Y = H - 46;
  const PLANE_R = 13;
  const ITEM_EVERY = 5; // hoàn thành 5 chữ -> có vật phẩm
  const MAX_LIVES = 5;

  area.innerHTML = `
    <p class="gm-hint">Gõ đúng từ ở dưới để bắn <b>loạt đạn tự dẫn hạ cả đàn chim</b> đang hiện trên màn hình. Hãy <b>di chuyển máy bay</b> (kéo trên màn hình, nút ◀ ▶ hoặc phím mũi tên) để né chim lao xuống. Cứ <b>${ITEM_EVERY} chữ</b> sẽ rơi ra một vật phẩm hỗ trợ.</p>
    <div class="gx-stage gx-portrait"></div>
    <div class="gx-panel">
      <div class="gx-target">
        <span class="gx-word" aria-live="polite"></span>
        <span class="gx-vi"></span>
      </div>
      <div class="gx-controls gx-move">
        <button type="button" class="gm-btn gm-btn-ghost gx-dir" data-dir="-1" aria-label="Sang trái">◀</button>
        <input class="gx-input" type="text" inputmode="text" enterkeyhint="done" autocomplete="off"
          autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Gõ từ để bắn…" aria-label="Gõ từ tiếng Anh" disabled>
        <button type="button" class="gm-btn gm-btn-ghost gx-dir" data-dir="1" aria-label="Sang phải">▶</button>
      </div>
      <div class="gx-msg" aria-live="polite"></div>
    </div>`;
  const stage = area.querySelector(".gx-stage");
  const wordEl = area.querySelector(".gx-word");
  const viEl = area.querySelector(".gx-vi");
  const input = area.querySelector(".gx-input");
  const msg = area.querySelector(".gx-msg");

  const { canvas, ctx, dpr } = makeCanvas(W, H);
  canvas.setAttribute("aria-label", "Máy bay bắn chim");
  canvas.classList.add("gx-drag");
  stage.appendChild(canvas);

  // ---------- Trạng thái ----------
  let queue = [];
  let cur = null;
  let completed = 0;
  let lives = 3;
  let score = 0;
  let elapsed = 0;
  let level = 1;
  let bannerT = 0;
  let waveT = 1.0;
  let flash = 0;
  let invuln = 0;
  let over = false;
  let running = false;
  let clock = 0;
  let shield = false;
  let spreadT = 0;
  let powerT = 0;
  let kills = 0;
  const plane = { x: W / 2, tx: W / 2 };
  let dir = 0;
  let bullets = [];
  let birds = [];
  let items = [];
  let particles = [];
  let popups = [];
  const stars = Array.from({ length: 36 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: 0.5 + Math.random() * 1.4 }));
  const missed = [];
  const missedSet = new Set();
  let stopLoop = null;
  let pal = palette();

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const renderStats = () => setStats(`<span>${hearts(lives, Math.max(3, lives))}</span><span>★ ${score}</span><span>Màn ${level}</span>`);
  renderStats();
  const setMsg = (text, kind = "") => {
    msg.textContent = text;
    msg.className = `gx-msg ${kind}`.trim();
  };
  const addMissed = (w) => {
    if (!w || missedSet.has(w.en)) return;
    missedSet.add(w.en);
    missed.push(w);
  };

  // ---------- Từ cần gõ ----------
  function nextWord() {
    if (!queue.length) queue = shuffle(base);
    cur = queue.pop();
    input.value = "";
    wordEl.innerHTML = renderTyped(cur.en, "");
    viEl.textContent = cur.vi;
  }

  // ---------- Bắn ----------
  // Mỗi từ gõ đúng bắn một LOẠT đạn tự dẫn: mỗi con chim đang hiện trên màn hình nhận đủ số viên để bị hạ,
  // nên một từ là hạ cả đàn. Chưa có chim nào thì bắn một viên thẳng lên như cũ.
  const HOMING_SPEED = 820;
  function fire() {
    const dmg = powerT > 0 ? 2 : 1;
    const y = PLANE_Y - 22;
    const targets = birds
      .filter((b) => b.hp > 0 && b.y > 0 && b.y < PLANE_Y - 8)
      .sort((a, b) => Math.abs(a.x - plane.x) - Math.abs(b.x - plane.x));
    if (!targets.length) {
      bullets.push({ x: plane.x, y, py: y, vx: 0, dmg });
      return;
    }
    const gap = spreadT > 0 ? 0.012 : 0.04; // vật phẩm "bắn dồn dập" xả đạn nhanh hơn
    let shot = 0;
    targets.slice(0, 18).forEach((bird) => {
      const need = Math.ceil(bird.hp / dmg);
      for (let k = 0; k < need; k++) {
        bullets.push({ x: plane.x, y, py: y, vx: 0, dmg, homing: bird, wait: Math.min(0.7, shot * gap) });
        shot++;
      }
    });
  }

  function dropItem() {
    const roll = Math.random();
    const kind = roll < 0.28 ? "spread" : roll < 0.52 ? "power" : roll < 0.74 ? "shield" : roll < 0.9 ? "bomb" : "life";
    items.push({ kind, x: rnd(36, W - 36), y: -16, t: 0 });
  }

  const ITEM_INFO = {
    spread: { label: "Bắn dồn dập", glyph: "≋", color: "#38bdf8" },
    power: { label: "Đạn mạnh x2", glyph: "×2", color: "#f59e0b" },
    shield: { label: "Khiên chắn", glyph: "◎", color: "#60a5fa" },
    bomb: { label: "Bom quét sạch", glyph: "✸", color: "#ef4444" },
    life: { label: "+1 mạng", glyph: "+", color: "#34d399" },
  };

  function collect(it) {
    const info = ITEM_INFO[it.kind];
    if (it.kind === "spread") spreadT = 12;
    if (it.kind === "power") powerT = 12;
    if (it.kind === "shield") shield = true;
    if (it.kind === "life") lives = Math.min(MAX_LIVES, lives + 1);
    if (it.kind === "bomb") {
      flash = 0.5;
      for (const b of birds) {
        b.hp -= b.type === "big" ? 2 : 99;
      }
      birds.forEach((b) => b.hp <= 0 && killBird(b));
      birds = birds.filter((b) => b.hp > 0);
    }
    popups.push({ x: plane.x, y: PLANE_Y - 40, text: info.label, life: 1.4, color: info.color });
    setMsg(`Nhặt được: ${info.label}`, "ok");
    renderStats();
  }

  // ---------- Chim ----------
  const TYPES = {
    small: { r: 12, hp: 1, pts: 10, sp: 1.0, color: "#f59e0b", wing: "#fbbf24" },
    mid: { r: 16, hp: 2, pts: 25, sp: 0.85, color: "#a78bfa", wing: "#c4b5fd" },
    armor: { r: 17, hp: 3, pts: 40, sp: 0.8, color: "#94a3b8", wing: "#cbd5e1" },
    big: { r: 23, hp: 5, pts: 70, sp: 0.6, color: "#ef4444", wing: "#fca5a5" },
  };

  function pickType() {
    const r = Math.random();
    if (level >= 5 && r < 0.12) return "big";
    if (level >= 4 && r < 0.3) return "armor";
    if (level >= 2 && r < 0.2 + level * 0.04) return "mid";
    return "small";
  }

  function makeBird(x, y, vx, vy, extra = {}) {
    const type = extra.type || pickType();
    const T = TYPES[type];
    const hp = T.hp + (type === "big" ? Math.floor((level - 5) / 3) : 0);
    const diveChance = level >= 3 && type !== "big" ? Math.min(0.45, 0.12 * (level - 2)) : 0;
    birds.push({
      type,
      bx: x,
      by: y,
      x,
      y,
      vx,
      vy,
      amp: extra.amp || 0,
      freq: extra.freq || 0,
      phase: extra.phase || 0,
      hp,
      maxHp: hp,
      r: T.r,
      pts: T.pts,
      age: 0,
      side: !!extra.side,
      diveAt: Math.random() < diveChance ? rnd(1.6, 4.2) : -1,
      diving: false,
      warn: 0,
    });
  }

  function spawnWave() {
    const speedMul = Math.min(2.2, 1 + 0.09 * (level - 1));
    const count = Math.min(12, 3 + level + Math.floor(Math.random() * 2));
    const vy = 46 * speedMul;
    const forms = ["row", "vee", "column", "wave", "side"];
    const pickMax = level < 2 ? 2 : level < 3 ? 3 : level < 4 ? 4 : 5;
    const form = forms[Math.floor(Math.random() * pickMax)];
    const n = form === "column" ? Math.min(count, 5) : count;
    const gapX = Math.min(52, (W - 60) / Math.max(1, n - 1));

    if (form === "row") {
      const x0 = W / 2 - (gapX * (n - 1)) / 2;
      for (let i = 0; i < n; i++) makeBird(x0 + i * gapX, -20, 0, vy);
    } else if (form === "vee") {
      const mid = (n - 1) / 2;
      const cx = rnd(W * 0.3, W * 0.7);
      for (let i = 0; i < n; i++) makeBird(clamp(cx + (i - mid) * 36, 20, W - 20), -20 - Math.abs(i - mid) * 28, 0, vy);
    } else if (form === "column") {
      const x = rnd(50, W - 50);
      for (let i = 0; i < n; i++) makeBird(x, -20 - i * 44, 0, vy * 1.15);
    } else if (form === "wave") {
      const x0 = W / 2 - (gapX * (n - 1)) / 2;
      for (let i = 0; i < n; i++) makeBird(x0 + i * gapX, -20 - (i % 2) * 24, 0, vy * 0.9, { amp: 34, freq: 2.1, phase: i * 0.7 });
    } else {
      const fromLeft = Math.random() < 0.5;
      const sp = 95 * speedMul;
      for (let i = 0; i < n; i++) {
        const y = 40 + (i % 4) * 34 + Math.floor(i / 4) * 12;
        const delay = i * 42;
        makeBird(fromLeft ? -20 - delay : W + 20 + delay, y, fromLeft ? sp : -sp, 14 * speedMul, { side: true, amp: 10, freq: 3, phase: i });
      }
    }
  }

  function killBird(b) {
    kills++;
    score += b.pts;
    burst(b.x, b.y, TYPES[b.type].color);
    popups.push({ x: b.x, y: b.y - 10, text: `+${b.pts}`, life: 0.8, color: "#ffffff" });
    renderStats();
  }

  function burst(x, y, color = "#f59e0b") {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 50 + Math.random() * 130;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.55, color });
    }
  }

  function hurt() {
    if (invuln > 0 || over) return;
    if (shield) {
      shield = false;
      invuln = 1.0;
      popups.push({ x: plane.x, y: PLANE_Y - 36, text: "Khiên vỡ!", life: 1, color: "#60a5fa" });
      return;
    }
    lives--;
    invuln = 1.8;
    flash = 0.45;
    renderStats();
    if (lives <= 0) {
      over = true;
      input.disabled = true;
      setTimeout(endGame, 700);
    }
  }

  function endGame() {
    const xp = Math.min(30, Math.round(completed * 1.5) + (completed > 0 ? level : 0));
    finish({
      score,
      xp,
      headline: level >= 6 ? "Phi công siêu hạng!" : "Máy bay bị hạ rồi!",
      lines: [`Gõ đúng ${completed} từ · bắn hạ ${kills} con chim · đến màn ${level}`],
      missed,
    });
  }

  // ---------- Nhập liệu ----------
  input.addEventListener("input", () => {
    if (!cur || over) return;
    const typed = input.value.trim();
    wordEl.innerHTML = renderTyped(cur.en, typed);
    if (norm(typed) === norm(cur.en)) {
      completed++;
      say(cur.en);
      fire();
      setMsg("");
      if (completed % ITEM_EVERY === 0) {
        dropItem();
        setMsg("Có vật phẩm rơi xuống, hãy đón lấy!", "ok");
      }
      nextWord();
    }
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (cur && norm(input.value) !== norm(cur.en)) {
        addMissed(cur);
        setMsg(`Chưa đúng. Từ đó là "${cur.en}".`, "bad");
      }
    }
  });

  const onKeyDown = (e) => {
    if (e.key === "ArrowLeft") {
      dir = -1;
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      dir = 1;
      e.preventDefault();
    }
  };
  const onKeyUp = (e) => {
    if ((e.key === "ArrowLeft" && dir < 0) || (e.key === "ArrowRight" && dir > 0)) dir = 0;
  };
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);

  area.querySelectorAll(".gx-dir").forEach((btn) => {
    const d = Number(btn.dataset.dir);
    const down = (e) => {
      e.preventDefault(); // giữ bàn phím không bị tắt
      dir = d;
    };
    const up = () => {
      if (dir === d) dir = 0;
    };
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointerleave", up);
    btn.addEventListener("pointercancel", up);
  });

  let dragging = false;
  const dragTo = (e) => {
    const rect = canvas.getBoundingClientRect();
    plane.tx = clamp(((e.clientX - rect.left) / rect.width) * W, 20, W - 20);
  };
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* bỏ qua */
    }
    dragTo(e);
  });
  canvas.addEventListener("pointermove", (e) => dragging && dragTo(e));
  const endDrag = () => (dragging = false);
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  // ---------- Cập nhật ----------
  function update(dt) {
    clock += dt;
    if (!running) return draw();
    if (flash > 0) flash = Math.max(0, flash - dt);
    if (invuln > 0) invuln = Math.max(0, invuln - dt);
    if (bannerT > 0) bannerT -= dt;
    if (spreadT > 0) spreadT = Math.max(0, spreadT - dt);
    if (powerT > 0) powerT = Math.max(0, powerT - dt);

    if (!over) {
      elapsed += dt;
      const lv = 1 + Math.floor(elapsed / 18);
      if (lv !== level) {
        level = lv;
        bannerT = 1.8;
        renderStats();
      }
      waveT -= dt;
      if (waveT <= 0 || (birds.length === 0 && waveT > 1.2)) {
        if (waveT <= 0) {
          spawnWave();
          waveT = Math.max(3.4, 7.2 - level * 0.55);
        } else {
          waveT = 0.6;
        }
      }
    }

    if (dir) plane.tx = clamp(plane.tx + dir * 340 * dt, 20, W - 20);
    const dx = plane.tx - plane.x;
    plane.x += Math.sign(dx) * Math.min(Math.abs(dx), 460 * dt);

    // đạn
    for (const b of bullets) {
      if (b.homing) {
        if (b.wait > 0) {
          // đang chờ tới lượt bắn: nằm ở đầu máy bay
          b.wait -= dt;
          b.x = plane.x;
          b.y = b.py = PLANE_Y - 22;
          continue;
        }
        // mục tiêu đã chết (do viên khác hoặc va chạm): chuyển sang con chim gần nhất còn sống
        if (!b.homing || b.homing.hp <= 0 || !birds.includes(b.homing)) {
          let best = null;
          let bd = Infinity;
          for (const c of birds) {
            if (c.hp <= 0 || c.y < 0) continue;
            const d = Math.hypot(c.x - b.x, c.y - b.y);
            if (d < bd) {
              bd = d;
              best = c;
            }
          }
          b.homing = best;
        }
        b.py = b.y;
        if (b.homing) {
          const dx = b.homing.x - b.x;
          const dy = b.homing.y - b.y;
          const d = Math.hypot(dx, dy) || 1;
          const step = Math.min(d, HOMING_SPEED * dt);
          b.x += (dx / d) * step;
          b.y += (dy / d) * step;
        } else {
          b.y -= 560 * dt; // hết chim: bay thẳng lên
        }
        continue;
      }
      b.py = b.y;
      b.y -= 560 * dt;
      b.x += b.vx * dt;
    }
    for (const b of bullets) {
      if (b.homing) {
        if (b.wait > 0 || b.dead) continue;
        const bird = b.homing;
        if (bird && bird.hp > 0 && Math.hypot(b.x - bird.x, b.y - bird.y) < bird.r + 7) {
          bird.hp -= b.dmg;
          b.dead = true;
          if (bird.hp <= 0) killBird(bird);
          else burst(b.x, b.y, "#ffffff");
        }
        continue;
      }
      for (const bird of birds) {
        if (bird.hp <= 0) continue;
        const hitX = Math.abs(b.x - bird.x) < bird.r + 3;
        const hitY = bird.y + bird.r >= b.y && bird.y - bird.r <= b.py;
        if (hitX && hitY) {
          bird.hp -= b.dmg;
          b.dead = true;
          if (bird.hp <= 0) killBird(bird);
          else burst(b.x, b.y, "#ffffff");
          break;
        }
      }
    }
    bullets = bullets.filter((b) => !b.dead && b.y > -20 && b.x > -20 && b.x < W + 20 && b.y < H + 20);

    // chim
    for (const bird of birds) {
      bird.age += dt;
      if (bird.diveAt > 0 && !bird.diving && bird.age >= bird.diveAt - 0.5 && bird.y > 20 && bird.y < H * 0.45) {
        bird.warn = 0.5;
        bird.diveAt = -1;
        bird.willDive = true;
      }
      if (bird.warn > 0) {
        bird.warn -= dt;
        if (bird.warn <= 0 && bird.willDive) {
          const ang = Math.atan2(PLANE_Y - bird.y, plane.x - bird.x);
          const sp = 150 + level * 14;
          bird.vx = Math.cos(ang) * sp;
          bird.vy = Math.sin(ang) * sp;
          bird.amp = 0;
          bird.diving = true;
          bird.willDive = false;
        }
      } else {
        bird.bx += bird.vx * dt;
        bird.by += bird.vy * dt;
      }
      bird.x = bird.bx + (bird.amp ? bird.amp * Math.sin(bird.freq * bird.age + bird.phase) : 0);
      bird.y = bird.by;
      // va chạm với máy bay
      if (!over && Math.hypot(bird.x - plane.x, bird.y - PLANE_Y) < bird.r + PLANE_R - 2) {
        if (invuln <= 0) {
          bird.hp = 0;
          burst(bird.x, bird.y, TYPES[bird.type].color);
          hurt();
        }
      }
    }
    birds = birds.filter((b) => b.hp > 0 && b.y < H + 40 && b.y > -140 && (!b.side || b.age < 1 || (b.x > -60 && b.x < W + 60)));

    // vật phẩm
    for (const it of items) {
      it.t += dt;
      it.y += 70 * dt;
      if (!over && Math.hypot(it.x - plane.x, it.y - PLANE_Y) < 28) {
        it.dead = true;
        collect(it);
      }
    }
    items = items.filter((it) => !it.dead && it.y < H + 30);

    particles = particles.filter((p) => (p.life -= dt) > 0);
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 260 * dt;
    }
    popups = popups.filter((p) => (p.life -= dt) > 0);
    for (const p of popups) p.y -= 28 * dt;
    for (const s of stars) {
      s.y += 14 * s.s * dt;
      if (s.y > H) s.y = 0;
    }
    draw();
  }

  // ---------- Vẽ ----------
  function drawPlane() {
    if (invuln > 0 && Math.floor(invuln * 12) % 2 === 0) return;
    ctx.save();
    ctx.translate(plane.x, PLANE_Y);
    ctx.fillStyle = "#e8eefc";
    ctx.beginPath(); // thân
    ctx.moveTo(0, -22);
    ctx.quadraticCurveTo(7, -8, 6, 14);
    ctx.lineTo(-6, 14);
    ctx.quadraticCurveTo(-7, -8, 0, -22);
    ctx.fill();
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath(); // cánh
    ctx.moveTo(-5, -2);
    ctx.lineTo(-26, 16);
    ctx.lineTo(-26, 21);
    ctx.lineTo(-5, 14);
    ctx.lineTo(5, 14);
    ctx.lineTo(26, 21);
    ctx.lineTo(26, 16);
    ctx.lineTo(5, -2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath(); // đuôi
    ctx.moveTo(-6, 10);
    ctx.lineTo(-14, 22);
    ctx.lineTo(14, 22);
    ctx.lineTo(6, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#0a1428";
    ctx.beginPath();
    ctx.ellipse(0, -8, 3, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    const f = 4 + Math.abs(Math.sin(clock * 30)) * 5; // lửa động cơ
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.moveTo(-3, 14);
    ctx.lineTo(0, 14 + f);
    ctx.lineTo(3, 14);
    ctx.fill();
    if (shield) {
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.6 + 0.3 * Math.sin(clock * 8);
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawBird(b) {
    const T = TYPES[b.type];
    const flap = Math.sin(clock * 14 + b.phase * 3);
    const warn = b.warn > 0 && Math.floor(b.warn * 16) % 2 === 0;
    ctx.save();
    ctx.translate(b.x, b.y);
    if (b.diving) ctx.rotate(Math.atan2(b.vy, b.vx) - Math.PI / 2);
    const r = b.r;
    ctx.fillStyle = warn ? "#ef4444" : T.wing;
    ctx.beginPath(); // hai cánh
    ctx.moveTo(-r * 0.3, 0);
    ctx.lineTo(-r * 1.25, -r * 0.2 - flap * r * 0.55);
    ctx.lineTo(-r * 0.4, r * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(r * 0.3, 0);
    ctx.lineTo(r * 1.25, -r * 0.2 - flap * r * 0.55);
    ctx.lineTo(r * 0.4, r * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = warn ? "#ef4444" : T.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.62, r * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath(); // mỏ
    ctx.moveTo(-r * 0.16, r * 0.62);
    ctx.lineTo(0, r * 1.0);
    ctx.lineTo(r * 0.16, r * 0.62);
    ctx.fill();
    ctx.fillStyle = "#0a1428";
    ctx.beginPath();
    ctx.arc(-r * 0.2, r * 0.3, r * 0.1, 0, Math.PI * 2);
    ctx.arc(r * 0.2, r * 0.3, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    if (b.type === "armor") {
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    if (b.maxHp > 1) {
      const w = r * 1.6;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(b.x - w / 2, b.y - r - 9, w, 4);
      ctx.fillStyle = "#34d399";
      ctx.fillRect(b.x - w / 2, b.y - r - 9, (w * Math.max(0, b.hp)) / b.maxHp, 4);
    }
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#07122b");
    g.addColorStop(1, "#1a4a94");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ffffff";
    for (const s of stars) {
      ctx.globalAlpha = 0.25 + 0.15 * s.s;
      ctx.fillRect(s.x, s.y, s.s * 1.4, s.s * 1.4);
    }
    ctx.globalAlpha = 1;

    for (const it of items) {
      const info = ITEM_INFO[it.kind];
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.fillStyle = "rgba(10,20,40,0.75)";
      ctx.strokeStyle = info.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 16 + Math.sin(it.t * 6) * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = info.color;
      ctx.font = "800 15px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(info.glyph, 0, 1);
      ctx.restore();
    }

    birds.forEach(drawBird);
    drawPlane();

    ctx.fillStyle = powerT > 0 ? "#fbbf24" : "#e2e8f0";
    for (const b of bullets) {
      if (b.wait > 0) continue; // chưa tới lượt bắn
      roundRect(ctx, b.x - 2, b.y - 8, 4, 14, 2), ctx.fill();
    }

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / 0.55);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 4, 4);
    }
    ctx.globalAlpha = 1;

    ctx.font = "700 13px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of popups) {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, clamp(p.x, 50, W - 50), p.y);
    }
    ctx.globalAlpha = 1;

    // thanh trạng thái vật phẩm + tiến độ vật phẩm kế tiếp
    ctx.textAlign = "left";
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    const buffs = [];
    if (spreadT > 0) buffs.push(`Tỏa ${Math.ceil(spreadT)}s`);
    if (powerT > 0) buffs.push(`x2 ${Math.ceil(powerT)}s`);
    if (shield) buffs.push("Khiên");
    ctx.fillText(buffs.join("  ·  "), 10, 14);
    const prog = completed % ITEM_EVERY;
    for (let i = 0; i < ITEM_EVERY; i++) {
      ctx.fillStyle = i < prog ? "#60a5fa" : "rgba(255,255,255,0.22)";
      ctx.fillRect(W - 12 - (ITEM_EVERY - i) * 14, 9, 10, 6);
    }

    if (bannerT > 0) {
      ctx.globalAlpha = Math.min(1, bannerT);
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 26px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`MÀN ${level}`, W / 2, H * 0.32);
      ctx.font = "600 13px Inter, system-ui, sans-serif";
      ctx.fillText("Chim đông hơn, bay nhanh hơn", W / 2, H * 0.32 + 26);
      ctx.globalAlpha = 1;
    }

    if (flash > 0) {
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = Math.min(0.35, flash);
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  draw();
  startOverlay(stage, "▶ Bắt đầu", () => {
    pal = palette();
    running = true;
    input.disabled = false;
    nextWord();
    input.focus({ preventScroll: true });
    stopLoop = startLoop(update);
  });

  return () => {
    stopLoop?.();
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keyup", onKeyUp);
  };
}

export const startDinoType = (api) => startDino(api, "type");
export const startDinoSpeak = (api) => startDino(api, "speak");
export const startPlaneShooter = (api) => startShooter(api);

// Tiện ích dùng chung cho các game canvas khác (games-fish.js)
export { esc, shuffle, el, norm, palette, makeCanvas, roundRect, startLoop, playableWords, renderTyped, startOverlay, hearts };
