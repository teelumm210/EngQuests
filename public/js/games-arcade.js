// ============================================================
// EngQuests - Nhóm game arcade (canvas thuần, không thư viện)
//
//  6. Khủng long gõ từ   - gõ đúng từ để khủng long nhảy qua xương rồng
//  7. Khủng long đọc từ  - đọc đúng từ (nhận giọng nói) để khủng long nhảy
//  8. Máy bay bắn chim   - gõ lại từ cho sẵn, chọn nghĩa tiếng Việt để bắn chim
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
    accent: v("--accent", "#58CC02"),
    danger: v("--danger", "#FF4B4B"),
    warn: v("--warn", "#FF9600"),
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
        ? "Xương rồng nào cũng có một từ. <b>Đọc đúng từ</b> thì khủng long mới nhảy qua."
        : "Xương rồng nào cũng có một từ. <b>Gõ đúng từ</b> thì khủng long mới nhảy qua."
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
        aria-label="Gõ từ tiếng Anh" disabled>`;
    input = controls.querySelector(".gx-input");
  }

  const showWord = (typed = "") => {
    if (!cactus) {
      wordEl.innerHTML = "";
      viEl.textContent = "";
      return;
    }
    wordEl.innerHTML = speakMode ? esc(cactus.word.en) : renderTyped(cactus.word.en, typed);
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
    setMsg("Chuẩn rồi! Khủng long sẽ nhảy.", "ok");
    if (input) input.value = "";
  }

  if (input) {
    input.addEventListener("input", () => {
      if (!cactus || cactus.armed || over) return;
      const typed = input.value.trim();
      showWord(typed);
      if (norm(typed) === norm(cactus.word.en)) arm();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (!cactus || cactus.armed || over) return;
      if (norm(input.value) === norm(cactus.word.en)) arm();
      else setMsg("Chưa đúng, thử lại nhé.", "bad");
    });
  }

  if (micBtn) {
    micBtn.addEventListener("click", async () => {
      if (listening || !cactus || cactus.armed || over) return;
      const target = cactus;
      const want = norm(target.word.en);
      listening = true;
      micBtn.classList.add("is-live");
      micBtn.textContent = "Đang nghe…";
      heardEl.textContent = "";
      try {
        const alts = await listener.listen({ onInterim: (t) => (heardEl.textContent = t) });
        if (over || target !== cactus) return;
        const ok = alts.some((a) => {
          const tokens = norm(a.text).split(" ").filter(Boolean);
          return tokens.some((tk) => tk === want || (want.length >= 5 && distance(tk, want) <= 1));
        });
        if (ok) {
          heardEl.textContent = "";
          arm();
        } else {
          const heard = norm(alts[0]?.text || "");
          heardEl.textContent = heard ? `Nghe được: "${heard}". Thử lại nhé.` : "Chưa nghe rõ, thử lại nhé.";
        }
      } catch (err) {
        const code = err?.code;
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
      }
    });
  }

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
      input.disabled = false;
    }
    if (micBtn) {
      micBtn.disabled = false;
      controls.querySelector(".gx-hear").disabled = false;
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
    if (input) input.disabled = true;
    if (micBtn) {
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
      if (cactus.x < right && cactus.x + cactus.w > left && jumpY < cactus.h - 3) resolveCactus(true);
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
      ctx.fillStyle = c.armed ? pal.accent : "#3f8f2e";
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
      ctx.fillStyle = c.armed ? "#0b2a00" : pal.bg;
      ctx.fillText(label, lx, ly + 1);
    }

    // khủng long
    const dy = GROUND - DH - jumpY;
    const step = jumpT >= 0 ? 0 : Math.floor(clock * 10) % 2;
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
//  GAME 8: Máy bay bắn chim (gõ từ cho sẵn -> chọn nghĩa -> bắn)
// ============================================================
function startShooter(api) {
  const { area, setStats, finish, pool, say } = api;
  const words = playableWords(pool, 10);
  if (words.length < 4) {
    area.innerHTML = '<p class="gm-hint">Chưa đủ từ để chơi game này.</p>';
    return () => {};
  }
  const total = words.length;

  const W = 600;
  const H = 240;
  const PX = 64; // vị trí máy bay
  const STOP_X = 118; // chim chạm tới đây là mất mạng

  area.innerHTML = `
    <p class="gm-hint">Mỗi con chim mang một từ. <b>Gõ lại từ</b>, rồi <b>chọn nghĩa tiếng Việt</b> đúng để máy bay bắn hạ nó.</p>
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
  canvas.setAttribute("aria-label", "Máy bay bắn chim");
  stage.appendChild(canvas);

  // ---------- Trạng thái ----------
  let lives = 3;
  let hits = 0;
  let round = 0;
  let score = 0;
  let wrongThisRound = 0;
  let phase = "idle"; // idle | type | choose | shoot | fall | gap
  let bird = null;
  let bullet = null;
  let gap = 0.4;
  let flash = 0;
  let over = false;
  let clock = 0;
  let planeY = H / 2;
  let particles = [];
  const clouds = [
    { x: 80, y: 40, s: 1 },
    { x: 330, y: 80, s: 0.8 },
    { x: 540, y: 30, s: 1.2 },
  ];
  const missed = [];
  const missedSet = new Set();
  let stopLoop = null;
  let pal = palette();

  const renderStats = () => setStats(`<span>${hearts(lives)}</span><span>🎯 ${hits}/${total}</span>`);
  renderStats();

  const setMsg = (text, kind = "") => {
    msg.textContent = text;
    msg.className = `gx-msg ${kind}`.trim();
  };
  const addMissed = (w) => {
    if (missedSet.has(w.en)) return;
    missedSet.add(w.en);
    missed.push(w);
  };

  function showWord(typed = "") {
    if (!bird) {
      wordEl.innerHTML = "";
      viEl.textContent = "";
      return;
    }
    wordEl.innerHTML = renderTyped(bird.word.en, typed);
    viEl.textContent = phase === "type" ? "Bước 1: gõ lại từ này" : "Bước 2: chọn nghĩa đúng";
  }

  function showTypeStep() {
    phase = "type";
    controls.innerHTML = `
      <input class="gx-input" type="text" inputmode="text" enterkeyhint="done" autocomplete="off"
        autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Gõ từ trên con chim…"
        aria-label="Gõ từ tiếng Anh">`;
    const input = controls.querySelector(".gx-input");
    showWord("");
    const check = () => {
      if (phase !== "type" || !bird) return;
      showWord(input.value.trim());
      if (norm(input.value) === norm(bird.word.en)) showChooseStep();
    };
    input.addEventListener("input", check);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (norm(input.value) !== norm(bird?.word.en)) setMsg("Chưa đúng, thử lại nhé.", "bad");
      }
    });
    setMsg("");
    input.focus({ preventScroll: true });
  }

  function showChooseStep() {
    phase = "choose";
    say(bird.word.en);
    showWord(bird.word.en);
    const wrong = shuffle(
      [...new Set(pool.filter((w) => w.en !== bird.word.en && w.vi !== bird.word.vi).map((w) => w.vi))]
    ).slice(0, 3);
    const options = shuffle([bird.word.vi, ...wrong]);
    controls.innerHTML = '<div class="gm-options"></div>';
    const grid = controls.querySelector(".gm-options");
    options.forEach((text) => {
      const b = el("button", "gm-option", esc(text));
      b.type = "button";
      b.addEventListener("click", () => {
        if (phase !== "choose") return;
        if (text === bird.word.vi) {
          b.classList.add("ok");
          grid.querySelectorAll("button").forEach((x) => (x.disabled = true));
          fire();
        } else {
          b.classList.add("bad");
          b.disabled = true;
          wrongThisRound++;
          addMissed(bird.word);
          bird.x -= 40; // chọn sai thì chim lao lại gần hơn
          setMsg("Sai nghĩa rồi, chim đang tiến lại gần!", "bad");
        }
      });
      grid.appendChild(b);
    });
    setMsg("");
  }

  function fire() {
    phase = "shoot";
    bullet = { x: PX + 36, y: planeY };
    setMsg("");
  }

  function spawnBird() {
    const word = words[round];
    const time = Math.max(9, 14 - round * 0.5);
    const startX = W + 24;
    bird = {
      word,
      x: startX,
      y: 50 + Math.random() * (H - 100),
      v: (startX - STOP_X) / time,
      fall: 0,
    };
    wrongThisRound = 0;
    showTypeStep();
  }

  function nextRound() {
    bird = null;
    bullet = null;
    round++;
    controls.innerHTML = "";
    showWord("");
    renderStats();
    if (lives <= 0 || round >= total) {
      phase = "idle";
      setTimeout(endGame, 500);
    } else {
      phase = "gap";
      gap = 0.7;
    }
  }

  function endGame() {
    if (over) return;
    over = true;
    const xp = Math.min(30, hits * 3 + (hits === total ? 5 : 0));
    finish({
      score,
      xp,
      headline: lives > 0 ? "Bầu trời yên ắng rồi!" : "Hết mạng rồi!",
      lines: [`Bắn hạ ${hits}/${total} con chim`],
      missed,
    });
  }

  function burst(x, y) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 140;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0.6 });
    }
  }

  function update(dt) {
    clock += dt;
    if (flash > 0) flash = Math.max(0, flash - dt);

    clouds.forEach((c) => {
      c.x -= 12 * c.s * dt;
      if (c.x < -60) c.x = W + 60;
    });

    if (phase === "gap") {
      gap -= dt;
      if (gap <= 0 && round < total) spawnBird();
    }

    if (bird && (phase === "type" || phase === "choose")) {
      bird.x -= bird.v * dt;
      if (bird.x <= STOP_X) {
        lives--;
        flash = 0.45;
        addMissed(bird.word);
        setMsg(`Chim đã tới nơi. Từ đó là "${bird.word.en}" (${bird.word.vi}).`, "bad");
        nextRound();
      }
    }

    if (bird && phase === "shoot" && bullet) {
      const dx = bird.x - bullet.x;
      const dy = bird.y - bullet.y;
      const dist = Math.hypot(dx, dy);
      const stepLen = 900 * dt;
      if (dist <= stepLen + 14) {
        burst(bird.x, bird.y);
        bullet = null;
        phase = "fall";
        bird.fall = 0;
      } else {
        bullet.x += (dx / dist) * stepLen;
        bullet.y += (dy / dist) * stepLen;
      }
    }

    if (bird && phase === "fall") {
      bird.fall += dt;
      bird.y += 280 * dt;
      bird.x -= 20 * dt;
      if (bird.fall > 0.7) {
        hits++;
        score += 10 + (wrongThisRound === 0 ? 5 : 0);
        setMsg("Trúng rồi!", "ok");
        nextRound();
      }
    }

    // máy bay bám theo độ cao của chim
    const targetY = bird ? Math.min(H - 40, Math.max(40, bird.y)) : H / 2;
    planeY += (targetY - planeY) * Math.min(1, dt * 3);

    particles = particles.filter((p) => (p.life -= dt) > 0);
    particles.forEach((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * dt;
    });

    draw();
  }

  function drawPlane() {
    ctx.save();
    ctx.translate(PX, planeY);
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.moveTo(-26, -7);
    ctx.lineTo(22, -7);
    ctx.quadraticCurveTo(38, 0, 22, 9);
    ctx.lineTo(-26, 9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pal.ink;
    ctx.beginPath(); // cánh
    ctx.moveTo(-8, 3);
    ctx.lineTo(-22, 24);
    ctx.lineTo(4, 24);
    ctx.lineTo(8, 3);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath(); // đuôi
    ctx.moveTo(-26, -7);
    ctx.lineTo(-36, -22);
    ctx.lineTo(-16, -7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pal.bg;
    ctx.beginPath();
    ctx.arc(8, -3, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBird() {
    const b = bird;
    const falling = phase === "fall";
    ctx.save();
    ctx.translate(b.x, b.y);
    if (falling) ctx.rotate(b.fall * 6);
    ctx.fillStyle = pal.warn;
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath(); // đầu
    ctx.arc(-14, -4, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.ink;
    ctx.beginPath(); // mỏ
    ctx.moveTo(-21, -5);
    ctx.lineTo(-30, -2);
    ctx.lineTo(-21, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pal.bg;
    ctx.beginPath(); // mắt
    ctx.arc(-16, -6, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.warn;
    const flap = falling ? 0.2 : Math.sin(clock * 14);
    ctx.beginPath(); // cánh vỗ
    ctx.moveTo(-4, -2);
    ctx.lineTo(8, -2);
    ctx.lineTo(2, -18 * flap - 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (!falling) {
      ctx.font = "700 15px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const tw = ctx.measureText(b.word.en).width + 16;
      const lx = Math.min(W - tw / 2 - 4, Math.max(tw / 2 + 4, b.x));
      const ly = Math.max(16, b.y - 30);
      ctx.fillStyle = pal.ink;
      roundRect(ctx, lx - tw / 2, ly - 12, tw, 24, 8);
      ctx.fill();
      ctx.fillStyle = pal.bg;
      ctx.fillText(b.word.en, lx, ly + 1);
    }
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = pal.line;
    clouds.forEach((c) => {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 34 * c.s, 11 * c.s, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + 18 * c.s, c.y - 7 * c.s, 20 * c.s, 10 * c.s, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    drawPlane();
    if (bird) drawBird();

    if (bullet) {
      ctx.fillStyle = pal.ink;
      roundRect(ctx, bullet.x - 8, bullet.y - 2, 16, 4, 2);
      ctx.fill();
    }
    ctx.fillStyle = pal.warn;
    particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life / 0.6);
      ctx.fillRect(p.x, p.y, 4, 4);
    });
    ctx.globalAlpha = 1;

    if (flash > 0) {
      ctx.fillStyle = pal.danger;
      ctx.globalAlpha = Math.min(0.28, flash);
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  draw();
  startOverlay(stage, "▶ Bắt đầu", () => {
    pal = palette();
    phase = "gap";
    gap = 0.2;
    stopLoop = startLoop(update);
  });

  return () => stopLoop?.();
}

export const startDinoType = (api) => startDino(api, "type");
export const startDinoSpeak = (api) => startDino(api, "speak");
export const startPlaneShooter = (api) => startShooter(api);
