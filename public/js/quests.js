// ============================================================
// EngQuests - Camera học từ: 3 chế độ dùng ảnh chụp
//   1. Săn từ        : mỗi ngày 5 chữ cái, chụp vật có tên tiếng Anh bắt đầu bằng chữ đó để lấy XP
//   2. Khung cảnh    : chụp căn phòng, AI nêu 10 từ rồi hỏi lại người học
//   3. Menu & biển   : chụp thực đơn / biển chỉ dẫn, giải nghĩa và cho lưu từ
// Ảnh được thu nhỏ ngay trên máy trước khi gửi tới /api/vision; không lưu ảnh ở đâu cả.
// ============================================================

import { LearningStore } from "./store.js";
import { API_BASE } from "./config.js";
import { SpeechListener } from "./pronunciation.js";
import { speak } from "./practice.js";
import { getEnv, mediaErrorMessage, speechErrorMessage } from "./compat.js";
import { topicIcon } from "./features.js";

const KEY = "engquests_quests";
const XP_HUNT = 20;
const XP_HUNT_HINTED = 10;
const XP_HUNT_ALL = 50;
const XP_QUIZ_RIGHT = 5;
const XP_QUIZ_BONUS = 20;
const TARGETS_PER_DAY = 5;
const MAX_SIDE = 1024;
const REQUEST_TIMEOUT_MS = 30000;

const COMMON = "abcdefghilmnoprstw".split("");
const HARD = "jkquvxyz".split("");
const EXAMPLES = {
  a: ["apple", "alarm clock"], b: ["book", "bottle"], c: ["cup", "chair"], d: ["door", "desk"], e: ["eraser", "envelope"],
  f: ["fork", "fan"], g: ["glass", "guitar"], h: ["hat", "hanger"], i: ["iron", "ice cube"], j: ["jar", "jacket"],
  k: ["key", "kettle"], l: ["lamp", "laptop"], m: ["mug", "mirror"], n: ["notebook", "napkin"], o: ["orange", "oven"],
  p: ["pen", "pillow"], q: ["quilt", "quarter"], r: ["remote", "ruler"], s: ["spoon", "sofa"], t: ["table", "towel"],
  u: ["umbrella", "USB cable"], v: ["vase", "vest"], w: ["window", "wallet"], x: ["xylophone", "X-ray"], y: ["yogurt", "yo-yo"],
  z: ["zipper", "zucchini"],
};

// ---------- tiện ích nhỏ ----------
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid === undefined || kid === null || kid === false) continue;
    e.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
  }
  return e;
}

function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashStr = (s) => [...s].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7);

