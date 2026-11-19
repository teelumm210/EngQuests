// ============================================
// EngQuests - Thẻ luyện & chấm điểm phát âm hiển thị ngay trong khung chat
//
// createPracticeCard() trả về một phần tử DOM gồm: mẫu cần đọc, nút nghe mẫu,
// nút thu âm, và kết quả (vòng điểm, từng từ, mẹo sửa). Điểm được chấm cục bộ
// bằng pronunciation.js; nút "Nhờ EngQuests nhận xét" gửi kết quả vào cuộc trò chuyện
// để AI nhận xét chi tiết.
// ============================================

import { SpeechListener, scorePronunciation, buildFeedback, scoreClass, tokenize } from "./pronunciation.js";
import { LearningStore } from "./store.js";

let activeCard = null; // thẻ đang thu âm (chỉ một thẻ được dùng mic tại một thời điểm)

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// ---------- Đọc mẫu (TTS) ----------
function pickEnglishVoice() {
  const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  return voices.find((v) => v.lang === "en-US") || voices.find((v) => v.lang?.startsWith("en")) || null;
}

export function speak(text, { rate = 0.9, onStart, onEnd } = {}) {
  if (!("speechSynthesis" in window)) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = rate;
  const voice = pickEnglishVoice();
  if (voice) u.voice = voice;
  u.onstart = () => onStart?.();
  u.onend = u.onerror = () => onEnd?.();
  speechSynthesis.speak(u);
  return true;
}

