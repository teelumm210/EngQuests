// ============================================================
// EngQuests - Game bắn cá (canvas thuần, không thư viện)
//
// Đại dương nhiều màu sắc, cá bơi liên tục qua màn hình. Gõ đúng từ trên con
// cá để khẩu pháo ở đáy biển xoay nòng và bắn trúng nó. Có giới hạn thời gian
// (1 / 2 / 3 phút), đạn có hạn, nhiều loại cá, cá đặc biệt, boss và vật phẩm.
//
// Nhận cùng "api" như các game khác: { area, setStats, finish, pool, say }
// và trả về hàm dọn dẹp.
// ============================================================

import { esc, shuffle, el, norm, makeCanvas, roundRect, startLoop, playableWords } from "./games-arcade.js";

const W = 420;
const H = 460;
const CANNON = { x: W / 2, y: H - 22 };
const AMMO_START = 24;
const AMMO_MAX = 40;

// size: bán kính thân; hp: số phát cần để hạ; pts: điểm; sp: tốc độ (px/s); ammo: đạn thưởng khi hạ
const FISH_TYPES = {
  tiny: { name: "Cá nhỏ", r: 13, hp: 1, pts: 10, sp: 95, ammo: 1, colors: ["#fbbf24", "#fb923c", "#f472b6"], weight: 46 },
  mid: { name: "Cá vừa", r: 19, hp: 2, pts: 30, sp: 70, ammo: 2, colors: ["#34d399", "#22d3ee", "#a78bfa"], weight: 26 },
  big: { name: "Cá lớn", r: 28, hp: 4, pts: 90, sp: 48, ammo: 4, colors: ["#6366f1", "#0ea5e9", "#14b8a6"], weight: 12 },
  gold: { name: "Cá vàng", r: 15, hp: 1, pts: 120, sp: 150, ammo: 3, colors: ["#fde047"], weight: 6, special: true },
  puffer: { name: "Cá nóc", r: 21, hp: 3, pts: 75, sp: 58, ammo: 3, colors: ["#f97316"], weight: 6, special: true },
  boss: { name: "Cá mập chúa", r: 46, hp: 10, pts: 500, sp: 30, ammo: 10, colors: ["#475569"], weight: 0, boss: true },
};

const ITEM_TYPES = {
  freeze: { label: "Đóng băng 5s", glyph: "❄", color: "#7dd3fc" },
  power: { label: "Đạn mạnh x2 (10s)", glyph: "×2", color: "#fbbf24" },
  bomb: { label: "Bom sóng", glyph: "✸", color: "#f87171" },
  ammo: { label: "+12 đạn", glyph: "●", color: "#a7f3d0" },
  time: { label: "+10 giây", glyph: "⏱", color: "#c4b5fd" },
};