function shuffled(arr, rnd = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 5 chữ cái của một ngày: cố định theo ngày (mọi thiết bị giống nhau): 4 chữ dễ + 1 chữ lạ hơn */
export function dailyLetters(day) {
  const rnd = mulberry32(hashStr(`engquests-hunt-${day}`));
  const picks = shuffled(COMMON, rnd).slice(0, TARGETS_PER_DAY - 1);
  picks.push(shuffled(HARD, rnd)[0]);
  return shuffled(picks, rnd);
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

const normAnswer = (s) => String(s || "").toLowerCase().replace(/^(a|an|the)\s+/, "").replace(/[^a-z\s'-]/g, "").replace(/\s+/g, " ").trim();

/** "exact" | "close" | "wrong" */
export function checkAnswer(input, word) {
  const a = normAnswer(input);
  const w = normAnswer(word);
  if (!a) return "wrong";
  if (a === w || a === `${w}s` || a === `${w}es` || `${a}s` === w) return "exact";
  if (w.length >= 5 && levenshtein(a, w) <= 1) return "close";
  return "wrong";
}

// ---------- ảnh ----------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Không đọc được ảnh."));
    img.src = src;
  });
}

async function downscaleToJpeg(source, srcW, srcH) {
  const scale = Math.min(1, MAX_SIDE / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const hgt = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = hgt;
  canvas.getContext("2d").drawImage(source, 0, 0, w, hgt);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
  return { dataUrl, mimeType: "image/jpeg", data: dataUrl.split(",")[1] };
}

async function fileToImage(file) {
  if (window.createImageBitmap) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      const out = await downscaleToJpeg(bmp, bmp.width, bmp.height);
      bmp.close?.();
      return out;
    } catch {
      /* trình duyệt cũ: dùng thẻ img bên dưới */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return await downscaleToJpeg(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function callVision(mode, image, extra = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${API_BASE}/api/vision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, image: { mimeType: image.mimeType, data: image.data }, ...extra }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(e?.name === "AbortError" ? "AI phản hồi quá lâu. Bạn thử lại nhé." : "Không kết nối được tới máy chủ. Kiểm tra mạng của bạn.");
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* không phải JSON */
  }
  if (!res.ok) {
    if (res.status === 404) throw new Error("Không tìm thấy máy chủ EngQuests (/api/vision). Hãy chạy bằng `netlify dev` hoặc deploy lên Netlify.");
    if (res.status === 413) throw new Error("Ảnh quá lớn. Hãy thử chụp lại.");
    if (res.status === 429) throw new Error(data?.error?.message || "Bạn chụp hơi nhanh. Đợi một lát rồi thử lại nhé.");
    throw new Error(data?.error?.message || "Máy chủ AI đang gặp sự cố. Bạn thử lại sau nhé.");
  }
  return data;
}

// ---------- dữ liệu nhiệm vụ ----------
function loadState() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && typeof v === "object") return v;
  } catch {
    /* hỏng: tạo mới */
  }
  return {};
}

function saveState(st) {
  try {
    localStorage.setItem(KEY, JSON.stringify(st));
    window.dispatchEvent(new Event("voca-data-changed"));
  } catch {
    /* bỏ qua */
  }
}

function ensureHunt(st) {
  const today = localDateKey();
  if (!st.hunt || st.hunt.date !== today || !Array.isArray(st.hunt.targets) || !st.hunt.targets.length) {
    st.hunt = {
      date: today,
      targets: dailyLetters(today).map((letter) => ({ letter, done: false, word: "", hinted: false, rerolled: false })),
      rerolls: 0,
    };
  }
  return st.hunt;
}

function bumpTotal(st, key) {
  st.totals = { ...(st.totals || {}), [key]: ((st.totals || {})[key] || 0) + 1 };
}