export function abortActivePractice() {
  activeCard?.abort();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

const ERRORS = {
  "not-allowed": "Chưa được cấp quyền micro. Bấm vào biểu tượng ổ khóa trên thanh địa chỉ và cho phép micro.",
  "audio-capture": "Không tìm thấy micro. Hãy kiểm tra thiết bị thu âm.",
  "no-speech": "EngQuests chưa nghe thấy giọng bạn. Hãy nói to hơn và thử lại.",
  network: "Nhận dạng giọng nói cần kết nối mạng. Kiểm tra Internet rồi thử lại.",
  unsupported: "Trình duyệt này không hỗ trợ nhận dạng giọng nói. Hãy dùng Chrome, Edge hoặc Safari.",
};

function countUp(el, target, onFrame) {
  if (reduceMotion() || !target) {
    el.textContent = target;
    onFrame?.(target);
    return;
  }
  const t0 = performance.now();
  (function step(now) {
    const k = Math.min(1, (now - t0) / 800);
    const v = Math.round(target * (1 - Math.pow(1 - k, 3)));
    el.textContent = v;
    onFrame?.(v);
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}

/**
 * @param {object} o
 * @param {string} o.text         từ hoặc câu cần đọc
 * @param {string} [o.ipa]
 * @param {string} [o.meaning]
 * @param {() => boolean} [o.canRecord]  trả false (và tự báo lỗi) nếu đang không thể dùng mic
 * @param {(r: object) => void} [o.onResult]       sau mỗi lần chấm
 * @param {(r: object) => void} [o.onAskFeedback]  khi bấm "Nhờ EngQuests nhận xét"
 */
export function createPracticeCard({ text, ipa = "", meaning = "", canRecord, onResult, onAskFeedback, onAddWord }) {
  const isWord = tokenize(text).length === 1;
  const listener = new SpeechListener("en-US");
  let session = 0;
  let last = null;

  const card = document.createElement("div");
  card.className = "practice-card";
  card.innerHTML = `
    <div class="pc-head">
      <span class="pc-tag">🎙️ Luyện phát âm</span>
      <span class="pc-kind">${isWord ? "Từ vựng" : "Câu"}</span>
    </div>
    <div class="pc-target ${isWord ? "is-word" : ""}">${esc(text)}</div>
    ${ipa ? `<div class="pc-ipa">${esc(ipa)}</div>` : ""}
    ${meaning ? `<div class="pc-vi">${esc(meaning)}</div>` : ""}
    <div class="pc-listen">
      <button type="button" class="pc-btn" data-act="listen">🔊 Nghe mẫu</button>
      <button type="button" class="pc-btn" data-act="slow">🐢 Đọc chậm</button>
    </div>
    <div class="pc-rec">
      <button type="button" class="pc-mic" data-act="rec" aria-label="Bắt đầu đọc" aria-pressed="false">🎤</button>
      <p class="pc-hint" aria-live="polite"></p>
    </div>
    <div class="pc-result" hidden>
      <div class="pc-score-row">
        <div class="score-ring" data-role="ring"><span data-role="num">0</span></div>
        <div class="pc-feedback">
          <strong data-role="title"></strong>
          <span data-role="desc"></span>
        </div>
      </div>
      <p class="pc-heard" data-role="heard"></p>
      <div class="pc-chips" data-role="chips"></div>
      <ul class="pc-tips" data-role="tips"></ul>
      <div class="pc-actions">
        <button type="button" class="pc-btn" data-act="retry">↻ Đọc lại</button>
        <button type="button" class="pc-btn" data-act="add" hidden>＋ Thêm vào flashcard</button>
        <button type="button" class="pc-btn primary" data-act="ask">💬 Nhờ EngQuests nhận xét</button>
      </div>
    </div>
  `;

  const $ = (sel) => card.querySelector(sel);
  const hint = $(".pc-hint");
  const mic = $(".pc-mic");
  const resultBox = $(".pc-result");
  const btnListen = $('[data-act="listen"]');
  const btnSlow = $('[data-act="slow"]');
  const btnAsk = $('[data-act="ask"]');
  const btnAdd = $('[data-act="add"]');

  const defaultHint = () =>
    SpeechListener.supported
      ? "Nhấn micro rồi đọc to, rõ ràng. Nhấn lần nữa để dừng."
      : ERRORS.unsupported;
  hint.textContent = defaultHint();
  if (!SpeechListener.supported) mic.disabled = true;

  function setRecording(on) {
    mic.classList.toggle("recording", on);
    mic.setAttribute("aria-pressed", String(on));
  }

  function abort() {
    session++;
    listener.abort();
    setRecording(false);
    if (activeCard === api) activeCard = null;
  }

  async function toggleRecord() {
    if (listener.listening) {
      listener.stop(); // dừng sớm: vẫn chấm phần đã nghe
      return;
    }
    if (canRecord && !canRecord()) return;

    if (activeCard && activeCard !== api) activeCard.abort();
    activeCard = api;
    if ("speechSynthesis" in window) speechSynthesis.cancel();

    resultBox.hidden = true;
    btnAsk.disabled = false;
    btnAsk.textContent = "💬 Nhờ EngQuests nhận xét";
    const mine = ++session;
    setRecording(true);
    hint.textContent = "🎤 Đang nghe… hãy đọc to và rõ ràng";

    try {
      const alts = await listener.listen({
        onInterim: (t) => {
          if (mine === session) hint.textContent = `🎤 “${t}”`;
        },
      });
      if (mine !== session) return;
      showResult(alts);
    } catch (err) {
      if (mine !== session || err.code === "aborted") return;
      hint.textContent = ERRORS[err.code] || `Không nhận dạng được giọng nói (${err.code || err.message}).`;
    } finally {
      if (mine === session) {
        setRecording(false);
        if (activeCard === api) activeCard = null;
      }
    }
  }

  function showResult(alts) {
    const result = scorePronunciation(text, alts);
    const fb = buildFeedback(result, { isWord });
    last = { ...result, targetText: text, isWord, fb };

    if (result.heardText) {
      LearningStore.addPronunciationResult(result.score);
      if (isWord) LearningStore.setWordPronunciation(text, result.score);
      onResult?.(last);
    }

    const ring = $('[data-role="ring"]');
    ring.className = `score-ring ${scoreClass(result.score)}`.trim();
    ring.style.setProperty("--p", 0);
    countUp($('[data-role="num"]'), result.score, (v) => ring.style.setProperty("--p", v));

    $('[data-role="title"]').textContent = fb.title;
    $('[data-role="desc"]').textContent = fb.desc;
    $('[data-role="heard"]').innerHTML = result.heardText ? `Máy nghe được: <em>“${esc(result.heardText)}”</em>` : "";

    const chips = $('[data-role="chips"]');
    chips.innerHTML = "";
    result.words.forEach((w, i) => {
      const chip = document.createElement("span");
      const cls = w.status === "correct" ? "correct" : w.status === "close" ? "close" : "missed";
      const note = w.status === "missing" ? "bỏ sót" : w.status !== "correct" && w.heard ? `nghe: ${w.heard}` : "";
      chip.className = `pc-chip ${cls}`;
      chip.style.setProperty("--i", i);
      chip.innerHTML = `${esc(w.word)}${note ? `<small>${esc(note)}</small>` : ""}`;
      chips.appendChild(chip);
    });

    const tips = $('[data-role="tips"]');
    tips.innerHTML = "";
    fb.tips.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      tips.appendChild(li);
    });

    btnAsk.hidden = !result.heardText;
    // Luyện xong một từ chưa có trong sổ: cho thêm vào flashcard ngay
    const inBook = LearningStore.hasWord(text);
    btnAdd.hidden = !(isWord && onAddWord && !inBook && result.heardText);
    if (!btnAdd.hidden) {
      btnAdd.disabled = false;
      btnAdd.classList.remove("done");
      btnAdd.textContent = "＋ Thêm vào flashcard";
    }
    resultBox.hidden = false;
    hint.textContent = result.score >= 75 ? "Tuyệt! Bạn có thể đọc lại hoặc nhờ EngQuests nhận xét." : "Nghe lại mẫu rồi đọc lại để cải thiện điểm nhé.";
    resultBox.scrollIntoView?.({ behavior: reduceMotion() ? "auto" : "smooth", block: "nearest" });
  }

  card.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    switch (btn.dataset.act) {
      case "listen":
        speak(text, { rate: 0.9, onStart: () => btnListen.classList.add("speaking"), onEnd: () => btnListen.classList.remove("speaking") });
        break;
      case "slow":
        speak(text, { rate: 0.55, onStart: () => btnSlow.classList.add("speaking"), onEnd: () => btnSlow.classList.remove("speaking") });
        break;
      case "rec":
      case "retry":
        toggleRecord();
        break;
      case "add":
        if (btnAdd.disabled) return;
        btnAdd.disabled = true;
        btnAdd.textContent = "Đang thêm…";
        Promise.resolve(onAddWord?.({ text, ipa, meaning }))
          .then(() => {
            btnAdd.classList.add("done");
            btnAdd.textContent = "✓ Đã thêm vào flashcard";
          })
          .catch(() => {
            btnAdd.disabled = false;
            btnAdd.textContent = "＋ Thêm vào flashcard";
          });
        break;
      case "ask":
        if (!last) return;
        btnAsk.disabled = true;
        btnAsk.textContent = "✓ Đã gửi cho EngQuests";
        onAskFeedback?.(last);
        break;
    }
  });

  const api = { el: card, abort };
  card._practice = api;
  return card;
}

/** Soạn tin nhắn gửi AI từ kết quả đã chấm (AI phải dùng đúng điểm này) */
export function buildResultMessage(r) {
  const detail = r.words
    .map((w) => `${w.word}=${w.status}${w.status !== "correct" && w.heard ? ` (nghe thành "${w.heard}")` : ""}`)
    .join(", ");
  const extra = r.extra?.length ? ` Từ thừa máy nghe thêm: "${r.extra.join(" ")}".` : "";
  return `[KẾT QUẢ LUYỆN PHÁT ÂM] Mục tiêu: "${r.targetText}". Máy nhận dạng nghe được: "${r.heardText}". Điểm: ${r.score}/100. Chi tiết từng từ: ${detail}.${extra} Hãy nhận xét theo hướng dẫn.`;
}
