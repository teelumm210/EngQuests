// ============================================
//  EngQuests - Frontend & Interactive Voice Experience
//  Hỗ trợ tự động phát hiện từ mới, luyện phát âm,
//  chấm điểm & hiệu ứng animation sinh động trong lúc gọi thoại
// ============================================

import { GeminiLiveClient } from "./live.js";
import { LearningStore } from "./store.js";
import { TOPICS, DEFAULT_TOPIC, topicIcon, PRACTICE_STARTERS, guessTopic } from "./features.js";
import { parseReply } from "./vocab-tags.js";
import { createPracticeCard, buildResultMessage, speak, abortActivePractice } from "./practice.js";
import { Settings } from "./settings.js";
import { VocaChat } from "./chat.js";
import { createGames } from "./games.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ---- State ----
const state = {
  chat: new VocaChat(),
  capturedImage: null,
  isRecording: false,
  recognition: null,
  cameraStream: null,
  facingMode: "environment",
  isLoading: false,
  isLiveActive: false,
  liveClient: null,
  muted: false,
  pendingVocab: [], // từ AI vừa hỏi "thêm vào flashcard?" trong chat chữ
  lastWord: null, // từ gần nhất vừa luyện / vừa được giới thiệu: {word, ipa, meaning, example, category}
  topicFilter: "all",
  deckTopic: "all",
};

let currentStreamElement = null;
let currentStreamRole = null;

// ---- DOM ----
const chatArea = $("#chat-area");
const messagesDiv = $("#messages");
const welcomeDiv = $("#welcome");
const typingIndicator = $("#typing-indicator");
const messageInput = $("#message-input");
const btnSend = $("#btn-send");
const btnVoice = $("#btn-voice");
const btnMic = $("#btn-mic");
const btnCamera = $("#btn-camera");
const btnNewChat = $("#btn-new-chat");
const cameraOverlay = $("#camera-overlay");
const cameraVideo = $("#camera-video");
const cameraCanvas = $("#camera-canvas");
const btnCapture = $("#btn-capture");
const btnCloseCamera = $("#btn-close-camera");
const btnSwitchCamera = $("#btn-switch-camera");
const imagePreview = $("#image-preview");
const previewImg = $("#preview-img");
const btnRemoveImage = $("#btn-remove-image");

// Voice view
const voiceView = $("#voice-view");
const orb = $("#orb");
const voiceStatus = $("#voice-status");
const capUser = $("#cap-user");
const capAi = $("#cap-ai");
const btnEndCall = $("#btn-end-call");
const btnLiveMute = $("#btn-live-mute");
const btnLiveCam = $("#btn-live-cam");
const btnLiveCc = $("#btn-live-cc");
const liveCameraPip = $("#live-camera-pip");
const pipVideo = $("#pip-video");
const btnLiveFlip = $("#btn-live-flip");

// Live Interactive Widgets DOM
const voiceTimerVal = $("#voice-timer-value");
const voiceNewWordsVal = $("#voice-new-words-value");
const btnToggleVocabPanel = $("#btn-toggle-vocab-panel");
const voiceVocabPanel = $("#voice-vocab-panel");
const btnCloseVocabPanel = $("#btn-close-vocab-panel");
const voiceVocabList = $("#voice-vocab-panel-list");

const voiceVocabCard = $("#voice-vocab-card");
const vvcWord = $("#vvc-word");
const vvcIpa = $("#vvc-ipa");
const vvcMeaning = $("#vvc-meaning");
const vvcExample = $("#vvc-example");
const btnVvcSave = $("#btn-vvc-save");
const btnVvcSpeak = $("#btn-vvc-speak");
const btnCloseVvc = $("#btn-close-vvc");

const voiceScoreOverlay = $("#voice-score-overlay");
const vsoScoreNum = $("#vso-score-num");
const vsoRingBar = $("#vso-ring-bar");
const vsoStars = $("#vso-stars");
const vsoTitle = $("#vso-title");
const vsoTargetWord = $("#vso-target-word");
const vsoFeedback = $("#vso-feedback");
const vsoXpTag = $("#vso-xp-tag");

let pipStream = null;
let currentFlashcardIndex = 0;
let callStartTime = null;
let callTimerInterval = null;
let currentLiveVocab = null; // Từ mới đang được đề xuất trong Voice mode
let discoveredWordsInCall = []; // Danh sách từ phát hiện trong cuộc gọi

// ---- Feature Modals DOM ----
const btnStreakBadge = $("#btn-streak-badge");
const streakCountEl = $("#streak-count");
const btnOpenPronunciation = $("#btn-open-pronunciation");
const chipPronunciation = $("#chip-pronunciation");

const btnOpenNotebook = $("#btn-open-notebook");
const notebookCountEl = $("#notebook-count");
const modalNotebook = $("#modal-notebook");
const btnCloseNotebook = $("#btn-close-notebook");
const tabWordList = $("#tab-word-list");
const tabFlashcards = $("#tab-flashcards");
const viewWordList = $("#view-word-list");
const viewFlashcards = $("#view-flashcards");
const wordListContainer = $("#word-list-container");
const topicFilterEl = $("#topic-filter");
const fcTopicSelect = $("#fc-topic-select");
const btnFcPractice = $("#btn-fc-practice");

const activeFlashcard = $("#active-flashcard");
const fcWord = $("#fc-word");
const fcIpa = $("#fc-ipa");
const fcMeaning = $("#fc-meaning");
const fcExample = $("#fc-example");
const btnFcSound = $("#btn-fc-sound");
const btnFcPrev = $("#btn-fc-prev");
const btnFcNext = $("#btn-fc-next");
const fcCounter = $("#fc-counter");

const modalStats = $("#modal-stats");
const btnCloseStats = $("#btn-close-stats");
const statStreakVal = $("#stat-streak-val");
const statTimeVal = $("#stat-time-val");
const statWordsVal = $("#stat-words-val");
const statPronCountVal = $("#stat-pron-count-val");
const statPronAvgVal = $("#stat-pron-avg-val");
const chipNotebook = $("#chip-notebook");

// ---- Trò chơi ----
const btnOpenGames = $("#btn-open-games");
const chipGames = $("#chip-games");
const modalGames = $("#modal-games");
const btnCloseGames = $("#btn-close-games");
let games = null;

// ---- Cài đặt & giao diện ----
const btnTheme = $("#btn-theme");
const btnSettings = $("#btn-settings");
const modalSettings = $("#modal-settings");
const btnCloseSettings = $("#btn-close-settings");
const btnSaveSettings = $("#btn-save-settings");

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ============================================
//  Web Audio Sound FX (Không cần file ngoài)
// ============================================
let audioCtx = null;
function getAudioContext() {
  try {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  } catch (e) {}
  return audioCtx;
}

function playSuccessChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5 - E5 - G5 - C6
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, now + i * 0.08);
      gain.gain.setValueAtTime(0.0001, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.16, now + i * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.35);
    });
  } catch (e) {}
}

function playScoreFanfare(score) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = score >= 85 ? [440, 554.37, 659.25, 880] : [392, 493.88, 587.33];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, now + i * 0.09);
      gain.gain.setValueAtTime(0.001, now + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.09 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.38);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.4);
    });
  } catch (e) {}
}

// ============================================
//  Confetti & Celebration Particle Engine
// ============================================
function triggerConfetti() {
  const container = document.getElementById("celebration-container");
  if (!container) return;
  const colors = ["#58CC02", "#1CB0F6", "#FF9600", "#FF4B4B", "#CE82FF", "#FFD700", "#00F5D4"];
  const count = 35;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    p.className = "confetti-particle";
    const x = Math.random() * 100;
    const delay = Math.random() * 0.25;
    const duration = 1.6 + Math.random() * 1.4;
    const size = 8 + Math.random() * 7;
    const color = colors[Math.floor(Math.random() * colors.length)];
    p.style.cssText = `
      left: ${x}vw;
      width: ${size}px;
      height: ${size * (Math.random() > 0.4 ? 1 : 1.5)}px;
      background-color: ${color};
      animation-duration: ${duration}s;
      animation-delay: ${delay}s;
      border-radius: ${Math.random() > 0.3 ? "2px" : "50%"};
    `;
    container.appendChild(p);
    setTimeout(() => p.remove(), (duration + delay) * 1000 + 400);
  }
}

function triggerFloatingXP(amount, element) {
  const floater = document.createElement("div");
  floater.className = "floating-xp-pill";
  floater.textContent = `+${amount} XP`;
  document.body.appendChild(floater);
  if (element) {
    const rect = element.getBoundingClientRect();
    floater.style.left = `${rect.left + rect.width / 2}px`;
    floater.style.top = `${rect.top}px`;
  } else {
    floater.style.left = "50%";
    floater.style.top = "42%";
  }
  setTimeout(() => floater.remove(), 1600);
}