export function startFishShooter(api) {
  const { area, setStats, finish, pool, say } = api;
  const base = playableWords(pool, 300);
  if (base.length < 12) {
    area.innerHTML = '<p class="gm-hint">Chưa đủ từ để chơi game này.</p>';
    return () => {};
  }

  area.innerHTML = `
    <p class="gm-hint">Gõ <b>đúng từ trên con cá</b> để khẩu pháo bắn trúng nó. Cá nhỏ dễ hạ nhưng ít điểm, <b>cá lớn, cá đặc biệt và boss</b> cần nhiều phát hơn nhưng điểm rất cao. Mỗi phát tốn <b>1 viên đạn</b>, hạ cá sẽ được thưởng đạn. Gõ từ trên <b>bong bóng vật phẩm</b> để nhận hỗ trợ.</p>
    <div class="gx-stage gx-portrait"></div>
    <div class="gx-panel">
      <div class="gx-target"><span class="gx-word" aria-live="polite"></span></div>
      <div class="gx-controls">
        <input class="gx-input" type="text" inputmode="text" enterkeyhint="done" autocomplete="off"
          autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Gõ từ trên con cá…"
          aria-label="Gõ từ tiếng Anh" disabled>
      </div>
      <div class="gx-msg" aria-live="polite"></div>
    </div>`;
  const stage = area.querySelector(".gx-stage");
  const wordEl = area.querySelector(".gx-word");
  const input = area.querySelector(".gx-input");
  const msg = area.querySelector(".gx-msg");

  const { canvas, ctx, dpr } = makeCanvas(W, H);
  canvas.setAttribute("aria-label", "Đại dương: gõ từ để bắn cá");
  stage.appendChild(canvas);

  // ---------- Trạng thái ----------
  let duration = 120;
  let timeLeft = 120;
  let running = false;
  let over = false;
  let ending = false;
  let score = 0;
  let ammo = AMMO_START;
  let kills = 0;
  let shots = 0;
  let combo = 0;
  let bestCombo = 0;
  let clock = 0;
  let spawnT = 0.2;
  let bossT = 40;
  let itemT = 14;
  let freezeT = 0;
  let powerT = 0;
  let recharge = 0;
  let flash = 0;
  let aim = -Math.PI / 2;
  let aimTarget = -Math.PI / 2;
  let fish = [];
  let items = [];
  let bullets = [];
  let particles = [];
  let bubbles = Array.from({ length: 22 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 1 + Math.random() * 3, v: 10 + Math.random() * 22 }));
  let popups = [];
  let usedWords = [];
  let queue = [];
  const missed = [];
  const missedSet = new Set();
  let stopLoop = null;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fmtTime = (t) => {
    const sec = Math.max(0, Math.ceil(t));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  };
  const renderStats = () =>
    setStats(`<span>⏱ ${fmtTime(Math.max(0, timeLeft))}</span><span>★ ${score}</span><span>● ${ammo}</span>${combo >= 3 ? `<span>x${combo}</span>` : ""}`);
  const setMsg = (text, kind = "") => {
    msg.textContent = text;
    msg.className = `gx-msg ${kind}`.trim();
  };

  // ---------- Từ vựng: tránh trùng và tránh từ này là tiền tố của từ kia ----------
  function takeWord() {
    for (let tries = 0; tries < 30; tries++) {
      if (!queue.length) queue = shuffle(base);
      const w = queue.pop();
      const k = w.en.toLowerCase();
      const clash = usedWords.some((u) => u.startsWith(k) || k.startsWith(u));
      if (!clash) return w;
    }
    return null;
  }
  const currentWords = () => [...fish.map((f) => f.word.en.toLowerCase()), ...items.map((i) => i.word.en.toLowerCase())];
  const refreshUsed = () => (usedWords = currentWords());

  // ---------- Tạo cá / vật phẩm ----------
  function pickType() {
    const progress = 1 - timeLeft / duration; // càng về cuối càng nhiều cá khó
    const entries = Object.entries(FISH_TYPES).filter(([, t]) => !t.boss);
    const weights = entries.map(([k, t]) => t.weight * (k === "tiny" ? 1 - progress * 0.35 : 1 + progress * 0.6));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < entries.length; i++) {
      r -= weights[i];
      if (r <= 0) return entries[i][0];
    }
    return "tiny";
  }

  function spawnFish(typeKey) {
    const T = FISH_TYPES[typeKey];
    refreshUsed();
    const word = takeWord();
    if (!word) return;
    const fromLeft = Math.random() < 0.5;
    const speedMul = 1 + (1 - timeLeft / duration) * 0.35;
    const y = T.boss ? rnd(120, 230) : rnd(60, H - 130);
    // tránh chồng lên cá khác ở cùng hàng
    if (fish.some((f) => Math.abs(f.y - y) < f.r + T.r + 10 && (fromLeft ? f.x < T.r * 3 + 40 : f.x > W - T.r * 3 - 40))) return;
    fish.push({
      type: typeKey,
      word,
      x: fromLeft ? -T.r * 2 : W + T.r * 2,
      y,
      baseY: y,
      dir: fromLeft ? 1 : -1,
      v: T.sp * speedMul * rnd(0.85, 1.15),
      wob: rnd(0, 6),
      r: T.r,
      hp: T.hp,
      maxHp: T.hp,
      color: T.colors[Math.floor(Math.random() * T.colors.length)],
      hit: 0,
    });
  }

  function spawnItem() {
    refreshUsed();
    const word = takeWord();
    if (!word) return;
    const keys = Object.keys(ITEM_TYPES);
    const kind = keys[Math.floor(Math.random() * keys.length)];
    items.push({ kind, word, x: rnd(50, W - 50), y: H - 80, vy: -26, t: 0, life: 9 });
  }

  // ---------- Bắn ----------
  function aimAt(x, y) {
    aimTarget = Math.atan2(y - CANNON.y, x - CANNON.x);
  }

  function shootFish(f) {
    if (ammo <= 0) {
      setMsg("Hết đạn! Chờ nạp thêm hoặc gõ bong bóng đạn.", "bad");
      return false;
    }
    ammo--;
    shots++;
    aimAt(f.x, f.y);
    aim = aimTarget;
    const speed = 640;
    const dx = f.x - CANNON.x;
    const dy = f.y - CANNON.y;
    const dist = Math.hypot(dx, dy);
    bullets.push({ x: CANNON.x, y: CANNON.y, vx: (dx / dist) * speed, vy: (dy / dist) * speed, target: f, dmg: powerT > 0 ? 2 : 1 });
    return true;
  }

  function damage(f, dmg) {
    f.hp -= dmg;
    f.hit = 0.18;
    if (f.hp > 0) {
      burst(f.x, f.y, "#ffffff", 6);
      if (f.type === "boss") {
        // boss đổi từ sau mỗi phát trúng
        refreshUsed();
        const w = takeWord();
        if (w) f.word = w;
      }
      return;
    }
    const T = FISH_TYPES[f.type];
    combo++;
    bestCombo = Math.max(bestCombo, combo);
    const bonus = combo >= 3 ? Math.min(0.5, (combo - 2) * 0.05) : 0;
    const gain = Math.round(T.pts * (1 + bonus));
    score += gain;
    kills++;
    ammo = Math.min(AMMO_MAX, ammo + T.ammo);
    burst(f.x, f.y, f.color, 16);
    popups.push({ x: f.x, y: f.y - f.r, text: `+${gain}`, life: 0.9, color: T.special || T.boss ? "#fde047" : "#ffffff" });
    if (Math.random() < 0.08 && !items.length) spawnItem();
    fish = fish.filter((x) => x !== f);
  }

  function burst(x, y, color, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 120;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 0.6, color });
    }
  }

  function useItem(it) {
    const info = ITEM_TYPES[it.kind];
    if (it.kind === "freeze") freezeT = 5;
    if (it.kind === "power") powerT = 10;
    if (it.kind === "ammo") ammo = Math.min(AMMO_MAX, ammo + 12);
    if (it.kind === "time") timeLeft += 10;
    if (it.kind === "bomb") {
      flash = 0.5;
      for (const f of [...fish]) damage(f, f.type === "boss" ? 3 : 2);
    }
    popups.push({ x: it.x, y: it.y - 16, text: info.label, life: 1.4, color: info.color });
    burst(it.x, it.y, info.color, 14);
    setMsg(`Vật phẩm: ${info.label}`, "ok");
  }

  // ---------- Nhập liệu ----------
  function matchWord(typed) {
    const t = norm(typed);
    if (!t) return null;
    const f = fish.find((x) => norm(x.word.en) === t);
    if (f) return { fish: f };
    const it = items.find((x) => norm(x.word.en) === t);
    if (it) return { item: it };
    return null;
  }

  function showTyping(typed) {
    const t = typed.toLowerCase();
    if (!t) {
      wordEl.innerHTML = "";
      return;
    }
    const cand = [...fish.map((f) => f.word), ...items.map((i) => i.word)].find((w) => w.en.toLowerCase().startsWith(t));
    if (cand) {
      wordEl.innerHTML = `<span class="ok">${esc(typed)}</span><span>${esc(cand.en.slice(typed.length))}</span>`;
      const f = fish.find((x) => x.word === cand);
      if (f) aimAt(f.x, f.y);
    } else {
      wordEl.innerHTML = `<span class="bad">${esc(typed)}</span>`;
    }
  }

  input.addEventListener("input", () => {
    if (!running || over || ending) return;
    const typed = input.value.trim();
    showTyping(typed);
    const m = matchWord(typed);
    if (!m) return;
    if (m.fish) {
      if (shootFish(m.fish)) say(m.fish.word.en);
    } else {
      say(m.item.word.en);
      useItem(m.item);
      items = items.filter((x) => x !== m.item);
    }
    input.value = "";
    wordEl.innerHTML = "";
    renderStats();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const typed = input.value.trim();
    if (typed && !matchWord(typed)) {
      combo = 0;
      setMsg("Không có con cá nào mang từ này.", "bad");
      renderStats();
    }
  });

  function addMissed(w) {
    if (!w || missedSet.has(w.en)) return;
    missedSet.add(w.en);
    missed.push(w);
  }

  // ---------- Kết thúc ----------
  function endGame() {
    if (over) return;
    over = true;
    input.disabled = true;
    const xp = Math.min(30, Math.round(kills * 1.2) + Math.floor(score / 150));
    // từ của những con cá chạy thoát được gom vào danh sách ôn lại
    finish({
      score,
      xp,
      headline: score >= 1500 ? "Thợ săn đại dương!" : "Hết giờ!",
      lines: [`Hạ ${kills} con cá · ${shots} phát bắn · chuỗi tốt nhất x${bestCombo}`],
      missed,
    });
  }

  // ---------- Cập nhật ----------
  function update(dt) {
    clock += dt;
    if (running && !ending) {
      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        ending = true;
        renderStats();
        input.disabled = true;
        setTimeout(endGame, 500);
      }
      if (flash > 0) flash = Math.max(0, flash - dt);
      if (freezeT > 0) freezeT = Math.max(0, freezeT - dt);
      if (powerT > 0) powerT = Math.max(0, powerT - dt);

      // nạp đạn chậm khi hết đạn
      if (ammo <= 0) {
        recharge += dt;
        if (recharge >= 4) {
          recharge = 0;
          ammo = 2;
          setMsg("Đã nạp thêm 2 viên đạn.", "ok");
        }
      } else recharge = 0;

      spawnT -= dt;
      const progress = 1 - timeLeft / duration;
      if (spawnT <= 0) {
        spawnT = Math.max(0.55, 1.35 - progress * 0.7);
        if (fish.length < 7) spawnFish(pickType());
      }
      bossT -= dt;
      if (bossT <= 0 && timeLeft > 20) {
        bossT = duration * 0.45;
        if (!fish.some((f) => f.type === "boss")) {
          spawnFish("boss");
          popups.push({ x: W / 2, y: 90, text: "BOSS xuất hiện!", life: 2, color: "#fca5a5" });
        }
      }
      itemT -= dt;
      if (itemT <= 0) {
        itemT = rnd(14, 22);
        if (items.length < 1) spawnItem();
      }
    }

    // cá bơi
    const slow = freezeT > 0 ? 0.08 : 1;
    for (const f of fish) {
      f.wob += dt * 2.2;
      f.x += f.dir * f.v * slow * dt;
      f.y = clamp(f.baseY + Math.sin(f.wob) * (f.type === "boss" ? 8 : 14), 40, H - 90);
      if (f.hit > 0) f.hit -= dt;
    }
    fish = fish.filter((f) => {
      const inside = f.dir > 0 ? f.x < W + f.r * 2 + 10 : f.x > -f.r * 2 - 10;
      if (!inside && f.type !== "boss" && missed.length < 12) addMissed(f.word);
      return inside;
    });

    // vật phẩm trôi lên
    for (const it of items) {
      it.t += dt;
      it.life -= dt;
      it.y += it.vy * dt;
      it.x += Math.sin(it.t * 1.6) * 14 * dt;
      if (it.y < 70) it.vy = 8;
    }
    items = items.filter((it) => it.life > 0);

    // đạn
    for (const b of bullets) {
      const t = b.target;
      if (t && fish.includes(t)) {
        // bám nhẹ theo mục tiêu để không trượt do cá di chuyển
        const dx = t.x - b.x;
        const dy = t.y - b.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = Math.hypot(b.vx, b.vy);
        b.vx += ((dx / d) * sp - b.vx) * Math.min(1, dt * 10);
        b.vy += ((dy / d) * sp - b.vy) * Math.min(1, dt * 10);
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (t && fish.includes(t) && Math.hypot(t.x - b.x, t.y - b.y) < t.r + 6) {
        b.dead = true;
        damage(t, b.dmg);
      } else if (!fish.includes(t) || b.y < -20 || b.x < -20 || b.x > W + 20) {
        b.dead = true;
        // cá đã chạy mất: đạn mất, không tính điểm
      }
    }
    bullets = bullets.filter((b) => !b.dead);

    // xoay nòng
    let da = aimTarget - aim;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    aim += da * Math.min(1, dt * 12);
    if (!fish.length && !bullets.length) aimTarget = -Math.PI / 2;

    particles = particles.filter((p) => (p.life -= dt) > 0);
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= 20 * dt;
    }
    popups = popups.filter((p) => (p.life -= dt) > 0);
    for (const p of popups) p.y -= 24 * dt;
    for (const b of bubbles) {
      b.y -= b.v * dt;
      if (b.y < -6) {
        b.y = H + 6;
        b.x = Math.random() * W;
      }
    }

    if (running && Math.floor(clock * 4) !== Math.floor((clock - dt) * 4)) renderStats();
    draw();
  }

  // ---------- Vẽ ----------
  function drawFish(f) {
    const T = FISH_TYPES[f.type];
    const r = f.r;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(f.dir, 1);
    if (f.hit > 0) ctx.globalAlpha = 0.65;
    const body = f.hit > 0 ? "#ffffff" : f.color;

    const tail = Math.sin(clock * 9 + f.wob) * r * 0.25;
    ctx.fillStyle = body; // đuôi
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, 0);
    ctx.lineTo(-r * 1.55, -r * 0.6 + tail);
    ctx.lineTo(-r * 1.55, r * 0.6 + tail);
    ctx.closePath();
    ctx.fill();

    if (f.type === "boss") {
      ctx.beginPath(); // vây lưng cá mập
      ctx.moveTo(-r * 0.1, -r * 0.55);
      ctx.lineTo(r * 0.25, -r * 1.15);
      ctx.lineTo(r * 0.5, -r * 0.5);
      ctx.fill();
    } else {
      ctx.globalAlpha *= 0.85;
      ctx.beginPath(); // vây lưng
      ctx.moveTo(-r * 0.3, -r * 0.55);
      ctx.lineTo(0, -r * 0.95);
      ctx.lineTo(r * 0.35, -r * 0.5);
      ctx.fill();
      ctx.globalAlpha = f.hit > 0 ? 0.65 : 1;
    }

    ctx.fillStyle = body; // thân
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * (f.type === "puffer" ? 0.95 : 0.65), 0, 0, Math.PI * 2);
    ctx.fill();

    if (f.hit <= 0) {
      ctx.fillStyle = "rgba(255,255,255,0.28)"; // bụng sáng
      ctx.beginPath();
      ctx.ellipse(r * 0.05, r * 0.2, r * 0.8, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.16)"; // sọc
      for (let i = -1; i <= 1; i++) ctx.fillRect(i * r * 0.32 - 2, -r * 0.5, 4, r);
    }
    if (f.type === "puffer") {
      ctx.fillStyle = "#fed7aa";
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI * 0.85 + i * 0.55;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
        ctx.lineTo(Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25);
        ctx.lineTo(Math.cos(a + 0.18) * r * 0.95, Math.sin(a + 0.18) * r * 0.95);
        ctx.fill();
      }
    }
    if (T.special && f.type === "gold") {
      ctx.strokeStyle = "rgba(253,224,71,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.25 + Math.sin(clock * 6) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#ffffff"; // mắt
    ctx.beginPath();
    ctx.arc(r * 0.55, -r * 0.14, Math.max(3, r * 0.2), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0b1b3a";
    ctx.beginPath();
    ctx.arc(r * 0.6, -r * 0.14, Math.max(1.6, r * 0.1), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // thanh máu
    if (f.maxHp > 1) {
      const w = Math.max(30, r * 1.5);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(f.x - w / 2, f.y + r * 0.85 + 4, w, 4);
      ctx.fillStyle = f.hp / f.maxHp > 0.4 ? "#34d399" : "#f87171";
      ctx.fillRect(f.x - w / 2, f.y + r * 0.85 + 4, w * Math.max(0, f.hp / f.maxHp), 4);
    }
    drawLabel(f.x, f.y - r - 14, f.word.en, f.type === "boss" ? "#fecaca" : T.special ? "#fef08a" : "#ffffff", typedPrefix(f.word.en));
  }

  const typedPrefix = (w) => {
    const t = input.value.trim().toLowerCase();
    return t && w.toLowerCase().startsWith(t) ? t.length : 0;
  };

  function drawLabel(x, y, text, fill, matched) {
    ctx.font = "700 14px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(text).width + 14;
    const lx = clamp(x, tw / 2 + 3, W - tw / 2 - 3);
    const ly = Math.max(14, y);
    ctx.fillStyle = "rgba(7,18,43,0.78)";
    roundRect(ctx, lx - tw / 2, ly - 11, tw, 22, 7);
    ctx.fill();
    if (matched) {
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const left = lx - ctx.measureText(text).width / 2;
      const done = text.slice(0, matched);
      ctx.textAlign = "left";
      ctx.fillStyle = "#60a5fa";
      ctx.fillText(done, left, ly + 1);
      ctx.fillStyle = fill;
      ctx.fillText(text.slice(matched), left + ctx.measureText(done).width, ly + 1);
      ctx.textAlign = "center";
    } else {
      ctx.fillStyle = fill;
      ctx.fillText(text, lx, ly + 1);
    }
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0e7490");
    g.addColorStop(0.45, "#0a4d8c");
    g.addColorStop(1, "#071a45");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // tia nắng
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < 4; i++) {
      const x = 40 + i * 110 + Math.sin(clock * 0.4 + i) * 14;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 46, 0);
      ctx.lineTo(x + 120, H);
      ctx.lineTo(x + 30, H);
      ctx.closePath();
      ctx.fill();
    }
    // đáy cát + san hô + rong biển
    ctx.fillStyle = "#c7a76b";
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, H - 26);
    ctx.quadraticCurveTo(W * 0.25, H - 40, W * 0.5, H - 28);
    ctx.quadraticCurveTo(W * 0.78, H - 14, W, H - 30);
    ctx.lineTo(W, H);
    ctx.fill();
    const weeds = [28, 88, 330, 392];
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    weeds.forEach((x, i) => {
      ctx.strokeStyle = i % 2 ? "#22c55e" : "#14b8a6";
      ctx.beginPath();
      ctx.moveTo(x, H - 24);
      ctx.quadraticCurveTo(x + Math.sin(clock * 1.6 + i) * 14, H - 62, x + Math.sin(clock * 1.2 + i * 2) * 8, H - 96 - (i % 2) * 18);
      ctx.stroke();
    });
    ctx.lineCap = "butt";
    const corals = [
      [58, "#fb7185"],
      [362, "#f472b6"],
      [150, "#fb923c"],
    ];
    corals.forEach(([x, c]) => {
      ctx.fillStyle = c;
      roundRect(ctx, x - 4, H - 54, 8, 28, 4);
      ctx.fill();
      roundRect(ctx, x - 13, H - 46, 7, 18, 3);
      ctx.fill();
      roundRect(ctx, x + 6, H - 44, 7, 16, 3);
      ctx.fill();
    });
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    for (const b of bubbles) {
      ctx.beginPath();
      ctx.arc(b.x + Math.sin(clock + b.y * 0.05) * 3, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCannon() {
    ctx.save();
    ctx.translate(CANNON.x, CANNON.y);
    ctx.fillStyle = "#1e3a8a";
    ctx.beginPath();
    ctx.arc(0, 4, 24, Math.PI, 0);
    ctx.fill();
    ctx.rotate(aim + Math.PI / 2);
    ctx.fillStyle = powerT > 0 ? "#fbbf24" : "#93c5fd";
    roundRect(ctx, -7, -38, 14, 40, 4);
    ctx.fill();
    ctx.fillStyle = "#1e40af";
    ctx.fillRect(-9, -40, 18, 6);
    ctx.restore();
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.arc(CANNON.x, CANNON.y, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground();

    for (const it of items) {
      const info = ITEM_TYPES[it.kind];
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.globalAlpha = it.life < 2 ? 0.4 + 0.6 * Math.abs(Math.sin(it.t * 8)) : 1;
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.strokeStyle = info.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = info.color;
      ctx.font = "800 15px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(info.glyph, 0, 1);
      ctx.restore();
      drawLabel(it.x, it.y - 30, it.word.en, "#ffffff", typedPrefix(it.word.en));
    }

    fish.forEach(drawFish);

    ctx.fillStyle = powerT > 0 ? "#fde047" : "#ffffff";
    for (const b of bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, powerT > 0 ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
    drawCannon();

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / 0.6);
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
      ctx.fillText(p.text, clamp(p.x, 60, W - 60), p.y);
    }
    ctx.globalAlpha = 1;

    // trạng thái hỗ trợ
    ctx.textAlign = "left";
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    const buffs = [];
    if (freezeT > 0) buffs.push(`Băng ${Math.ceil(freezeT)}s`);
    if (powerT > 0) buffs.push(`Đạn x2 ${Math.ceil(powerT)}s`);
    ctx.fillText(buffs.join("  ·  "), 10, 14);

    if (freezeT > 0) {
      ctx.fillStyle = "rgba(125,211,252,0.14)";
      ctx.fillRect(0, 0, W, H);
    }
    if (flash > 0) {
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = Math.min(0.4, flash);
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Chọn thời gian rồi bắt đầu ----------
  function begin(seconds) {
    duration = seconds;
    timeLeft = seconds;
    bossT = Math.max(25, seconds * 0.3);
    running = true;
    input.disabled = false;
    input.focus({ preventScroll: true });
    renderStats();
    stopLoop = startLoop(update);
  }

  renderStats();
  draw();
  const picker = el("div", "gx-start gx-picker");
  picker.innerHTML = `
    <div class="gx-picker-box">
      <strong>Chọn thời gian chơi</strong>
      <div class="gx-picker-row">
        <button type="button" class="gm-btn gm-btn-primary" data-sec="60">1 phút</button>
        <button type="button" class="gm-btn gm-btn-primary" data-sec="120">2 phút</button>
        <button type="button" class="gm-btn gm-btn-primary" data-sec="180">3 phút</button>
      </div>
    </div>`;
  picker.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      picker.remove();
      begin(Number(b.dataset.sec));
    })
  );
  stage.appendChild(picker);

  return () => {
    stopLoop?.();
  };
}
