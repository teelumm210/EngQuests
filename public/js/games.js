// ============================================================
// EngQuests - Khu trò chơi học tiếng Anh (chơi để học)
//
//  1. Ghép thẻ       (kiểu Memory)         - ghép từ tiếng Anh với nghĩa tiếng Việt
//  2. Mưa chữ        (kiểu Word Catch)     - chạm đúng từ đang rơi trước khi chạm đất
//  3. Ngữ pháp nhanh (kiểu Quiz Blitz)     - điền khuyết, 3 mạng, tính giờ, combo
//  4. Đoán chữ       (kiểu Hangman)        - đoán từ qua nghĩa tiếng Việt
//  5. Xếp câu        (kiểu Duolingo)       - sắp xếp từ thành câu đúng
//  6-8. Khủng long gõ từ, Khủng long đọc từ, Máy bay bắn chim -> xem games-arcade.js
//
// Chạy hoàn toàn trên trình duyệt, không dùng thư viện ngoài.
// Điểm kinh nghiệm (XP) cộng vào LearningStore giống các hoạt động khác.
// ============================================================

import { LearningStore } from "./store.js";
import { normalizeTopic } from "./features.js";
import { WORDS, GRAMMAR, SENTENCES } from "./games-data.js";
import { startDinoType, startDinoSpeak, startPlaneShooter } from "./games-arcade.js";

const BEST_KEY = "engquests_game_best";

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
const pick = (arr, n) => shuffle(arr).slice(0, n);

function el(tag, cls = "", html = "") {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function loadBest() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY)) || {};
  } catch {
    return {};
  }
}
function saveBest(id, score) {
  const best = loadBest();
  if (score > (best[id] || 0)) {
    best[id] = score;
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(best));
    } catch {
      /* bỏ qua */
    }
    return true;
  }
  return false;
}

/** Nguồn từ: từ trong sổ của người dùng (nếu có nghĩa) + kho từ có sẵn, không trùng */
function vocabPool() {
  const seen = new Set();
  const out = [];
  const add = (en, vi, topic) => {
    const k = String(en).trim().toLowerCase();
    if (!k || !vi || seen.has(k)) return;
    seen.add(k);
    out.push({ en: String(en).trim(), vi: String(vi).trim(), topic: topic || "" });
  };
  for (const w of LearningStore.getWords()) {
    if (w.word && w.meaning && w.meaning !== "Từ vựng tiếng Anh") add(w.word, w.meaning, w.category);
  }
  for (const w of WORDS) add(w.en, w.vi, w.topic);
  return out;
}