// ---------- giao diện ----------
export function createQuests({ showToast = () => {}, celebrate = () => {}, onChange = () => {} } = {}) {
  const modal = document.querySelector("#modal-quests");
  const body = document.querySelector("#quests-body");
  const btnClose = document.querySelector("#btn-close-quests");
  const tabs = [...document.querySelectorAll("[data-qtab]")];

  let tab = "hunt";
  let busy = false;
  let st = loadState();
  // chế độ khung cảnh
  let scene = null; // {name, words}
  let quiz = null; // {queue, index, right, answered, feedback}
  // chế độ menu
  let menu = null; // {kind, summary, items}
  let hunting = null; // chỉ số mục tiêu đang chụp
  let huntMsg = null; // {type, text, objects}
  let webcam = null; // {stream, overlay}

  const fileInput = h("input", { type: "file", accept: "image/*", capture: "environment", hidden: true, id: "quests-file" });
  document.body.appendChild(fileInput);

  // ----- chọn ảnh -----
  function chooseImage(onImage) {
    fileInput.value = "";
    fileInput.onchange = async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        onImage(await fileToImage(file));
      } catch (e) {
        showToast(e.message || "Không đọc được ảnh", "error");
      }
    };
    fileInput.click();
  }

  async function openWebcam(onImage) {
    if (webcam) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } });
      const video = h("video", { autoplay: true, playsinline: true, muted: true, class: "q-webcam-video" });
      video.srcObject = stream;
      const stop = () => {
        stream.getTracks().forEach((t) => t.stop());
        webcam?.overlay.remove();
        webcam = null;
      };
      const shot = h("button", { class: "btn-primary", type: "button", text: "Chụp", onclick: async () => {
        if (!video.videoWidth) return;
        const img = await downscaleToJpeg(video, video.videoWidth, video.videoHeight);
        stop();
        onImage(img);
      } });
      const cancel = h("button", { class: "btn-secondary", type: "button", text: "Đóng", onclick: stop });
      const overlay = h("div", { class: "q-webcam" }, video, h("div", { class: "q-webcam-actions" }, cancel, shot));
      modal.querySelector(".modal-card").appendChild(overlay);
      webcam = { stream, overlay };
    } catch (err) {
      showToast(mediaErrorMessage(err, "camera"), "error");
    }
  }

  function captureButtons(onImage, { label = "Chụp ảnh", disabled = false } = {}) {
    const env = getEnv();
    const row = h("div", { class: "q-capture" });
    row.appendChild(h("button", { class: "btn-primary q-btn", type: "button", disabled, onclick: () => chooseImage(onImage) }, "📷 " + label));
    if (!env.isMobile && env.hasGetUserMedia) {
      row.appendChild(h("button", { class: "btn-secondary q-btn", type: "button", disabled, onclick: () => openWebcam(onImage) }, "🖥️ Dùng webcam"));
    }
    return row;
  }

  // ----- lưu từ -----
  function saveWord(w) {
    const entry = LearningStore.saveWord({
      word: w.word, ipa: w.ipa, pos: w.pos, meaning: w.meaning, example: w.example, category: w.topic,
    });
    onChange();
    return entry;
  }

  function saveButton(w) {
    const btn = h("button", { class: "q-icon-btn", type: "button", title: "Lưu vào sổ từ", "aria-label": `Lưu từ ${w.word}` });
    const set = (saved) => {
      btn.textContent = saved ? "✓" : "＋";
      btn.classList.toggle("saved", saved);
      btn.disabled = saved;
    };
    set(LearningStore.hasWord(w.word));
    btn.addEventListener("click", () => {
      saveWord(w);
      set(true);
      showToast(`Đã lưu "${w.word}" vào sổ từ`, "success");
    });
    return btn;
  }

  function wordRow(w, { sub = "" } = {}) {
    return h("div", { class: "q-word" },
      h("div", { class: "q-word-main" },
        h("strong", { text: w.word }),
        w.ipa ? h("span", { class: "q-ipa", text: w.ipa }) : null,
        h("div", { class: "q-meaning", text: `${topicIcon(w.topic)} ${w.meaning}` }),
        sub ? h("div", { class: "q-sub", text: sub }) : null,
        w.example ? h("div", { class: "q-example", text: `“${w.example}”` }) : null,
      ),
      h("button", { class: "q-icon-btn", type: "button", title: "Nghe phát âm", "aria-label": `Nghe ${w.word}`, onclick: () => speak(w.word, { rate: 0.85 }) }, "🔊"),
      saveButton(w),
    );
  }

  const loadingBox = (text) => h("div", { class: "q-loading", role: "status" }, h("div", { class: "q-spinner" }), h("span", { text }));

  // ===== Chế độ 1: Săn từ =====
  async function onHuntPhoto(index, image) {
    if (busy) return;
    busy = true;
    hunting = index;
    huntMsg = null;
    render();
    const hunt = ensureHunt(st);
    const target = hunt.targets[index];
    try {
      const res = await callVision("hunt", image, { letter: target.letter });
      if (res.correct && res.match) {
        const xp = target.hinted ? XP_HUNT_HINTED : XP_HUNT;
        target.done = true;
        target.word = res.match.word;
        bumpTotal(st, "huntsFound");
        saveState(st);
        LearningStore.addXP(xp, `Săn từ ${target.letter.toUpperCase()}: ${res.match.word}`);
        LearningStore.updateStreak();
        const allDone = hunt.targets.every((t) => t.done);
        if (allDone) LearningStore.addXP(XP_HUNT_ALL, "Hoàn thành săn từ hôm nay");
        celebrate();
        huntMsg = { type: "ok", text: `Chính xác! “${res.match.word}” bắt đầu bằng chữ ${target.letter.toUpperCase()}. +${xp} XP${allDone ? ` và thưởng ${XP_HUNT_ALL} XP vì xong cả ${TARGETS_PER_DAY} chữ hôm nay!` : ""}`, found: res.match };
        speak(res.match.word, { rate: 0.85 });
      } else {
        huntMsg = {
          type: "miss",
          text: res.objects?.length
            ? `Chưa có vật nào bắt đầu bằng chữ ${target.letter.toUpperCase()}. Mình thấy trong ảnh:`
            : "Mình chưa nhận ra vật nào rõ trong ảnh. Hãy chụp gần hơn, đủ sáng, chỉ một vật nhé.",
          objects: res.objects || [],
        };
      }
    } catch (e) {
      huntMsg = { type: "err", text: e.message };
    } finally {
      busy = false;
      onChange();
      render();
    }
  }

  function renderHunt() {
    const hunt = ensureHunt(st);
    const done = hunt.targets.filter((t) => t.done).length;
    const root = h("div", { class: "q-pane" });
    root.appendChild(h("div", { class: "q-intro" },
      h("strong", { text: `Săn từ hôm nay: ${done}/${hunt.targets.length}` }),
      h("p", { text: `Tìm đồ vật trong nhà có tên tiếng Anh bắt đầu bằng chữ cái được giao rồi chụp ảnh. Đúng thì nhận ${XP_HUNT} XP (dùng gợi ý còn ${XP_HUNT_HINTED} XP), xong cả ${hunt.targets.length} chữ thưởng thêm ${XP_HUNT_ALL} XP. Ngày mai có chữ mới.` }),
    ));

    hunt.targets.forEach((t, i) => {
      const card = h("div", { class: `q-target${t.done ? " done" : ""}${hunting === i ? " active" : ""}` });
      card.appendChild(h("div", { class: "q-letter", "aria-hidden": "true", text: t.letter.toUpperCase() }));
      const info = h("div", { class: "q-target-info" });
      if (t.done) {
        info.appendChild(h("strong", { text: `✓ ${t.word}` }));
        info.appendChild(h("span", { class: "q-sub", text: `Chữ ${t.letter.toUpperCase()} đã xong` }));
      } else {
        info.appendChild(h("strong", { text: `Hãy tìm vật có thể bắt đầu bằng chữ ${t.letter.toUpperCase()}` }));
        if (t.hinted) {
          const ex = EXAMPLES[t.letter] || [];
          info.appendChild(h("span", { class: "q-sub", text: `Gợi ý: ${ex.join(", ")}` }));
        }
        const row = h("div", { class: "q-target-actions" });
        row.appendChild(h("button", { class: "btn-primary q-btn q-btn-sm", type: "button", disabled: busy, onclick: () => chooseImage((img) => onHuntPhoto(i, img)) }, "📷 Chụp"));
        if (!getEnv().isMobile && getEnv().hasGetUserMedia) {
          row.appendChild(h("button", { class: "btn-secondary q-btn q-btn-sm", type: "button", disabled: busy, onclick: () => openWebcam((img) => onHuntPhoto(i, img)) }, "🖥️"));
        }
        if (!t.hinted) {
          row.appendChild(h("button", { class: "btn-secondary q-btn q-btn-sm", type: "button", disabled: busy, onclick: () => { t.hinted = true; saveState(st); render(); } }, "💡 Gợi ý"));
        }
        if (!t.rerolled) {
          row.appendChild(h("button", { class: "btn-secondary q-btn q-btn-sm", type: "button", disabled: busy, title: "Đổi sang chữ khác (1 lần)", onclick: () => {
            const used = new Set(hunt.targets.map((x) => x.letter));
            const pool = COMMON.filter((c) => !used.has(c));
            t.letter = pool[Math.floor(Math.random() * pool.length)] || t.letter;
            t.rerolled = true;
            t.hinted = false;
            hunt.rerolls = (hunt.rerolls || 0) + 1;
            saveState(st);
            huntMsg = null;
            render();
          } }, "🔄 Đổi chữ"));
        }
        info.appendChild(row);
      }
      card.appendChild(info);
      root.appendChild(card);
      if (hunting === i && busy) root.appendChild(loadingBox("AI đang xem ảnh của bạn…"));
      if (hunting === i && !busy && huntMsg) root.appendChild(renderHuntMessage());
    });
    return root;
  }

  function renderHuntMessage() {
    const m = huntMsg;
    const box = h("div", { class: `q-result ${m.type}` }, h("p", { text: m.text }));
    if (m.type === "ok" && m.found) box.appendChild(wordRow(m.found));
    if (m.type === "miss" && m.objects?.length) m.objects.forEach((o) => box.appendChild(wordRow(o)));
    return box;
  }

  // ===== Chế độ 2: Khung cảnh =====
  async function onScenePhoto(image) {
    if (busy) return;
    busy = true;
    scene = null;
    quiz = null;
    render();
    try {
      const res = await callVision("scene", image);
      scene = { name: res.scene, words: res.words, preview: image.dataUrl };
      bumpTotal(st, "scenes");
      saveState(st);
      LearningStore.addXP(10, "Quét khung cảnh");
      LearningStore.updateStreak();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      busy = false;
      onChange();
      render();
    }
  }

  function startQuiz() {
    quiz = { queue: shuffled(scene.words), index: 0, right: 0, state: "ask", feedback: "", last: null };
    render();
  }

  function answerQuiz(text, { skipped = false } = {}) {
    const q = quiz.queue[quiz.index];
    const res = skipped ? "wrong" : checkAnswer(text, q.word);
    if (res !== "wrong") {
      quiz.right++;
      LearningStore.addXP(XP_QUIZ_RIGHT, `Quét cảnh: ${q.word}`);
      celebrate(false);
    }
    quiz.state = "feedback";
    quiz.last = { res, word: q };
    render();
  }

  function nextQuiz() {
    quiz.index++;
    if (quiz.index >= quiz.queue.length) {
      quiz.state = "done";
      if (quiz.right >= Math.ceil(quiz.queue.length * 0.8)) {
        LearningStore.addXP(XP_QUIZ_BONUS, "Quét cảnh: điểm cao");
        celebrate();
      }
      onChange();
    } else {
      quiz.state = "ask";
    }
    render();
  }

  function renderScene() {
    const root = h("div", { class: "q-pane" });

    if (busy && !scene) {
      root.appendChild(loadingBox("AI đang tìm 10 từ trong ảnh…"));
      return root;
    }

    if (!scene) {
      root.appendChild(h("div", { class: "q-intro" },
        h("strong", { text: "Quét khung cảnh" }),
        h("p", { text: "Chụp rộng một căn phòng hoặc góc nhà. AI sẽ chọn 10 đồ vật trong ảnh, sau đó hỏi lại bạn để nhớ từ. Mỗi câu đúng +" + XP_QUIZ_RIGHT + " XP." }),
      ));
      root.appendChild(captureButtons(onScenePhoto, { label: "Chụp khung cảnh" }));
      return root;
    }

    if (quiz && quiz.state !== "list") return renderQuiz(root);

    root.appendChild(h("div", { class: "q-intro" },
      scene.preview ? h("img", { class: "q-preview", src: scene.preview, alt: "Ảnh khung cảnh" }) : null,
      h("strong", { text: scene.name ? `${scene.name}: ${scene.words.length} từ` : `${scene.words.length} từ trong ảnh` }),
    ));
    scene.words.forEach((w) => root.appendChild(wordRow(w)));
    const actions = h("div", { class: "q-capture" },
      h("button", { class: "btn-primary q-btn", type: "button", onclick: startQuiz }, "🧠 Kiểm tra mình"),
      h("button", { class: "btn-secondary q-btn", type: "button", onclick: saveAllScene }, "＋ Lưu tất cả"),
    );
    root.appendChild(actions);
    root.appendChild(captureButtons(onScenePhoto, { label: "Chụp cảnh khác" }));
    return root;
  }

  function saveAllScene() {
    const fresh = scene.words.filter((w) => !LearningStore.hasWord(w.word));
    fresh.forEach(saveWord);
    showToast(fresh.length ? `Đã lưu ${fresh.length} từ mới vào sổ từ` : "Tất cả từ đã có trong sổ từ", fresh.length ? "success" : "info");
    render();
  }

  function renderQuiz(root) {
    const total = quiz.queue.length;

    if (quiz.state === "done") {
      root.appendChild(h("div", { class: "q-result ok" },
        h("strong", { class: "q-score", text: `${quiz.right}/${total} câu đúng` }),
        h("p", { text: quiz.right >= Math.ceil(total * 0.8) ? `Xuất sắc! Thưởng thêm ${XP_QUIZ_BONUS} XP.` : "Cố lên, luyện thêm vài lần là nhớ ngay!" }),
      ));
      root.appendChild(h("div", { class: "q-capture" },
        h("button", { class: "btn-primary q-btn", type: "button", onclick: saveAllScene }, "＋ Lưu các từ chưa có"),
        h("button", { class: "btn-secondary q-btn", type: "button", onclick: startQuiz }, "Chơi lại"),
        h("button", { class: "btn-secondary q-btn", type: "button", onclick: () => { quiz = null; render(); } }, "Xem danh sách"),
      ));
      return root;
    }

    const q = quiz.queue[quiz.index];
    root.appendChild(h("div", { class: "q-progress" }, h("span", { text: `Câu ${quiz.index + 1}/${total}` }), h("span", { text: `Đúng: ${quiz.right}` })));
    root.appendChild(h("div", { class: "q-quiz" },
      h("p", { class: "q-question", text: `Vật nào trong ảnh có nghĩa là “${q.meaning}”?` }),
      h("p", { class: "q-sub", text: `Gợi ý: bắt đầu bằng chữ “${q.word[0].toUpperCase()}”, ${q.word.length} chữ cái` }),
    ));

    if (quiz.state === "feedback") {
      const { res, word } = quiz.last;
      const text = res === "exact" ? "Chính xác!" : res === "close" ? `Gần đúng, viết đúng là “${word.word}”.` : `Đáp án là “${word.word}”.`;
      root.appendChild(h("div", { class: `q-result ${res === "wrong" ? "miss" : "ok"}` }, h("p", { text }), wordRow(word)));
      root.appendChild(h("div", { class: "q-capture" }, h("button", { class: "btn-primary q-btn", type: "button", onclick: nextQuiz }, quiz.index + 1 >= total ? "Xem kết quả" : "Câu tiếp theo")));
      return root;
    }

    const input = h("input", { type: "text", class: "q-input", placeholder: "Gõ tên tiếng Anh…", autocapitalize: "none", autocomplete: "off", autocorrect: "off", spellcheck: "false", "aria-label": "Đáp án tiếng Anh" });
    const submit = () => answerQuiz(input.value);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        submit();
      }
    });
    const row = h("div", { class: "q-answer-row" }, input, h("button", { class: "btn-primary q-btn", type: "button", onclick: submit }, "Trả lời"));
    root.appendChild(row);

    const extra = h("div", { class: "q-capture" });
    if (SpeechListener.supported) {
      const mic = h("button", { class: "btn-secondary q-btn", type: "button" }, "🎙️ Nói đáp án");
      mic.addEventListener("click", async () => {
        mic.disabled = true;
        mic.textContent = "Đang nghe…";
        try {
          const alts = await new SpeechListener("en-US").listen({ onInterim: (t) => (input.value = t) });
          const best = alts.map((a) => a.text).find((t) => checkAnswer(t, q.word) !== "wrong") || alts[0].text;
          input.value = best;
          answerQuiz(best);
        } catch (err) {
          const msg = speechErrorMessage(err.code);
          if (msg) showToast(msg, "warning");
          mic.disabled = false;
          mic.textContent = "🎙️ Nói đáp án";
        }
      });
      extra.appendChild(mic);
    }
    extra.appendChild(h("button", { class: "btn-secondary q-btn", type: "button", onclick: () => answerQuiz("", { skipped: true }) }, "Bỏ qua"));
    root.appendChild(extra);
    setTimeout(() => input.focus({ preventScroll: true }), 30);
    return root;
  }

  // ===== Chế độ 3: Menu & biển hiệu =====
  async function onMenuPhoto(image) {
    if (busy) return;
    busy = true;
    menu = null;
    render();
    try {
      const res = await callVision("menu", image);
      menu = { kind: res.kind, summary: res.summary, items: res.items, preview: image.dataUrl };
      bumpTotal(st, "menus");
      saveState(st);
      LearningStore.addXP(10, "Dịch menu / biển hiệu");
      LearningStore.updateStreak();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      busy = false;
      onChange();
      render();
    }
  }

  function renderMenu() {
    const root = h("div", { class: "q-pane" });
    if (busy && !menu) {
      root.appendChild(loadingBox("AI đang đọc chữ trong ảnh…"));
      return root;
    }
    if (!menu) {
      root.appendChild(h("div", { class: "q-intro" },
        h("strong", { text: "Dịch thực đơn & biển hiệu" }),
        h("p", { text: "Chụp thực đơn nhà hàng, bảng chỉ dẫn hoặc biển cảnh báo. AI giải nghĩa từng mục để bạn học và lưu từ. Chụp gần, đủ sáng và thẳng chữ sẽ đọc chính xác hơn." }),
      ));
      root.appendChild(captureButtons(onMenuPhoto, { label: "Chụp menu / biển hiệu" }));
      return root;
    }
    const kindText = { menu: "Thực đơn", sign: "Biển hiệu / chỉ dẫn", other: "Văn bản" }[menu.kind] || "Văn bản";
    root.appendChild(h("div", { class: "q-intro" },
      menu.preview ? h("img", { class: "q-preview", src: menu.preview, alt: "Ảnh đã chụp" }) : null,
      h("strong", { text: `${kindText}: ${menu.items.length} mục` }),
      menu.summary ? h("p", { text: menu.summary }) : null,
    ));
    menu.items.forEach((w) => root.appendChild(wordRow(w, { sub: [w.original ? `Chữ gốc: ${w.original}` : "", w.note].filter(Boolean).join(" · ") })));
    root.appendChild(h("div", { class: "q-capture" },
      h("button", { class: "btn-primary q-btn", type: "button", onclick: () => {
        const fresh = menu.items.filter((w) => !LearningStore.hasWord(w.word));
        fresh.forEach(saveWord);
        showToast(fresh.length ? `Đã lưu ${fresh.length} từ mới vào sổ từ` : "Tất cả đã có trong sổ từ", fresh.length ? "success" : "info");
        render();
      } }, "＋ Lưu tất cả"),
    ));
    root.appendChild(captureButtons(onMenuPhoto, { label: "Chụp ảnh khác" }));
    return root;
  }

  // ----- vẽ -----
  function render() {
    if (!body) return;
    tabs.forEach((b) => {
      const on = b.dataset.qtab === tab;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
    });
    body.replaceChildren(tab === "hunt" ? renderHunt() : tab === "scene" ? renderScene() : renderMenu());
  }

  function open(which) {
    st = loadState();
    ensureHunt(st);
    saveState(st);
    if (which) tab = which;
    huntMsg = null;
    hunting = null;
    render();
    modal.style.display = "flex";
  }

  function close() {
    webcam?.stream.getTracks().forEach((t) => t.stop());
    webcam?.overlay.remove();
    webcam = null;
    modal.style.display = "none";
  }

  function init() {
    btnClose?.addEventListener("click", close);
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
    tabs.forEach((b) =>
      b.addEventListener("click", () => {
        tab = b.dataset.qtab;
        render();
      })
    );
  }

  /** Gọi khi dữ liệu vừa được đồng bộ từ tài khoản */
  function refresh() {
    st = loadState();
    if (modal && modal.style.display === "flex" && !busy) render();
  }

  return { init, open, close, refresh, isOpen: () => modal?.style.display === "flex" };
}