// ============================================
//  Markdown (nhẹ)
// ============================================
function parseMarkdown(text) {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/^\- (.+)$/gm, "<li>$1</li>")
    .replace(/^\* (.+)$/gm, "<li>$1</li>")
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");

  if (!html.startsWith("<h") && !html.startsWith("<ul") && !html.startsWith("<ol")) {
    html = "<p>" + html + "</p>";
  }
  return html;
}

// ============================================
//  Toast
// ============================================
function showToast(message, type = "info") {
  const container = $("#toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

// ============================================
//  Chat UI
// ============================================
function addMessage(content, role, imageUrl = null) {
  if (welcomeDiv) welcomeDiv.style.display = "none";

  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${role}`;

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";

  if (imageUrl) {
    const img = document.createElement("img");
    img.className = "message-image";
    img.src = imageUrl;
    img.alt = "Ảnh đã gửi";
    img.onclick = () => window.open(imageUrl, "_blank");
    contentDiv.appendChild(img);
  }

  if (content) {
    const textDiv = document.createElement("div");
    if (role === "ai") {
      textDiv.innerHTML = parseMarkdown(content);
    } else {
      textDiv.textContent = content;
    }
    contentDiv.appendChild(textDiv);
  }

  msgDiv.appendChild(contentDiv);
  msgDiv._fullText = content || "";
  messagesDiv.appendChild(msgDiv);

  scrollToBottom();
  return msgDiv;
}

// Tin nhắn AI trong chat chữ
function addAiReply(raw) {
  const { display, vocab, practice } = parseReply(raw);
  const msgEl = addMessage(display, "ai");
  const content = msgEl.querySelector(".message-content");

  const pending = [];
  vocab.forEach((item) => {
    const card = buildVocabCard(item);
    content.appendChild(card.el);
    if (!card.alreadySaved) pending.push(card);
  });
  state.pendingVocab = pending;

  if (practice) content.appendChild(makePracticeCard(practice));
  scrollToBottom();
  return msgEl;
}

function rememberWord(o) {
  if (!o || !o.word || !/^[A-Za-z][A-Za-z'-]{0,39}$/.test(String(o.word).trim())) return;
  state.lastWord = {
    word: String(o.word).trim(),
    ipa: o.ipa || "",
    meaning: o.meaning || "",
    example: o.example || "",
    category: o.category || "",
  };
}

function makePracticeCard(opts) {
  // Chỉ ghi nhớ khi mẫu là MỘT từ (câu dài không phải từ vựng)
  if (opts && opts.text && /^[A-Za-z][A-Za-z'-]*$/.test(String(opts.text).trim())) {
    rememberWord({ word: opts.text, ipa: opts.ipa, meaning: opts.meaning });
  }
  return createPracticeCard({
    ...opts,
    canRecord: () => {
      if (state.isLiveActive) {
        showToast("Hãy kết thúc cuộc gọi trước khi luyện phát âm (micro đang được dùng)", "warning");
        return false;
      }
      return true;
    },
    onResult: (res) => {
      updateBadgeUI();
      renderStatsModalIfOpen();
      if (res && res.score >= 80) {
        triggerConfetti();
        playScoreFanfare(res.score);
      }
    },
    onAskFeedback: (r) => {
      const shown = r.isWord ? `“${r.targetText}”` : "câu vừa rồi";
      sendMessage({
        displayText: `🎙️ Mình vừa đọc ${shown}: ${r.score}/100. EngQuests nhận xét giúp mình nhé!`,
        apiText: buildResultMessage(r),
      });
    },
  });
}

function addPracticeMessage(opts, note = "") {
  if (welcomeDiv) welcomeDiv.style.display = "none";
  const msgDiv = document.createElement("div");
  msgDiv.className = "message ai";
  const content = document.createElement("div");
  content.className = "message-content";
  if (note) {
    const p = document.createElement("div");
    p.innerHTML = parseMarkdown(note);
    content.appendChild(p);
  }
  content.appendChild(makePracticeCard(opts));
  msgDiv.appendChild(content);
  messagesDiv.appendChild(msgDiv);
  scrollToBottom();
}

function startQuickPractice() {
  if (state.isLiveActive) {
    showToast("Hãy kết thúc cuộc gọi trước khi luyện phát âm", "warning");
    return;
  }
  closeAllModals();
  const words = LearningStore.getWords();
  if (words.length) {
    const ranked = [...words].sort((a, b) => (a.pronBest ?? -1) - (b.pronBest ?? -1)).slice(0, 4);
    const w = ranked[Math.floor(Math.random() * ranked.length)];
    addPracticeMessage(
      { text: w.word, ipa: w.ipa, meaning: w.meaning },
      "Mình luyện một từ trong flashcard của bạn nhé. Đọc xong có thể nhờ EngQuests nhận xét chi tiết."
    );
  } else {
    const st = PRACTICE_STARTERS[Math.floor(Math.random() * PRACTICE_STARTERS.length)];
    addPracticeMessage(st, "Flashcard của bạn còn trống nên EngQuests gợi ý một mẫu để khởi động. Hỏi EngQuests từ mới để có thêm từ luyện nhé!");
  }
}

// ---------- Thẻ "Từ mới" trong Chat chữ ----------
function addWordToFlashcards(item) {
  const entry = LearningStore.saveWord(item);
  updateBadgeUI();
  triggerConfetti();
  playSuccessChime();
  return entry;
}

function buildVocabCard(item) {
  rememberWord(item);
  const existing = LearningStore.findWord(item.word);
  const el = document.createElement("div");
  el.className = "vocab-card";
  let entry = existing;

  const topicOptions = TOPICS.map(
    (t) => `<option value="${escapeHtml(t.id)}">${t.icon} ${escapeHtml(t.id)}</option>`
  ).join("");

  el.innerHTML = `
    <div class="vc-top">
      <div class="vc-word">
        <strong>${escapeHtml(item.word)}</strong>
        ${item.pos ? `<em>${escapeHtml(item.pos)}</em>` : ""}
        ${item.ipa ? `<span>${escapeHtml(item.ipa)}</span>` : ""}
      </div>
      <button type="button" class="vc-icon-btn" data-act="listen" title="Nghe phát âm" aria-label="Nghe phát âm">🔊</button>
    </div>
    ${item.meaning ? `<div class="vc-meaning">${escapeHtml(item.meaning)}</div>` : ""}
    ${item.example ? `<div class="vc-example">“${escapeHtml(item.example)}”</div>` : ""}
    <div class="vc-topic">
      <label>Chủ đề</label>
      <select data-role="topic" aria-label="Chủ đề của từ">${topicOptions}</select>
    </div>
    <div class="vc-actions"></div>
  `;
  const select = el.querySelector('[data-role="topic"]');
  const actions = el.querySelector(".vc-actions");
  select.value = (existing ? existing.category : item.category) || DEFAULT_TOPIC;

  const mkBtn = (label, cls, onClick) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "vc-btn " + cls;
    b.textContent = label;
    b.onclick = onClick;
    return b;
  };

  const practiceBtn = () =>
    mkBtn("🎙️ Luyện phát âm", "", () => {
      el.parentElement.appendChild(
        makePracticeCard({ text: item.word, ipa: item.ipa, meaning: item.meaning })
      );
      scrollToBottom();
    });

  function showAdded() {
    el.classList.add("added");
    actions.innerHTML = "";
    const ok = document.createElement("span");
    ok.className = "vc-added";
    ok.textContent = "✓ Đã có trong flashcard";
    actions.append(ok, practiceBtn());
    if (!existing) {
      actions.append(
        mkBtn("Hoàn tác", "ghost", () => {
          if (entry) LearningStore.deleteWord(entry.id);
          entry = null;
          updateBadgeUI();
          el.classList.remove("added");
          showAsk();
          if (!state.pendingVocab.includes(api)) state.pendingVocab.push(api);
        })
      );
    }
  }

  function showAsk() {
    actions.innerHTML = "";
    actions.append(
      mkBtn("+ Thêm vào flashcard", "primary", () => confirmAdd(true)),
      mkBtn("Bỏ qua", "ghost", () => dismiss()),
      practiceBtn()
    );
  }

  function confirmAdd(notifyAi) {
    item.category = select.value;
    entry = addWordToFlashcards({ ...item, category: select.value });
    state.pendingVocab = state.pendingVocab.filter((c) => c !== api);
    showAdded();
    showToast(`Đã thêm "${item.word}" vào flashcard (${select.value})`, "success");
    if (notifyAi) {
      sendMessage({
        displayText: "Có, thêm vào flashcard nhé!",
        apiText: `Có, thêm vào flashcard nhé. [Ứng dụng: đã thêm "${item.word}" vào flashcard, chủ đề "${select.value}".]`,
      });
    }
  }

  function dismiss() {
    state.pendingVocab = state.pendingVocab.filter((c) => c !== api);
    el.classList.add("dismissed");
    actions.innerHTML = "";
    const note = document.createElement("span");
    note.className = "vc-added muted";
    note.textContent = "Đã bỏ qua";
    actions.append(note, practiceBtn());
  }

  select.addEventListener("change", () => {
    item.category = select.value;
    if (entry) LearningStore.setWordCategory(entry.id, select.value);
  });
  el.querySelector('[data-act="listen"]').onclick = () => speak(item.word, { rate: 0.85 });

  const api = { el, item, alreadySaved: !!existing, confirmAdd, dismiss, entryTopic: () => select.value };
  if (existing) showAdded();
  else showAsk();
  return api;
}

// "thêm vào sổ từ", "lưu từ này vào flashcard", "add to flashcard"... (không cần chờ AI)
const ADD_WORD_RE =
  /^(?:(?:hãy|hay|giúp mình|giup minh|vui lòng|vui long|bạn|ban|voca|engquests)\s+)*(?:thêm|them|lưu|luu|add|save)\b.{0,40}?(?:sổ từ|so tu|sổ|so\b|flashcard|flash card|thẻ từ|the tu|từ điển|vocab)/iu;

/** Trả về true nếu đã xử lý xong lệnh (không cần gửi cho AI) */
function handleAddWordCommand(message) {
  const text = message.trim();
  if (text.length > 60 || !ADD_WORD_RE.test(text)) return false;
  if (state.pendingVocab.length) return false; // đã có thẻ chờ xác nhận: để luồng cũ xử lý
  const w = state.lastWord;
  if (!w) return false; // chưa biết từ nào: để AI hỏi lại

  addMessage(message, "user");
  const existing = LearningStore.findWord(w.word);
  let reply;
  if (existing) {
    reply = `Từ **${w.word}** đã có sẵn trong sổ từ của bạn rồi nè ✅`;
  } else {
    const category = w.category || guessTopic(w.meaning);
    addWordToFlashcards({ ...w, category });
    showToast(`Đã thêm "${w.word}" vào flashcard (${category})`, "success");
    reply = `Đã thêm **${w.word}** vào sổ từ (chủ đề ${category}) ✅ Bạn có thể mở **Số từ** để xem. Muốn luyện phát âm thêm từ này không?`;
  }
  addMessage(reply, "ai");
  return true;
}

const YES_RE = /^(có|co|ok|oke|okay|okla|ừ|ừm|uh|được|duoc|đồng ý|dong y|yes|yep|yeah|sure|thêm|them|lưu|luu|add)(?![\p{L}\p{N}])/iu;
const NO_RE = /^(không|khong|ko|k|no|nope|thôi|thoi|bỏ qua|bo qua|đừng|dung)(?![\p{L}\p{N}])/iu;

function handlePendingVocabReply(message) {
  if (!state.pendingVocab.length) return "";
  const text = message.trim();
  if (text.length > 60) return "";
  if (YES_RE.test(text)) {
    const cards = [...state.pendingVocab];
    cards.forEach((c) => c.confirmAdd(false));
    return ` [Ứng dụng: đã thêm ${cards.map((c) => `"${c.item.word}" (chủ đề "${c.entryTopic()}")`).join(", ")} vào flashcard.]`;
  }
  if (NO_RE.test(text)) {
    [...state.pendingVocab].forEach((c) => c.dismiss());
    return " [Ứng dụng: người dùng không muốn thêm vào flashcard.]";
  }
  return "";
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    chatArea.scrollTop = chatArea.scrollHeight;
  });
}

function setLoading(loading) {
  state.isLoading = loading;
  typingIndicator.style.display = loading ? "flex" : "none";
  updateSendButton();
  if (loading) scrollToBottom();
}

// ============================================
//  Voice Mode Interactive Features (Live Call)
// ============================================
const STATUS_TEXT = {
  connecting: "Đang kết nối…",
  listening: "Đang nghe bạn nói",
  thinking: "Đang suy nghĩ…",
  speaking: "EngQuests đang nói",
};

let voiceState = "connecting";
let orbLevel = 0;
let rafId = null;
let userSpokeThisTurn = false;
let lastUserActivity = 0;
let thinkingSince = 0;

function setVoiceState(next) {
  if (next === "thinking") thinkingSince = performance.now();
  voiceState = next;
  voiceView.dataset.state = next;
  renderStatus();
}

function renderStatus() {
  if (state.muted && voiceState !== "connecting") {
    voiceStatus.textContent = voiceState === "speaking" ? "EngQuests đang nói · Mic đã tắt" : "Mic đã tắt";
  } else {
    voiceStatus.textContent = STATUS_TEXT[voiceState] || "";
  }
}

// Vòng lặp cập nhật chuyển động Quả cầu & Thanh sóng âm Equalizer
function voiceLoop() {
  const client = state.liveClient;
  const now = performance.now();
  let target = 0;

  if (client && client.isConnected) {
    const inLevel = client.getInputLevel();
    const outLevel = client.getOutputLevel();

    if (voiceState === "speaking") {
      target = outLevel;
    } else if (voiceState === "listening") {
      target = inLevel * 0.9;
      if (inLevel > 0.12) {
        userSpokeThisTurn = true;
        lastUserActivity = now;
      }
      if (userSpokeThisTurn && !client.isSpeaking && now - lastUserActivity > 900) {
        setVoiceState("thinking");
      }
    }
    if (voiceState === "thinking" && (inLevel > 0.2 || now - thinkingSince > 10000)) {
      userSpokeThisTurn = false;
      setVoiceState("listening");
    }
  }

  orbLevel += (target - orbLevel) * 0.28;
  orb.style.setProperty("--level", orbLevel.toFixed(3));

  // Cập nhật Waveform bars sinh động
  const waveformBars = $$(".waveform-bar");
  if (waveformBars && waveformBars.length) {
    waveformBars.forEach((bar, idx) => {
      const offset = Math.sin(now * 0.008 + idx * 0.6) * 0.25;
      const height = Math.max(6, Math.min(48, Math.round((orbLevel + offset) * 55)));
      bar.style.height = `${height}px`;
    });
  }

  rafId = requestAnimationFrame(voiceLoop);
}

// Timer đếm thời gian thực trong cuộc gọi
function startCallTimer() {
  if (callTimerInterval) clearInterval(callTimerInterval);
  if (voiceTimerVal) voiceTimerVal.textContent = "00:00";
  callTimerInterval = setInterval(() => {
    if (!callStartTime || !voiceTimerVal) return;
    const diff = Math.floor((Date.now() - callStartTime) / 1000);
    const m = String(Math.floor(diff / 60)).padStart(2, "0");
    const s = String(diff % 60).padStart(2, "0");
    voiceTimerVal.textContent = `${m}:${s}`;
  }, 1000);
}

function stopCallTimer() {
  if (callTimerInterval) {
    clearInterval(callTimerInterval);
    callTimerInterval = null;
  }
}

// --- Floating Vocab Card (Đề xuất & Thêm từ trong lúc voice call) ---
function showLiveVocabCard(vocabObj) {
  if (!vocabObj || !vocabObj.word) return;
  const wordClean = vocabObj.word.trim();
  const existing = LearningStore.findWord(wordClean);

  currentLiveVocab = {
    word: wordClean,
    ipa: vocabObj.ipa || "",
    meaning: vocabObj.meaning || "Từ vựng tiếng Anh",
    example: vocabObj.example || "",
    category: vocabObj.category || DEFAULT_TOPIC,
    saved: !!existing,
  };

  // Cập nhật DOM
  if (vvcWord) vvcWord.textContent = currentLiveVocab.word;
  if (vvcIpa) vvcIpa.textContent = currentLiveVocab.ipa || "";
  if (vvcMeaning) vvcMeaning.textContent = currentLiveVocab.meaning;
  if (vvcExample) vvcExample.textContent = currentLiveVocab.example ? `"${currentLiveVocab.example}"` : "";

  if (btnVvcSave) {
    if (existing) {
      btnVvcSave.classList.add("saved");
      btnVvcSave.innerHTML = `<span class="vvc-btn-icon">✓</span><span class="vvc-btn-text">Đã có trong Flashcard</span>`;
    } else {
      btnVvcSave.classList.remove("saved");
      btnVvcSave.innerHTML = `<span class="vvc-btn-icon">➕</span><span class="vvc-btn-text">Thêm vào Flashcard</span>`;
    }
  }

  // Thêm vào danh sách phát hiện của cuộc gọi
  const idx = discoveredWordsInCall.findIndex((w) => w.word.toLowerCase() === wordClean.toLowerCase());
  if (idx < 0) {
    discoveredWordsInCall.push({ ...currentLiveVocab });
  } else {
    discoveredWordsInCall[idx] = { ...currentLiveVocab };
  }
  updateVoiceDiscoveredWordsUI();

  if (voiceVocabCard) {
    voiceVocabCard.style.display = "flex";
    voiceVocabCard.classList.remove("card-exit");
    voiceVocabCard.classList.add("card-enter");
  }
}

function hideLiveVocabCard() {
  if (voiceVocabCard) {
    voiceVocabCard.classList.remove("card-enter");
    voiceVocabCard.classList.add("card-exit");
    setTimeout(() => {
      voiceVocabCard.style.display = "none";
    }, 280);
  }
}

function confirmAddLiveVocab(args = null, { notifyAi = true } = {}) {
  // AI gọi save_to_flashcard kèm từ mà chưa từng đề xuất thẻ: tạo thẻ rồi lưu luôn
  const w = args && typeof args.word === "string" ? args.word.trim() : "";
  if (w && (!currentLiveVocab || currentLiveVocab.word.toLowerCase() !== w.toLowerCase())) {
    showLiveVocabCard({
      word: w,
      ipa: args.ipa,
      meaning: args.meaning,
      example: args.example,
      category: args.category || DEFAULT_TOPIC,
    });
  }
  if (!currentLiveVocab || currentLiveVocab.saved) return;
  currentLiveVocab.saved = true;

  LearningStore.saveWord({
    word: currentLiveVocab.word,
    ipa: currentLiveVocab.ipa,
    meaning: currentLiveVocab.meaning,
    example: currentLiveVocab.example,
    category: currentLiveVocab.category,
  });

  // Cập nhật trong danh sách
  const item = discoveredWordsInCall.find((w) => w.word.toLowerCase() === currentLiveVocab.word.toLowerCase());
  if (item) item.saved = true;
  updateVoiceDiscoveredWordsUI();

  // Hiệu ứng ăn mừng
  if (btnVvcSave) {
    btnVvcSave.classList.add("saved");
    btnVvcSave.innerHTML = `<span class="vvc-btn-icon">🎉</span><span class="vvc-btn-text">Đã thêm vào Flashcard!</span>`;
  }

  playSuccessChime();
  triggerConfetti();
  triggerFloatingXP(15, btnVvcSave || voiceVocabCard);
  updateBadgeUI();

  showToast(`✨ Đã thêm "${currentLiveVocab.word}" vào Flashcard!`, "success");

  // Báo cho AI biết người dùng đã đồng ý lưu từ để AI tiếp tục cuộc trò chuyện
  if (notifyAi && state.liveClient && state.liveClient.isConnected) {
    state.liveClient.sendText(`[Hệ thống: Người dùng đã đồng ý lưu từ "${currentLiveVocab.word}" vào flashcard. Hãy xác nhận ngắn gọn bằng giọng nói và tiếp tục bài học!]`);
  }

  setTimeout(() => {
    hideLiveVocabCard();
  }, 3500);
}

function updateVoiceDiscoveredWordsUI() {
  const count = discoveredWordsInCall.length;
  if (voiceNewWordsVal) {
    voiceNewWordsVal.textContent = `${count} từ mới`;
  }
  if (btnToggleVocabPanel) {
    btnToggleVocabPanel.classList.toggle("has-words", count > 0);
  }

  // Render danh sách drawer
  if (voiceVocabList) {
    voiceVocabList.innerHTML = "";
    if (count === 0) {
      voiceVocabList.innerHTML = `<div class="vvp-empty">Chưa có từ mới nào. Hãy trò chuyện với EngQuests để học thêm từ mới!</div>`;
      return;
    }
    discoveredWordsInCall.forEach((w) => {
      const row = document.createElement("div");
      row.className = `vvp-item ${w.saved ? "saved" : ""}`;
      row.innerHTML = `
        <div class="vvp-item-info">
          <strong>${escapeHtml(w.word)}</strong>
          <span>${escapeHtml(w.ipa || "")} - ${escapeHtml(w.meaning || "")}</span>
        </div>
        <button class="vvp-item-btn ${w.saved ? "saved" : ""}">
          ${w.saved ? "✓ Đã lưu" : "+ Thêm"}
        </button>
      `;
      const btn = row.querySelector(".vvp-item-btn");
      if (!w.saved) {
        btn.onclick = () => {
          w.saved = true;
          LearningStore.saveWord(w);
          btn.classList.add("saved");
          btn.textContent = "✓ Đã lưu";
          playSuccessChime();
          triggerConfetti();
          updateBadgeUI();
          showToast(`Đã lưu "${w.word}"`, "success");
        };
      }
      voiceVocabList.appendChild(row);
    });
  }
}

// --- Live Pronunciation Score Overlay (Chấm điểm phát âm) ---
let scoreOverlayTimeout = null;
let lastToolScore = { at: 0, score: -1, word: "" };
function showLivePronunciationScore(score, targetWord = "", feedback = "", source = "tool") {
  if (scoreOverlayTimeout) clearTimeout(scoreOverlayTimeout);
  if (!voiceScoreOverlay) return;

  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return;
  const validScore = Math.max(0, Math.min(100, Math.round(numeric)));

  // Chống cộng XP hai lần: tool và phân tích lời thoại có thể cùng báo một điểm
  const now = performance.now();
  if (source === "text" && now - lastToolScore.at < 15000) return;
  if (source === "tool") {
    const dup = now - lastToolScore.at < 8000 && lastToolScore.score === validScore && lastToolScore.word === (targetWord || "");
    lastToolScore = { at: now, score: validScore, word: targetWord || "" };
    if (dup) return;
  }

  // Cập nhật số điểm
  if (vsoScoreNum) {
    let current = 0;
    const duration = 600;
    const startTime = performance.now();
    function animateScore(now) {
      const progress = Math.min(1, (now - startTime) / duration);
      const val = Math.round(validScore * (1 - Math.pow(1 - progress, 3)));
      vsoScoreNum.textContent = val;
      if (progress < 1) requestAnimationFrame(animateScore);
    }
    requestAnimationFrame(animateScore);
  }

  // Cập nhật vòng SVG
  if (vsoRingBar) {
    const circumference = 2 * Math.PI * 50; // r = 50
    const offset = circumference - (validScore / 100) * circumference;
    vsoRingBar.style.strokeDasharray = `${circumference}`;
    vsoRingBar.style.strokeDashoffset = `${offset}`;
    if (validScore >= 85) {
      vsoRingBar.style.stroke = "#58CC02";
    } else if (validScore >= 65) {
      vsoRingBar.style.stroke = "#FF9600";
    } else {
      vsoRingBar.style.stroke = "#FF4B4B";
    }
  }

  // Số sao & Đánh giá
  let stars = "⭐";
  let title = "Cần cố gắng thêm nhé! 🌱";
  if (validScore >= 90) {
    stars = "⭐⭐⭐";
    title = "Xuất sắc! 🎉";
  } else if (validScore >= 75) {
    stars = "⭐⭐";
    title = "Rất tốt! 👍";
  } else if (validScore >= 55) {
    stars = "⭐";
    title = "Khá ổn! 💪";
  }

  if (vsoStars) vsoStars.textContent = stars;
  if (vsoTitle) vsoTitle.textContent = title;
  if (vsoTargetWord) vsoTargetWord.textContent = targetWord ? `"${targetWord}"` : "";
  if (vsoFeedback) vsoFeedback.textContent = feedback || (validScore >= 80 ? "Phát âm rất rõ ràng và chuẩn xác!" : "Hãy chú ý thêm âm đuôi và trọng âm nhé!");
  const earnedXP = LearningStore.XP_PER_PRONUNCIATION + (validScore >= 90 ? LearningStore.XP_HIGH_SCORE_BONUS : 0);
  if (vsoXpTag) vsoXpTag.textContent = `+${earnedXP} XP`;

  voiceScoreOverlay.style.display = "flex";
  voiceScoreOverlay.classList.remove("overlay-exit");
  voiceScoreOverlay.classList.add("overlay-enter");

  playScoreFanfare(validScore);
  if (validScore >= 80) {
    triggerConfetti();
  }

  // Tích luỹ XP & Thống kê
  LearningStore.addPronunciationResult(validScore);
  if (targetWord) LearningStore.setWordPronunciation(targetWord, validScore);
  updateBadgeUI();

  scoreOverlayTimeout = setTimeout(() => {
    voiceScoreOverlay.classList.remove("overlay-enter");
    voiceScoreOverlay.classList.add("overlay-exit");
    setTimeout(() => {
      voiceScoreOverlay.style.display = "none";
    }, 300);
  }, 4200);
}

// --- Bộ phân tích lời nói tự động (Dual Engine Fallback) ---
function analyzeAiSpeechForVocabAndScore(text) {
  if (!text) return;

  // 1. Phân tích điểm phát âm từ lời thoại của AI
  // Ví dụ: "tặng bạn 95 điểm", "chấm bạn 85 điểm", "được 90/100"
  const scoreMatch = text.match(/(?:tặng bạn|chấm bạn|được|đạt|là|cho bạn)\s*(\d{1,3})\s*(?:điểm|\/100)/i) ||
                     text.match(/(\d{1,3})\s*điểm/i);
  if (scoreMatch) {
    const sc = parseInt(scoreMatch[1], 10);
    if (!isNaN(sc) && sc >= 0 && sc <= 100) {
      // Tìm từ mục tiêu nếu có
      const wordMatch = text.match(/từ\s+["“]?([A-Za-z'-]+)["”]?/i);
      const targetW = wordMatch ? wordMatch[1] : "";
      showLivePronunciationScore(sc, targetW, text.slice(0, 100), "text");
    }
  }

  // 2. Phân tích từ vựng mới được giới thiệu trong cuộc gọi
  // Mẫu: 'từ "resilient" nghĩa là...', '"resilient" có nghĩa là...'
  // Bắt buộc từ nằm trong dấu ngoặc kép hoặc in đậm để tránh bắt nhầm câu thường
  const vocabPattern = /["“*]([A-Za-z][A-Za-z'-]{2,24})["”*]\s*(?:có\s+)?(?:nghĩa\s+là|nghĩa|tức\s+là|là)\s*[:]?\s*([^.,!?\n]{2,60})/i;
  const vMatch = text.match(vocabPattern);
  if (vMatch) {
    const word = vMatch[1].toLowerCase().trim();
    const meaning = vMatch[2].trim();
    // Tránh các từ thông dụng tiếng Anh
    const ignoreList = ["the", "and", "that", "this", "what", "how", "why", "yes", "you", "are"];
    if (!ignoreList.includes(word) && (!currentLiveVocab || currentLiveVocab.word.toLowerCase() !== word)) {
      showLiveVocabCard({
        word: word,
        meaning: meaning,
        ipa: "",
        category: DEFAULT_TOPIC,
      });
    }
  }
}

// --- Xử lý khi người dùng nói để tự động thêm từ ---
function analyzeUserSpeechForAction(userText) {
  if (!userText || !currentLiveVocab || currentLiveVocab.saved) return;
  const lower = userText.toLowerCase().trim();

  if (/^(không|khong|ko|no|nope|thôi|thoi|đừng|dung|bỏ qua|bo qua)(?![\p{L}\p{N}])/iu.test(lower)) {
    hideLiveVocabCard();
    return;
  }

  // Kiểm tra ý định đồng ý lưu từ
  const acceptPatterns = /^(có|co|ừ|u|lưu đi|luu di|thêm đi|them di|lưu vào|them vao|yes|yeah|yep|ok|oke|okay|lưu|them|được|dong y|đồng ý|save|save it|add)\b/i;
  if (acceptPatterns.test(lower) || lower.includes("lưu từ") || lower.includes("thêm từ") || lower === "có" || lower === "yes" || lower === "lưu") {
    confirmAddLiveVocab();
  }
}

function openVoiceView() {
  voiceView.classList.add("open");
  voiceView.setAttribute("aria-hidden", "false");
  voiceView.dataset.muted = "false";
  setVoiceState("connecting");
  capUser.textContent = "";
  capAi.textContent = "";
  userSpokeThisTurn = false;
  currentLiveVocab = null;
  discoveredWordsInCall = [];
  aiTurnText = "";
  toolUsedThisTurn = false;
  updateVoiceDiscoveredWordsUI();
  hideLiveVocabCard();
  if (voiceScoreOverlay) voiceScoreOverlay.style.display = "none";
  if (!rafId) rafId = requestAnimationFrame(voiceLoop);
  btnEndCall.focus({ preventScroll: true });
}

function closeVoiceView() {
  voiceView.classList.remove("open");
  voiceView.setAttribute("aria-hidden", "true");
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  orbLevel = 0;
  orb.style.setProperty("--level", "0");
  stopCallTimer();
  hideLiveVocabCard();
  if (voiceScoreOverlay) voiceScoreOverlay.style.display = "none";
  if (voiceVocabPanel) voiceVocabPanel.classList.remove("open");
}

let lastCapRole = null;
let aiTurnText = ""; // lời AI trong lượt hiện tại
let toolUsedThisTurn = false; // AI đã dùng tool trong lượt này -> khỏi phân tích văn bản
function handleCaption(role, text) {
  if (role === "user") {
    if (lastCapRole !== "user") {
      capUser.textContent = "";
      capAi.textContent = "";
    }
    capUser.textContent += text;
    userSpokeThisTurn = true;
    lastUserActivity = performance.now();

    // Phân tích giọng người dùng xem có đang đồng ý lưu từ mới không
    analyzeUserSpeechForAction(capUser.textContent);
  } else if (role === "ai") {
    if (lastCapRole !== "ai") capAi.textContent = "";
    capAi.textContent += text;

    // Gom lời AI theo lượt: phân tích một lần khi AI nói xong (xem onTranscript "turn_complete")
    aiTurnText += text;
  }
  lastCapRole = role;
}

// ============================================
//  Cuộc gọi thoại trực tiếp (Gemini Live)
// ============================================
async function startLiveCall() {
  if (state.isLiveActive || state.liveClient) return;

  abortActivePractice();
  state.muted = false;
  syncMuteButton();
  lastCapRole = null;
  openVoiceView();

  let wasConnected = false;

  state.liveClient = new GeminiLiveClient({
    onStateChange: (status) => {
      if (status === "connecting") {
        setVoiceState("connecting");
      } else if (status === "connected") {
        wasConnected = true;
        state.isLiveActive = true;
        setVoiceState("listening");
        callStartTime = Date.now();
        startCallTimer();
      } else if (status === "disconnected") {
        if (wasConnected && state.isLiveActive) {
          showToast("Cuộc gọi đã kết thúc", "info");
        }
        cleanupCall();
      }
    },
    onSpeakingChange: (playing) => {
      if (!state.liveClient) return;
      if (playing) {
        setVoiceState("speaking");
        userSpokeThisTurn = false;
      } else if (voiceState === "speaking") {
        setVoiceState("listening");
      }
    },
    // Xử lý Tool Call từ Gemini Live API
    onToolCall: (name, args) => {
      toolUsedThisTurn = true;
      if (name === "propose_vocabulary") {
        showLiveVocabCard({
          word: args.word,
          ipa: args.ipa,
          meaning: args.meaning,
          example: args.example,
          category: args.category || DEFAULT_TOPIC,
        });
      } else if (name === "save_to_flashcard") {
        confirmAddLiveVocab(args, { notifyAi: false });
      } else if (name === "report_pronunciation_score") {
        showLivePronunciationScore(args.score, args.targetText, args.feedback);
      }
    },
    onTranscript: ({ role, text }) => {
      if (role === "turn_complete") {
        currentStreamElement = null;
        // Dự phòng khi AI nói mà quên gọi tool: đọc cả lượt rồi mới đoán điểm / từ mới
        if (!toolUsedThisTurn && aiTurnText) analyzeAiSpeechForVocabAndScore(aiTurnText);
        aiTurnText = "";
        toolUsedThisTurn = false;
        return;
      }
      if (role === "system") {
        currentStreamElement = null;
        addMessage(text, "system");
        return;
      }

      handleCaption(role, text);

      // Ghi vào lịch sử chat
      if (!currentStreamElement || currentStreamRole !== role) {
        currentStreamRole = role;
        currentStreamElement = addMessage(text, role);
      } else {
        const textEl = currentStreamElement.querySelector(".message-content div");
        if (textEl) {
          currentStreamElement._fullText = (currentStreamElement._fullText || "") + text;
          if (role === "ai") textEl.innerHTML = parseMarkdown(currentStreamElement._fullText);
          else textEl.textContent = currentStreamElement._fullText;
          scrollToBottom();
        }
      }
    },
    onNotice: (msg) => showToast(msg, "info"),
    onError: (err) => {
      console.error("Live Client Error:", err);
      showToast(err.message || "Lỗi cuộc gọi trực tiếp", "error");
    },
  });

  try {
    await state.liveClient.connect();
  } catch (err) {
    cleanupCall();
  }
}

function cleanupCall() {
  if (callStartTime) {
    const elapsedSeconds = Math.round((Date.now() - callStartTime) / 1000);
    if (elapsedSeconds > 5) {
      LearningStore.addSpeakingTime(elapsedSeconds);
      updateBadgeUI();
    }
    callStartTime = null;
  }
  stopCallTimer();
  stopLiveCamera();
  currentStreamElement = null;
  currentStreamRole = null;
  state.isLiveActive = false;
  state.liveClient = null;
  closeVoiceView();
}

function endLiveCall() {
  const client = state.liveClient;
  const wasActive = state.isLiveActive;
  state.isLiveActive = false;
  if (client) client.disconnect();
  cleanupCall();
  if (wasActive) showToast("Đã kết thúc cuộc gọi", "info");
}

function syncMuteButton() {
  btnLiveMute.setAttribute("aria-pressed", String(state.muted));
  btnLiveMute.title = state.muted ? "Bật mic" : "Tắt mic";
  btnLiveMute.setAttribute("aria-label", btnLiveMute.title);
  voiceView.dataset.muted = String(state.muted);
  renderStatus();
}

function toggleMute() {
  state.muted = !state.muted;
  if (state.liveClient) state.liveClient.setMuted(state.muted);
  syncMuteButton();
}

function toggleCaptions() {
  const on = voiceView.dataset.cc !== "off";
  voiceView.dataset.cc = on ? "off" : "on";
  btnLiveCc.setAttribute("aria-pressed", String(!on));
}

// ----- Camera trong cuộc gọi -----
async function openLiveStream() {
  if (pipStream) pipStream.getTracks().forEach((t) => t.stop());
  pipStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: state.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  pipVideo.srcObject = pipStream;
  liveCameraPip.classList.toggle("mirror", state.facingMode === "user");
}

async function startLiveCamera() {
  if (!state.isLiveActive || !state.liveClient) return;
  try {
    await openLiveStream();
    liveCameraPip.style.display = "block";
    voiceView.classList.add("has-camera");
    btnLiveFlip.hidden = false;
    btnLiveCam.setAttribute("aria-pressed", "true");
    btnLiveCam.title = "Tắt camera";
    btnLiveCam.setAttribute("aria-label", "Tắt camera");
    state.liveClient.startVideoStreaming(pipVideo, cameraCanvas, 1200);
  } catch (err) {
    console.error("Lỗi mở live camera:", err);
    showToast("Không thể truy cập camera", "error");
  }
}

async function flipLiveCamera() {
  if (!pipStream) return;
  state.facingMode = state.facingMode === "environment" ? "user" : "environment";
  try {
    await openLiveStream();
  } catch (err) {
    console.error("Lỗi đổi camera:", err);
    showToast("Không thể đổi camera", "error");
  }
}

function stopLiveCamera() {
  if (state.liveClient) state.liveClient.stopVideoStreaming();
  if (pipStream) {
    pipStream.getTracks().forEach((t) => t.stop());
    pipStream = null;
  }
  pipVideo.srcObject = null;
  liveCameraPip.style.display = "none";
  voiceView.classList.remove("has-camera");
  btnLiveFlip.hidden = true;
  btnLiveCam.setAttribute("aria-pressed", "false");
  btnLiveCam.title = "Bật camera";
  btnLiveCam.setAttribute("aria-label", "Bật camera");
}

function toggleLiveCamera() {
  if (pipStream) stopLiveCamera();
  else startLiveCamera();
}

// ============================================
//  Gửi tin nhắn văn bản / ảnh
// ============================================
async function sendMessage({ displayText, apiText } = {}) {
  const usingInput = displayText === undefined;
  const message = usingInput ? messageInput.value.trim() : displayText;
  const image = state.capturedImage;

  if (!message && !image) return;
  if (state.isLoading) return;

  const clearInput = () => {
    if (!usingInput) return;
    messageInput.value = "";
    messageInput.style.height = "auto";
  };

  if (state.isLiveActive && state.liveClient?.isConnected && !image) {
    addMessage(message, "user");
    state.liveClient.sendText(apiText ?? message);
    clearInput();
    updateSendButton();
    return;
  }

  if (usingInput && !image && handleAddWordCommand(message)) {
    clearInput();
    updateSendButton();
    return;
  }

  const note = usingInput && !image ? handlePendingVocabReply(message) : "";

  addMessage(message, "user", image);
  clearInput();
  removeImage();
  setLoading(true);

  try {
    const { text, truncated } = await state.chat.send({ text: (apiText ?? message) + note, image });
    const el = addAiReply(text);
    if (truncated) addTruncateNote(el);
  } catch (error) {
    handleChatError(error);
  } finally {
    setLoading(false);
  }
}

function handleChatError(error) {
  console.error("Chat error:", error);
  addMessage(error?.message || "Có lỗi xảy ra. Bạn thử gửi lại nhé.", "system");
  showToast(error?.code === "QUOTA" ? "Bạn gửi hơi nhanh, đợi chút nhé" : "Lỗi kết nối đến AI", "error");
}

function addTruncateNote(msgEl) {
  const note = document.createElement("div");
  note.className = "truncate-note";
  const label = document.createElement("span");
  label.textContent = "Câu trả lời dài nên bị cắt giữa chừng.";
  const btn = document.createElement("button");
  btn.className = "btn-continue";
  btn.textContent = "Tiếp tục";
  btn.onclick = () => {
    btn.disabled = true;
    note.remove();
    continueReply();
  };
  note.append(label, btn);
  msgEl.querySelector(".message-content").appendChild(note);
  scrollToBottom();
}

async function continueReply() {
  if (state.isLoading) return;
  setLoading(true);
  try {
    const { text, truncated } = await state.chat.send({
      text: "Hãy tiếp tục câu trả lời ở trên, bắt đầu từ chỗ bị cắt.",
    });
    const el = addAiReply(text);
    if (truncated) addTruncateNote(el);
  } catch (error) {
    handleChatError(error);
  } finally {
    setLoading(false);
  }
}

// ============================================
//  Cài đặt & Giao diện sáng/tối
// ============================================
function openSettings() {
  modalSettings.style.display = "flex";
}

function saveSettings() {
  modalSettings.style.display = "none";
}

function syncThemeButton(theme) {
  btnTheme.title = theme === "light" ? "Chuyển sang giao diện tối" : "Chuyển sang giao diện sáng";
  btnTheme.setAttribute("aria-label", btnTheme.title);
}

function newChat() {
  currentStreamElement = null;
  currentStreamRole = null;
  if (state.isLiveActive || state.liveClient) endLiveCall();
  state.chat.reset();
  state.pendingVocab = [];
  abortActivePractice();
  messagesDiv.innerHTML = "";
  if (welcomeDiv) welcomeDiv.style.display = "flex";
  removeImage();
  messageInput.value = "";
  autoResizeTextarea();
  updateSendButton();
}

// ============================================
//  Nhập bằng giọng nói (điền ô chữ)
// ============================================
function initSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    btnMic.style.display = "none";
    return;
  }

  const recognition = new SR();
  recognition.lang = "vi-VN";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    state.isRecording = true;
    btnMic.classList.add("recording");
  };

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    messageInput.value = transcript;
    updateSendButton();
    autoResizeTextarea();
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    if (event.error === "not-allowed") showToast("Vui lòng cho phép truy cập microphone", "warning");
    stopRecording();
  };

  recognition.onend = () => {
    stopRecording();
    if (messageInput.value.trim()) {
      setTimeout(() => {
        if (messageInput.value.trim() && !state.isLoading) sendMessage();
      }, 800);
    }
  };

  state.recognition = recognition;
}

function toggleRecording() {
  if (state.isRecording) {
    state.recognition?.stop();
    stopRecording();
  } else {
    try {
      state.recognition.lang = "vi-VN";
      state.recognition.start();
    } catch (e) {
      showToast("Không thể bắt đầu ghi âm", "error");
    }
  }
}

function stopRecording() {
  state.isRecording = false;
  btnMic.classList.remove("recording");
}

// ============================================
//  Camera chụp ảnh
// ============================================
async function openCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    state.cameraStream = stream;
    cameraVideo.srcObject = stream;
    cameraOverlay.style.display = "flex";
  } catch (error) {
    console.error("Camera error:", error);
    if (error.name === "NotAllowedError") showToast("Vui lòng cho phép truy cập camera", "warning");
    else showToast("Không thể mở camera", "error");
  }
}

function closeCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((t) => t.stop());
    state.cameraStream = null;
  }
  cameraVideo.srcObject = null;
  cameraOverlay.style.display = "none";
}

async function switchCamera() {
  state.facingMode = state.facingMode === "environment" ? "user" : "environment";
  closeCamera();
  await openCamera();
}

function capturePhoto() {
  const canvas = cameraCanvas;
  canvas.width = cameraVideo.videoWidth || 640;
  canvas.height = cameraVideo.videoHeight || 480;
  canvas.getContext("2d").drawImage(cameraVideo, 0, 0);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  state.capturedImage = dataUrl;
  previewImg.src = dataUrl;
  imagePreview.style.display = "inline-block";
  closeCamera();

  if (!messageInput.value.trim()) {
    messageInput.value = "Đồ vật này tiếng Anh gọi là gì?";
    autoResizeTextarea();
  }
  updateSendButton();
  messageInput.focus();
}

function removeImage() {
  state.capturedImage = null;
  previewImg.src = "";
  imagePreview.style.display = "none";
  updateSendButton();
}

function autoResizeTextarea() {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 140) + "px";
}

function updateSendButton() {
  const hasContent = !!messageInput.value.trim() || !!state.capturedImage;
  btnSend.hidden = !hasContent;
  btnVoice.hidden = hasContent;
  btnSend.disabled = state.isLoading;
}

// ============================================
//  EdTech Features & Gamification UI
// ============================================
function updateBadgeUI() {
  if (streakCountEl) streakCountEl.textContent = LearningStore.getCurrentStreak();
  if (notebookCountEl) notebookCountEl.textContent = LearningStore.getWords().length;

  // Cập nhật Cấp độ & XP
  const levelInfo = LearningStore.getLevel();
  const levelBadge = $("#level-badge");
  if (levelBadge) {
    levelBadge.textContent = `Lv.${levelInfo.level} ${LearningStore.getLevelTitle(levelInfo.level)}`;
  }

  const xpFill = $(".xp-bar-fill");
  const xpPoints = $(".xp-bar-points");
  const xpLevel = $(".xp-bar-level");
  if (xpFill) xpFill.style.width = `${Math.round(levelInfo.progress * 100)}%`;
  if (xpPoints) xpPoints.textContent = `${levelInfo.currentXP} / ${levelInfo.nextLevelXP} XP`;
  if (xpLevel) xpLevel.textContent = `Cấp ${levelInfo.level}`;

  // Quick stats trong Welcome
  const statStreak = $('[data-stat="streak"]');
  const statWords = $('[data-stat="words"]');
  const statMinutes = $('[data-stat="minutes"]');
  const stats = LearningStore.getStats();
  if (statStreak) statStreak.textContent = LearningStore.getCurrentStreak();
  if (statWords) statWords.textContent = LearningStore.getWords().length;
  if (statMinutes) statMinutes.textContent = Math.round((stats.speakingSeconds || 0) / 60);

  // Daily goal
  const daily = LearningStore.getDailyProgress();
  const goalFill = $(".daily-goal-fill");
  const goalText = $(".daily-goal-progress-text");
  if (goalFill) goalFill.style.width = `${Math.round(daily.progress * 100)}%`;
  if (goalText) goalText.textContent = `${daily.current} / ${daily.target} XP hôm nay`;
}

// ---------- Flashcard: danh sách + lọc chủ đề ----------
function topicChip(label, value, count, icon = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "topic-chip" + (state.topicFilter === value ? " active" : "");
  b.setAttribute("role", "tab");
  b.setAttribute("aria-selected", String(state.topicFilter === value));
  b.innerHTML = `${icon ? `<span>${icon}</span>` : ""}${escapeHtml(label)} <b>${count}</b>`;
  b.onclick = () => {
    state.topicFilter = value;
    renderWordList();
  };
  return b;
}

function renderWordList() {
  const all = LearningStore.getWords();
  const counts = LearningStore.getTopicCounts(all);
  if (state.topicFilter !== "all" && !counts[state.topicFilter]) state.topicFilter = "all";

  topicFilterEl.innerHTML = "";
  topicFilterEl.hidden = all.length === 0;
  topicFilterEl.appendChild(topicChip("Tất cả", "all", all.length));
  TOPICS.filter((t) => counts[t.id]).forEach((t) => topicFilterEl.appendChild(topicChip(t.id, t.id, counts[t.id], t.icon)));

  const words = state.topicFilter === "all" ? all : all.filter((w) => w.category === state.topicFilter);
  wordListContainer.innerHTML = "";

  if (all.length === 0) {
    wordListContainer.innerHTML = `
      <div style="text-align:center; padding: 32px 16px; color: var(--text-2);">
        <p style="font-size: 36px; margin-bottom: 8px;">📖</p>
        <p>Chưa có flashcard nào!</p>
        <p style="font-size: 13px; color: var(--text-3); margin-top: 4px;">
          Hãy trò chuyện hoặc gọi thoại với EngQuests. Khi EngQuests dạy từ mới, hãy đồng ý để từ tự động lưu vào đây nhé!
        </p>
      </div>
    `;
    return;
  }

  words.forEach((w) => {
    const card = document.createElement("div");
    card.className = "word-card";
    const topicOptions = TOPICS.map(
      (t) => `<option value="${escapeHtml(t.id)}"${t.id === w.category ? " selected" : ""}>${t.icon} ${escapeHtml(t.id)}</option>`
    ).join("");
    card.innerHTML = `
      <div class="word-card-left">
        <div class="word-card-title">
          <strong>${escapeHtml(w.word)}</strong>
          ${w.pos ? `<em class="wc-pos">${escapeHtml(w.pos)}</em>` : ""}
          <span>${escapeHtml(w.ipa || "")}</span>
        </div>
        <div class="word-card-meaning">${escapeHtml(w.meaning || "Từ vựng tiếng Anh")}</div>
        ${w.example ? `<div class="word-card-example">${escapeHtml(w.example)}</div>` : ""}
        <div class="wc-meta">
          <select class="wc-topic" aria-label="Chủ đề của ${escapeHtml(w.word)}">${topicOptions}</select>
          ${w.pronBest ? `<span class="wc-pron ${w.pronBest >= 75 ? "" : w.pronBest >= 55 ? "warn" : "bad"}">🎙️ ${w.pronBest}/100</span>` : ""}
        </div>
      </div>
      <div class="word-card-actions">
        <button class="btn-card-sound" title="Nghe phát âm">🔊</button>
        <button class="btn-card-practice" title="Luyện đọc và chấm điểm">🎙️</button>
        <button class="btn-card-delete" title="Xóa">✕</button>
      </div>
    `;

    card.querySelector(".wc-topic").onchange = (e) => {
      LearningStore.setWordCategory(w.id, e.target.value);
      renderWordList();
    };
    card.querySelector(".btn-card-sound").onclick = () => speak(w.word, { rate: 0.85 });
    card.querySelector(".btn-card-practice").onclick = () => practiceWordInChat(w);
    card.querySelector(".btn-card-delete").onclick = () => {
      LearningStore.deleteWord(w.id);
      renderWordList();
      updateBadgeUI();
    };

    wordListContainer.appendChild(card);
  });
}

function practiceWordInChat(w) {
  if (state.isLiveActive) {
    showToast("Hãy kết thúc cuộc gọi trước khi luyện phát âm", "warning");
    return;
  }
  closeAllModals();
  addPracticeMessage({ text: w.word, ipa: w.ipa, meaning: w.meaning }, `Luyện đọc từ **${w.word}** nhé!`);
}

// ---------- Flashcard: ôn theo bộ thẻ ----------
function deckWords() {
  const all = LearningStore.getWords();
  return state.deckTopic === "all" ? all : all.filter((w) => w.category === state.deckTopic);
}

function renderDeckSelect() {
  const all = LearningStore.getWords();
  const counts = LearningStore.getTopicCounts(all);
  if (state.deckTopic !== "all" && !counts[state.deckTopic]) state.deckTopic = "all";
  fcTopicSelect.innerHTML =
    `<option value="all">Tất cả chủ đề (${all.length})</option>` +
    TOPICS.filter((t) => counts[t.id])
      .map((t) => `<option value="${escapeHtml(t.id)}">${t.icon} ${escapeHtml(t.id)} (${counts[t.id]})</option>`)
      .join("");
  fcTopicSelect.value = state.deckTopic;
}

function renderFlashcard() {
  renderDeckSelect();
  const words = deckWords();
  if (words.length === 0) {
    fcWord.textContent = "Chưa có từ";
    fcIpa.textContent = "";
    fcMeaning.textContent = "Hãy học từ mới cùng EngQuests để có flashcard!";
    fcExample.textContent = "";
    fcCounter.textContent = "0 / 0";
    return;
  }

  if (currentFlashcardIndex >= words.length) currentFlashcardIndex = 0;
  if (currentFlashcardIndex < 0) currentFlashcardIndex = words.length - 1;

  const w = words[currentFlashcardIndex];
  fcWord.textContent = w.word;
  fcIpa.textContent = w.ipa || "";
  fcMeaning.textContent = w.meaning || "Từ vựng";
  fcExample.textContent = w.example || "";
  fcCounter.textContent = `${currentFlashcardIndex + 1} / ${words.length}`;
  activeFlashcard.classList.remove("flipped");
}

// ---------- Thống kê ----------
function renderStatsModal() {
  const stats = LearningStore.getStats();
  statStreakVal.textContent = LearningStore.getCurrentStreak();
  statTimeVal.textContent = Math.round((stats.speakingSeconds || 0) / 60);
  statWordsVal.textContent = LearningStore.getWords().length;
  statPronCountVal.textContent = stats.pronunciationCount || 0;
  statPronAvgVal.textContent = stats.pronunciationCount ? LearningStore.getPronunciationAverage() : "–";

  // Cập nhật các thanh bar trong modal thống kê
  const barStreak = $(".stat-bar-streak");
  const barTime = $(".stat-bar-time");
  const barWords = $(".stat-bar-words");
  const barPron = $(".stat-bar-pron");
  const barAvg = $(".stat-bar-avg");
  if (barStreak) barStreak.style.width = `${Math.min(100, LearningStore.getCurrentStreak() * 14)}%`;
  if (barTime) barTime.style.width = `${Math.min(100, Math.round((stats.speakingSeconds || 0) / 60) * 5)}%`;
  if (barWords) barWords.style.width = `${Math.min(100, LearningStore.getWords().length * 4)}%`;
  if (barPron) barPron.style.width = `${Math.min(100, (stats.pronunciationCount || 0) * 8)}%`;
  if (barAvg) barAvg.style.width = `${stats.pronunciationCount ? LearningStore.getPronunciationAverage() : 0}%`;
}

function renderStatsModalIfOpen() {
  if (modalStats.style.display === "flex") renderStatsModal();
}

function openGames() {
  if (state.isLiveActive) {
    showToast("Hãy kết thúc cuộc gọi trước khi chơi game", "warning");
    return;
  }
  abortActivePractice();
  if (!games) {
    games = createGames({
      body: $("#games-body"),
      speak,
      toast: showToast,
      celebrate: () => {
        triggerConfetti();
        playSuccessChime();
      },
      onXP: () => {
        updateBadgeUI();
        renderStatsModalIfOpen();
      },
    });
  }
  closeAllModals();
  games.showHub();
  modalGames.style.display = "flex";
}

function closeGames() {
  if (games) games.stop();
  modalGames.style.display = "none";
}

function closeAllModals() {
  if (modalGames && modalGames.style.display === "flex") closeGames();
  modalNotebook.style.display = "none";
  modalStats.style.display = "none";
  modalSettings.style.display = "none";
}

// ============================================
//  Khởi tạo sự kiện
// ============================================
function init() {
  Settings.initTheme(syncThemeButton);
  btnTheme.addEventListener("click", () => syncThemeButton(Settings.toggleTheme()));

  btnSettings.addEventListener("click", openSettings);
  btnCloseSettings.addEventListener("click", () => (modalSettings.style.display = "none"));
  btnSaveSettings.addEventListener("click", saveSettings);
  btnSend.addEventListener("click", () => sendMessage());
  btnVoice.addEventListener("click", startLiveCall);

  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  });
  messageInput.addEventListener("input", () => {
    autoResizeTextarea();
    updateSendButton();
  });

  btnMic.addEventListener("click", toggleRecording);
  btnCamera.addEventListener("click", openCamera);
  btnCloseCamera.addEventListener("click", closeCamera);
  btnSwitchCamera.addEventListener("click", switchCamera);
  btnCapture.addEventListener("click", capturePhoto);
  btnRemoveImage.addEventListener("click", removeImage);
  btnNewChat.addEventListener("click", newChat);

  // Điều khiển trong cuộc gọi thoại
  btnEndCall.addEventListener("click", endLiveCall);
  btnLiveMute.addEventListener("click", toggleMute);
  btnLiveCam.addEventListener("click", toggleLiveCamera);
  btnLiveCc.addEventListener("click", toggleCaptions);
  btnLiveFlip.addEventListener("click", flipLiveCamera);

  // Tương tác Floating Vocab Card trong Voice Call
  if (btnVvcSave) btnVvcSave.addEventListener("click", () => confirmAddLiveVocab());
  if (btnCloseVvc) btnCloseVvc.addEventListener("click", hideLiveVocabCard);
  if (btnVvcSpeak) {
    btnVvcSpeak.addEventListener("click", () => {
      if (currentLiveVocab && currentLiveVocab.word) speak(currentLiveVocab.word, { rate: 0.85 });
    });
  }

  // Toggle drawer danh sách từ trong cuộc gọi
  if (btnToggleVocabPanel) {
    btnToggleVocabPanel.addEventListener("click", () => {
      if (voiceVocabPanel) voiceVocabPanel.classList.toggle("open");
    });
  }
  if (btnCloseVocabPanel) {
    btnCloseVocabPanel.addEventListener("click", () => {
      if (voiceVocabPanel) voiceVocabPanel.classList.remove("open");
    });
  }

  // Gợi ý ở màn hình chào
  $$(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const action = chip.dataset.action;
      if (action === "live-call") return startLiveCall();
      if (action === "camera") return openCamera();
      if (action === "describe") {
        messageInput.value = "Tôi thấy một vật có hình tròn, màu đỏ, thường dùng để ăn. Tiếng Anh gọi là gì?";
        autoResizeTextarea();
        updateSendButton();
        messageInput.focus();
        return;
      }
      if (chip.dataset.prompt) {
        messageInput.value = chip.dataset.prompt;
        updateSendButton();
        sendMessage();
      }
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const modalOpen = [modalNotebook, modalStats, modalSettings, modalGames].some((m) => m.style.display === "flex");
    if (modalOpen) closeAllModals();
    else if (cameraOverlay.style.display !== "none") closeCamera();
    else if (voiceView.classList.contains("open")) endLiveCall();
  });

  window.addEventListener("pagehide", () => {
    if (state.liveClient) state.liveClient.disconnect();
  });

  // Lắng nghe sự kiện nhận XP
  window.addEventListener("voca-xp-gained", (e) => {
    updateBadgeUI();
  });

  // ---- EdTech Modals Event Listeners ----
  btnStreakBadge.addEventListener("click", () => {
    renderStatsModal();
    modalStats.style.display = "flex";
  });
  btnCloseStats.addEventListener("click", () => (modalStats.style.display = "none"));

  btnOpenPronunciation.addEventListener("click", startQuickPractice);
  chipPronunciation.addEventListener("click", startQuickPractice);

  btnOpenGames.addEventListener("click", openGames);
  if (chipGames) chipGames.addEventListener("click", openGames);
  btnCloseGames.addEventListener("click", closeGames);

  btnOpenNotebook.addEventListener("click", () => {
    renderWordList();
    modalNotebook.style.display = "flex";
  });
  if (chipNotebook) {
    chipNotebook.addEventListener("click", () => {
      renderWordList();
      modalNotebook.style.display = "flex";
    });
  }
  btnCloseNotebook.addEventListener("click", () => (modalNotebook.style.display = "none"));

  tabWordList.addEventListener("click", () => {
    tabWordList.classList.add("active");
    tabFlashcards.classList.remove("active");
    viewWordList.style.display = "block";
    viewFlashcards.style.display = "none";
    renderWordList();
  });

  tabFlashcards.addEventListener("click", () => {
    tabFlashcards.classList.add("active");
    tabWordList.classList.remove("active");
    viewWordList.style.display = "none";
    viewFlashcards.style.display = "block";
    renderFlashcard();
  });

  activeFlashcard.addEventListener("click", () => {
    activeFlashcard.classList.toggle("flipped");
  });

  btnFcSound.addEventListener("click", (e) => {
    e.stopPropagation();
    const w = deckWords()[currentFlashcardIndex];
    if (w) speak(w.word, { rate: 0.85 });
  });

  btnFcPractice.addEventListener("click", (e) => {
    e.stopPropagation();
    const w = deckWords()[currentFlashcardIndex];
    if (w) practiceWordInChat(w);
  });

  fcTopicSelect.addEventListener("change", () => {
    state.deckTopic = fcTopicSelect.value;
    currentFlashcardIndex = 0;
    renderFlashcard();
  });

  btnFcPrev.addEventListener("click", () => {
    currentFlashcardIndex--;
    renderFlashcard();
  });

  btnFcNext.addEventListener("click", () => {
    currentFlashcardIndex++;
    renderFlashcard();
  });

  [modalNotebook, modalStats, modalSettings, modalGames].forEach((m) => {
    m.addEventListener("click", (e) => {
      if (e.target === m) closeAllModals();
    });
  });

  window.addEventListener("pagehide", () => abortActivePractice());
  if ("speechSynthesis" in window) speechSynthesis.getVoices();

  // Khởi động UI ban đầu
  updateBadgeUI();
  voiceView.dataset.cc = "on";
  initSpeechRecognition();
  updateSendButton();
}

document.addEventListener("DOMContentLoaded", init);