// ============================================================
//  Bộ khung chung của một ván chơi
// ============================================================
export function createGames({ body, speak, toast, celebrate, onXP }) {
  let stopCurrent = null;

  const say = (word) => {
    try {
      speak?.(word, { rate: 0.9 });
    } catch {
      /* TTS không có thì bỏ qua */
    }
  };

  function cleanup() {
    if (stopCurrent) {
      try {
        stopCurrent();
      } catch {
        /* bỏ qua */
      }
      stopCurrent = null;
    }
  }

  // ---------- Màn hình chọn game ----------
  function showHub() {
    cleanup();
    const best = loadBest();
    body.innerHTML = "";
    const hub = el("div", "gm-hub");
    hub.appendChild(
      el(
        "p",
        "gm-intro",
        "Chơi mà học! Mỗi ván đều cộng <b>XP</b>. Từ bạn đã lưu trong sổ từ sẽ xuất hiện trong các game từ vựng."
      )
    );
    const grid = el("div", "gm-grid");
    for (const g of GAMES) {
      const card = el("button", "gm-card");
      card.type = "button";
      card.innerHTML = `
        <span class="gm-card-emoji" aria-hidden="true">${g.emoji}</span>
        <span class="gm-card-body">
          <strong>${esc(g.name)}</strong>
          <small>${esc(g.desc)}</small>
          <em>${esc(g.skill)}${best[g.id] ? ` · Kỷ lục: ${best[g.id]}` : ""}</em>
        </span>`;
      card.addEventListener("click", () => startGame(g.id));
      grid.appendChild(card);
    }
    hub.appendChild(grid);
    body.appendChild(hub);
  }

  // ---------- Chạy một game ----------
  function startGame(id) {
    cleanup();
    const g = GAMES.find((x) => x.id === id);
    if (!g) return showHub();

    body.innerHTML = "";
    const shell = el("div", "gm-shell");
    const top = el("div", "gm-top");
    const back = el("button", "gm-back", "← Game khác");
    back.type = "button";
    back.addEventListener("click", showHub);
    const title = el("div", "gm-title", `${g.emoji} ${esc(g.name)}`);
    const stats = el("div", "gm-stats");
    top.append(back, title, stats);
    const area = el("div", "gm-area");
    shell.append(top, area);
    body.appendChild(shell);

    const api = {
      area,
      setStats: (html) => (stats.innerHTML = html),
      pool: vocabPool(),
      say,
      finish: (res) => showResult(g, res, area, stats),
    };
    stopCurrent = g.start(api) || null;
  }

  // ---------- Kết quả ----------
  function showResult(g, { score = 0, xp = 0, headline, lines = [], missed = [] }, area, stats) {
    cleanup();
    stats.innerHTML = "";
    const isBest = saveBest(g.id, score);
    if (xp > 0) {
      LearningStore.addXP(xp, `Trò chơi: ${g.name}`);
      onXP?.();
    }
    if (xp >= 20) celebrate?.();

    area.innerHTML = "";
    const box = el("div", "gm-result");
    box.innerHTML = `
      <div class="gm-result-emoji">${xp >= 25 ? "🏆" : xp >= 12 ? "🎉" : "💪"}</div>
      <h3>${esc(headline || "Hoàn thành!")}</h3>
      <div class="gm-result-score">${score}<small> điểm</small></div>
      ${isBest && score > 0 ? '<div class="gm-badge-best">🌟 Kỷ lục mới!</div>' : ""}
      <div class="gm-result-xp">+${xp} XP</div>
      ${lines.map((l) => `<p class="gm-result-line">${l}</p>`).join("")}`;

    const uniqueMissed = [];
    const seen = new Set();
    for (const m of missed) {
      const k = m.en.toLowerCase();
      if (!seen.has(k) && /^[A-Za-z][A-Za-z' -]*$/.test(m.en)) {
        seen.add(k);
        uniqueMissed.push(m);
      }
    }
    if (uniqueMissed.length) {
      const list = el("div", "gm-missed");
      list.innerHTML =
        `<div class="gm-missed-title">Từ cần ôn lại</div>` +
        uniqueMissed.map((m) => `<span class="gm-chip"><b>${esc(m.en)}</b> · ${esc(m.vi)}</span>`).join("");
      box.appendChild(list);
      const saveBtn = el("button", "gm-btn gm-btn-ghost", `📥 Lưu ${uniqueMissed.length} từ vào sổ từ`);
      saveBtn.type = "button";
      saveBtn.addEventListener("click", () => {
        let added = 0;
        for (const m of uniqueMissed) {
          if (!LearningStore.findWord(m.en)) {
            LearningStore.saveWord({ word: m.en, meaning: m.vi, category: normalizeTopic(m.topic) });
            added++;
          }
        }
        saveBtn.disabled = true;
        saveBtn.textContent = added ? `✓ Đã lưu ${added} từ` : "✓ Các từ này đã có trong sổ";
        onXP?.();
        toast?.(added ? `Đã thêm ${added} từ vào sổ từ` : "Các từ này đã có sẵn trong sổ từ", "success");
      });
      box.appendChild(saveBtn);
    }

    const actions = el("div", "gm-actions");
    const again = el("button", "gm-btn gm-btn-primary", "▶ Chơi lại");
    again.type = "button";
    again.addEventListener("click", () => startGame(g.id));
    const other = el("button", "gm-btn gm-btn-ghost", "Chọn game khác");
    other.type = "button";
    other.addEventListener("click", showHub);
    actions.append(again, other);
    box.appendChild(actions);
    area.appendChild(box);
  }

  const hearts = (n, max = 3) => "❤️".repeat(Math.max(0, n)) + "🖤".repeat(Math.max(0, max - n));

  // ============================================================
  //  GAME 1: Ghép thẻ
  // ============================================================
  function startMatch({ area, setStats, finish, pool, say }) {
    const words = pick(pool, 6);
    const cards = shuffle(
      words.flatMap((w) => [
        { key: w.en, side: "en", text: w.en, w },
        { key: w.en, side: "vi", text: w.vi, w },
      ])
    );
    area.innerHTML = `<p class="gm-hint">Lật hai thẻ để ghép <b>từ tiếng Anh</b> với <b>nghĩa tiếng Việt</b>.</p><div class="gm-memory"></div>`;
    const grid = area.querySelector(".gm-memory");

    let first = null;
    let lock = false;
    let moves = 0;
    let matched = 0;
    let seconds = 0;
    const fails = {};
    const timers = [];
    const tick = setInterval(() => {
      seconds++;
      render();
    }, 1000);

    const render = () => setStats(`<span>🔁 ${moves}</span><span>⏱ ${seconds}s</span><span>✅ ${matched}/6</span>`);
    render();

    cards.forEach((c) => {
      const b = el("button", `gm-mcard ${c.side}`);
      b.type = "button";
      b.innerHTML = `<span class="gm-mcard-front">?</span><span class="gm-mcard-back">${esc(c.text)}</span>`;
      c.el = b;
      b.addEventListener("click", () => {
        if (lock || b.classList.contains("flipped") || b.classList.contains("done")) return;
        b.classList.add("flipped");
        if (c.side === "en") say(c.text);
        if (!first) {
          first = c;
          return;
        }
        moves++;
        const a = first;
        first = null;
        if (a.key === c.key && a.side !== c.side) {
          a.el.classList.add("done");
          c.el.classList.add("done");
          matched++;
          render();
          if (matched === words.length) {
            clearInterval(tick);
            const stars = moves <= 9 ? 3 : moves <= 13 ? 2 : 1;
            timers.push(
              setTimeout(
                () =>
                  finish({
                    score: Math.max(0, 300 - moves * 10 - seconds),
                    xp: 10 + stars * 5,
                    headline: "Bạn đã ghép hết rồi!",
                    lines: [`${"⭐".repeat(stars)}${"☆".repeat(3 - stars)}`, `${moves} lượt lật trong ${seconds} giây`],
                    missed: words.filter((w) => (fails[w.en] || 0) >= 2),
                  }),
                600
              )
            );
          }
        } else {
          fails[a.key] = (fails[a.key] || 0) + 1;
          fails[c.key] = (fails[c.key] || 0) + 1;
          lock = true;
          render();
          timers.push(
            setTimeout(() => {
              a.el.classList.remove("flipped");
              c.el.classList.remove("flipped");
              lock = false;
            }, 850)
          );
        }
      });
      grid.appendChild(b);
    });

    return () => {
      clearInterval(tick);
      timers.forEach(clearTimeout);
    };
  }

  // ============================================================
  //  GAME 2: Mưa chữ
  // ============================================================
  function startRain({ area, setStats, finish, pool, say }) {
    const TOTAL = 12;
    area.innerHTML = `
      <div class="gm-prompt">Bắt từ có nghĩa: <b class="rn-target"></b></div>
      <div class="gm-rain" aria-live="polite"></div>`;
    const promptEl = area.querySelector(".rn-target");
    const field = area.querySelector(".gm-rain");

    let lives = 3;
    let score = 0;
    let round = 0;
    let caught = 0;
    let combo = 0;
    const missed = [];
    let target = null;
    let bubbles = [];
    let raf = 0;
    let last = 0;
    let busy = false;
    let ended = false;
    const timers = [];

    const render = () => setStats(`<span>${hearts(lives)}</span><span>⭐ ${score}</span><span>${Math.min(round, TOTAL)}/${TOTAL}</span>`);

    function clearBubbles() {
      bubbles.forEach((b) => b.el.remove());
      bubbles = [];
    }

    function end() {
      if (ended) return;
      ended = true;
      cancelAnimationFrame(raf);
      finish({
        score,
        xp: Math.min(40, caught * 3 + (lives === 3 ? 4 : 0)),
        headline: lives > 0 ? "Hết mưa chữ!" : "Hết mạng rồi!",
        lines: [`Bắt đúng ${caught}/${Math.min(round, TOTAL)} từ`],
        missed,
      });
    }

    function nextRound() {
      busy = false;
      clearBubbles();
      if (lives <= 0 || round >= TOTAL) return end();
      round++;
      target = pool[Math.floor(Math.random() * pool.length)];
      promptEl.textContent = target.vi;
      const distractors = pick(
        pool.filter((w) => w.en !== target.en),
        3
      );
      const options = shuffle([target, ...distractors]);
      const fieldW = field.clientWidth || 300;
      const speed = 55 + round * 6; // px / giây
      options.forEach((w, i) => {
        const b = el("button", "gm-bubble");
        b.type = "button";
        b.textContent = w.en;
        b.style.visibility = "hidden";
        field.appendChild(b);
        const bw = b.offsetWidth || 90;
        const x = Math.round(Math.random() * Math.max(0, fieldW - bw - 8)) + 4;
        b.style.left = `${x}px`;
        const obj = { el: b, w, y: -50, speed, spawnAt: performance.now() + i * 750, started: false, isTarget: w === target };
        b.addEventListener("click", () => onTap(obj));
        bubbles.push(obj);
      });
      render();
    }

    function onTap(b) {
      if (busy || ended || !b.started) return;
      if (b.isTarget) {
        busy = true;
        caught++;
        combo++;
        score += 10 + Math.min(combo, 5) * 2;
        b.el.classList.add("ok");
        say(target.en);
        render();
        timers.push(setTimeout(nextRound, 650));
      } else {
        lives--;
        combo = 0;
        missed.push(target);
        b.el.classList.add("bad");
        render();
        timers.push(setTimeout(() => b.el.remove(), 350));
        bubbles = bubbles.filter((x) => x !== b);
        if (lives <= 0) {
          busy = true;
          timers.push(setTimeout(end, 500));
        }
      }
    }

    function frame(ts) {
      if (ended) return;
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
      last = ts;
      const floor = field.clientHeight - 44;
      if (!busy) {
        for (const b of bubbles) {
          if (!b.started) {
            if (ts < b.spawnAt) continue;
            b.started = true;
            b.el.style.visibility = "visible";
          }
          b.y += b.speed * dt;
          b.el.style.transform = `translateY(${b.y}px)`;
          if (b.y >= floor && b.isTarget) {
            busy = true;
            lives--;
            combo = 0;
            missed.push(target);
            b.el.classList.add("bad");
            render();
            timers.push(setTimeout(nextRound, 700));
            break;
          }
          if (b.y >= floor) {
            b.el.style.visibility = "hidden";
            b.speed = 0;
          }
        }
      }
      raf = requestAnimationFrame(frame);
    }

    nextRound();
    raf = requestAnimationFrame(frame);
    return () => {
      ended = true;
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
  }

  // ============================================================
  //  GAME 3: Ngữ pháp nhanh
  // ============================================================
  function startGrammar({ area, setStats, finish }) {
    const TOTAL = 10;
    const TIME = 15;
    const qs = pick(GRAMMAR, TOTAL);
    let idx = 0;
    let lives = 3;
    let score = 0;
    let right = 0;
    let combo = 0;
    let timeLeft = TIME;
    let answered = false;
    let timer = 0;
    const wrongTopics = [];

    const render = () => setStats(`<span>${hearts(lives)}</span><span>⭐ ${score}</span><span>${idx + 1}/${TOTAL}</span>`);

    function showQuestion() {
      const q = qs[idx];
      answered = false;
      timeLeft = TIME;
      const opts = shuffle([q.a, ...q.o]);
      area.innerHTML = `
        <div class="gm-timebar"><div class="gm-timebar-fill"></div></div>
        <div class="gm-question">${esc(q.q).replace("___", '<span class="gm-blank">___</span>')}</div>
        <div class="gm-options"></div>
        <div class="gm-explain" hidden></div>
        <div class="gm-actions"><button type="button" class="gm-btn gm-btn-primary gm-next" hidden>Tiếp tục →</button></div>`;
      const optsEl = area.querySelector(".gm-options");
      const fill = area.querySelector(".gm-timebar-fill");
      opts.forEach((o) => {
        const b = el("button", "gm-option", esc(o));
        b.type = "button";
        b.addEventListener("click", () => answer(o, b));
        optsEl.appendChild(b);
      });
      area.querySelector(".gm-next").addEventListener("click", next);
      render();
      clearInterval(timer);
      timer = setInterval(() => {
        timeLeft -= 0.1;
        fill.style.width = `${Math.max(0, (timeLeft / TIME) * 100)}%`;
        fill.classList.toggle("low", timeLeft < 5);
        if (timeLeft <= 0) answer(null, null);
      }, 100);
    }

    function answer(choice, btn) {
      if (answered) return;
      answered = true;
      clearInterval(timer);
      const q = qs[idx];
      const ok = choice === q.a;
      area.querySelectorAll(".gm-option").forEach((b) => {
        b.disabled = true;
        if (b.textContent === q.a) b.classList.add("ok");
      });
      if (ok) {
        right++;
        combo++;
        score += 10 + Math.min(combo - 1, 5) * 2 + (timeLeft > 10 ? 3 : 0);
      } else {
        combo = 0;
        lives--;
        btn?.classList.add("bad");
        wrongTopics.push(q);
      }
      const ex = area.querySelector(".gm-explain");
      ex.hidden = false;
      ex.innerHTML = `${ok ? "✅ Chính xác!" : choice === null ? "⏰ Hết giờ!" : "❌ Chưa đúng."} Đáp án: <b>${esc(q.a)}</b><br><span>${esc(q.e)}</span>`;
      ex.classList.toggle("is-bad", !ok);
      const nextBtn = area.querySelector(".gm-next");
      nextBtn.hidden = false;
      nextBtn.textContent = lives <= 0 || idx >= TOTAL - 1 ? "Xem kết quả →" : "Tiếp tục →";
      nextBtn.focus({ preventScroll: true });
      render();
    }

    function next() {
      if (lives <= 0 || idx >= TOTAL - 1) {
        return finish({
          score,
          xp: Math.min(45, right * 3 + (right === TOTAL ? 10 : 0)),
          headline: lives > 0 ? "Hoàn thành bài ngữ pháp!" : "Hết mạng rồi!",
          lines: [
            `Đúng ${right}/${Math.min(idx + 1, TOTAL)} câu`,
            ...wrongTopics.slice(0, 3).map((q) => `📝 ${esc(q.q.replace("___", q.a))}`),
          ],
        });
      }
      idx++;
      showQuestion();
    }

    showQuestion();
    return () => clearInterval(timer);
  }

  // ============================================================
  //  GAME 4: Đoán chữ
  // ============================================================
  function startHangman({ area, setStats, finish, pool, say }) {
    const ROUNDS = 5;
    const MAX_WRONG = 6;
    const candidates = pool.filter((w) => /^[a-z]{4,10}$/i.test(w.en));
    const words = pick(candidates.length >= ROUNDS ? candidates : pool.filter((w) => /^[a-z]+$/i.test(w.en)), ROUNDS);
    let idx = 0;
    let solved = 0;
    let score = 0;
    const missed = [];
    let cur = null;
    let guessed = new Set();
    let wrong = 0;
    let hintUsed = false;
    let over = false;

    const render = () => setStats(`<span>⭐ ${score}</span><span>${idx + 1}/${words.length}</span>`);

    function keyHandler(e) {
      if (over || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[a-z]$/i.test(e.key) && document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "INPUT") {
        guess(e.key.toLowerCase());
      }
    }
    document.addEventListener("keydown", keyHandler);

    function draw() {
      const word = cur.en.toLowerCase();
      const shown = [...word].map((c) => (guessed.has(c) ? c.toUpperCase() : "_")).join(" ");
      area.querySelector(".hg-word").textContent = shown;
      area.querySelector(".hg-lives").textContent = hearts(MAX_WRONG - wrong, MAX_WRONG);
      area.querySelectorAll(".gm-key").forEach((k) => {
        const c = k.dataset.k;
        k.disabled = guessed.has(c);
        k.classList.toggle("ok", guessed.has(c) && word.includes(c));
        k.classList.toggle("bad", guessed.has(c) && !word.includes(c));
      });
    }

    function showRound() {
      cur = words[idx];
      guessed = new Set();
      wrong = 0;
      hintUsed = false;
      area.innerHTML = `
        <div class="gm-prompt">Nghĩa: <b>${esc(cur.vi)}</b>${cur.topic ? `<small> · ${esc(normalizeTopic(cur.topic))}</small>` : ""}</div>
        <div class="hg-lives" aria-label="Số mạng còn lại"></div>
        <div class="hg-word" aria-live="polite"></div>
        <div class="gm-keys"></div>
        <div class="gm-actions"><button type="button" class="gm-btn gm-btn-ghost hg-hint">💡 Gợi ý (−5 điểm)</button></div>`;
      const keys = area.querySelector(".gm-keys");
      "abcdefghijklmnopqrstuvwxyz".split("").forEach((c) => {
        const k = el("button", "gm-key", c.toUpperCase());
        k.type = "button";
        k.dataset.k = c;
        k.addEventListener("click", () => guess(c));
        keys.appendChild(k);
      });
      area.querySelector(".hg-hint").addEventListener("click", hint);
      render();
      draw();
    }

    function hint() {
      if (hintUsed || over) return;
      const word = cur.en.toLowerCase();
      const c = [...word].find((ch) => !guessed.has(ch));
      if (!c) return;
      hintUsed = true;
      score = Math.max(0, score - 5);
      area.querySelector(".hg-hint").disabled = true;
      guess(c, true);
    }

    function guess(c, viaHint = false) {
      if (over || guessed.has(c)) return;
      guessed.add(c);
      const word = cur.en.toLowerCase();
      if (!word.includes(c) && !viaHint) wrong++;
      render();
      draw();
      const won = [...word].every((ch) => guessed.has(ch));
      if (won) {
        solved++;
        score += 20 - wrong * 2 + (hintUsed ? 0 : 5);
        say(cur.en);
        roundDone(true);
      } else if (wrong >= MAX_WRONG) {
        missed.push(cur);
        area.querySelector(".hg-word").textContent = [...word].join(" ").toUpperCase();
        roundDone(false);
      }
    }

    function roundDone(won) {
      over = true;
      const box = el("div", `gm-explain ${won ? "" : "is-bad"}`);
      box.innerHTML = `${won ? "✅ Giỏi lắm!" : "❌ Hết lượt rồi."} Đáp án: <b>${esc(cur.en)}</b> = ${esc(cur.vi)}`;
      const nextBtn = el("button", "gm-btn gm-btn-primary", idx >= words.length - 1 ? "Xem kết quả →" : "Từ tiếp theo →");
      nextBtn.type = "button";
      nextBtn.addEventListener("click", () => {
        if (idx >= words.length - 1) {
          return finish({
            score,
            xp: Math.min(35, solved * 6 + (solved === words.length ? 5 : 0)),
            headline: "Xong rồi!",
            lines: [`Đoán đúng ${solved}/${words.length} từ`],
            missed,
          });
        }
        idx++;
        over = false;
        showRound();
      });
      area.append(box, nextBtn);
      area.querySelectorAll(".gm-key, .hg-hint").forEach((k) => (k.disabled = true));
      nextBtn.focus({ preventScroll: true });
    }

    if (!words.length) {
      area.innerHTML = '<p class="gm-hint">Chưa đủ từ để chơi. Hãy thêm vài từ vào sổ từ nhé.</p>';
      return () => document.removeEventListener("keydown", keyHandler);
    }
    showRound();
    return () => document.removeEventListener("keydown", keyHandler);
  }

  // ============================================================
  //  GAME 5: Xếp câu
  // ============================================================
  function startBuilder({ area, setStats, finish, say }) {
    const TOTAL = 6;
    const items = pick(SENTENCES, TOTAL);
    let idx = 0;
    let right = 0;
    let score = 0;
    let built = [];
    let bank = [];
    let checked = false;

    const norm = (s) => s.toLowerCase().replace(/[.?!,]/g, "").replace(/\s+/g, " ").trim();
    const render = () => setStats(`<span>⭐ ${score}</span><span>${idx + 1}/${TOTAL}</span>`);

    function showItem() {
      const it = items[idx];
      checked = false;
      const tokens = it.en.split(" ");
      let order = shuffle(tokens.map((t, i) => ({ t, i })));
      if (order.map((o) => o.i).join() === tokens.map((_, i) => i).join()) order = order.reverse();
      bank = order;
      built = [];
      area.innerHTML = `
        <div class="gm-prompt">Dịch: <b>${esc(it.vi)}</b></div>
        <div class="gm-answer" aria-label="Câu của bạn"></div>
        <div class="gm-bank" aria-label="Các từ để chọn"></div>
        <div class="gm-explain" hidden></div>
        <div class="gm-actions">
          <button type="button" class="gm-btn gm-btn-ghost sb-clear">↺ Làm lại</button>
          <button type="button" class="gm-btn gm-btn-primary sb-check" disabled>Kiểm tra</button>
        </div>`;
      area.querySelector(".sb-clear").addEventListener("click", () => {
        if (checked) return;
        bank = [...bank, ...built];
        built = [];
        draw();
      });
      area.querySelector(".sb-check").addEventListener("click", check);
      render();
      draw();
    }

    function draw() {
      const ans = area.querySelector(".gm-answer");
      const bk = area.querySelector(".gm-bank");
      ans.innerHTML = "";
      bk.innerHTML = "";
      built.forEach((o, n) => {
        const b = el("button", "gm-token", esc(o.t));
        b.type = "button";
        b.addEventListener("click", () => {
          if (checked) return;
          built.splice(n, 1);
          bank.push(o);
          draw();
        });
        ans.appendChild(b);
      });
      bank.forEach((o, n) => {
        const b = el("button", "gm-token", esc(o.t));
        b.type = "button";
        b.addEventListener("click", () => {
          if (checked) return;
          bank.splice(n, 1);
          built.push(o);
          draw();
        });
        bk.appendChild(b);
      });
      const chk = area.querySelector(".sb-check");
      if (chk) chk.disabled = checked || bank.length > 0;
    }

    function check() {
      if (checked) return;
      checked = true;
      const it = items[idx];
      const ok = norm(built.map((o) => o.t).join(" ")) === norm(it.en);
      if (ok) {
        right++;
        score += 15;
        say(it.en);
      }
      const ex = area.querySelector(".gm-explain");
      ex.hidden = false;
      ex.classList.toggle("is-bad", !ok);
      ex.innerHTML = `${ok ? "✅ Chính xác!" : "❌ Chưa đúng."} Câu đúng: <b>${esc(it.en)}</b>`;
      area.querySelector(".gm-answer").classList.add(ok ? "ok" : "bad");
      const actions = area.querySelector(".gm-actions");
      actions.innerHTML = "";
      const nextBtn = el("button", "gm-btn gm-btn-primary", idx >= TOTAL - 1 ? "Xem kết quả →" : "Câu tiếp theo →");
      nextBtn.type = "button";
      nextBtn.addEventListener("click", () => {
        if (idx >= TOTAL - 1) {
          return finish({
            score,
            xp: Math.min(30, right * 4 + (right === TOTAL ? 6 : 0)),
            headline: "Xong bài xếp câu!",
            lines: [`Đúng ${right}/${TOTAL} câu`],
          });
        }
        idx++;
        showItem();
      });
      actions.appendChild(nextBtn);
      nextBtn.focus({ preventScroll: true });
      draw();
    }

    showItem();
    return () => {};
  }

  const GAMES = [
    { id: "match", emoji: "🃏", name: "Ghép thẻ", desc: "Lật thẻ, ghép từ tiếng Anh với nghĩa tiếng Việt.", skill: "Từ vựng · Trí nhớ", start: startMatch },
    { id: "rain", emoji: "🌧️", name: "Mưa chữ", desc: "Chạm đúng từ đang rơi trước khi nó chạm đất.", skill: "Từ vựng · Phản xạ", start: startRain },
    { id: "grammar", emoji: "⚡", name: "Ngữ pháp nhanh", desc: "Điền khuyết có tính giờ, combo và 3 mạng.", skill: "Ngữ pháp", start: startGrammar },
    { id: "hangman", emoji: "🔤", name: "Đoán chữ", desc: "Đoán từ tiếng Anh từ nghĩa tiếng Việt.", skill: "Từ vựng · Chính tả", start: startHangman },
    { id: "builder", emoji: "🧩", name: "Xếp câu", desc: "Sắp xếp các từ thành câu tiếng Anh đúng.", skill: "Ngữ pháp · Trật tự từ", start: startBuilder },
    { id: "dino-type", emoji: "🦖", name: "Khủng long gõ từ", desc: "Gõ đúng từ trên xương rồng để khủng long nhảy qua.", skill: "Từ vựng · Gõ nhanh", start: startDinoType },
    { id: "dino-speak", emoji: "🎙️", name: "Khủng long đọc từ", desc: "Đọc đúng từ trên xương rồng để khủng long nhảy qua.", skill: "Từ vựng · Phát âm", start: startDinoSpeak },
    { id: "plane", emoji: "✈️", name: "Máy bay bắn chim", desc: "Gõ lại từ cho sẵn, chọn nghĩa tiếng Việt để bắn chim.", skill: "Từ vựng · Chính tả · Nghĩa", start: startPlaneShooter },
  ];

  return { showHub, stop: cleanup, startGame };
}
