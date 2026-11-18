// ============================================================
// EngQuests - Chấm điểm & nhận xét phát âm
//
// Cách hoạt động (chạy hoàn toàn trên trình duyệt, không cần backend):
//  1. Web Speech API (SpeechRecognition, en-US) nhận dạng giọng nói người dùng.
//  2. So khớp từng từ giữa câu mẫu và câu nghe được (căn chỉnh bằng quy hoạch
//     động, tính độ tương đồng ký tự) -> điểm từng từ + điểm tổng.
//  3. Sinh nhận xét tiếng Việt: từ nào đúng, từ nào bị nuốt âm đuôi (-s, -ed, ...),
//     từ nào bị nghe thành từ khác.
//
// Lưu ý: đây là chấm điểm dựa trên "máy nghe có hiểu bạn không", không phải
// phân tích âm vị. Nếu máy nhận dạng đúng từ thì phát âm đủ rõ để người khác hiểu.
// ============================================================

// ---------- Chuẩn hoá văn bản ----------
const CONTRACTIONS = {
  "i'm": "i am", "you're": "you are", "we're": "we are", "they're": "they are",
  "it's": "it is", "that's": "that is", "there's": "there is", "he's": "he is", "she's": "she is",
  "i'll": "i will", "you'll": "you will", "we'll": "we will", "i've": "i have", "you've": "you have",
  "don't": "do not", "doesn't": "does not", "didn't": "did not", "can't": "cannot",
  "won't": "will not", "isn't": "is not", "aren't": "are not", "wasn't": "was not",
  "couldn't": "could not", "wouldn't": "would not", "shouldn't": "should not", "let's": "let us",
};
const DIGIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

export function tokenize(text) {
  const base = String(text || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const out = [];
  for (let w of base) {
    w = w.replace(/^'+|'+$/g, "");
    if (!w) continue;
    if (CONTRACTIONS[w]) out.push(...CONTRACTIONS[w].split(" "));
    else if (/^\d+$/.test(w) && Number(w) <= 10) out.push(DIGIT_WORDS[Number(w)]);
    else out.push(w);
  }
  return out;
}

// ---------- Độ tương đồng ----------
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function similarity(a, b) {
  if (a === b) return 1;
  const len = Math.max(a.length, b.length);
  return len ? 1 - levenshtein(a, b) / len : 1;
}

// ---------- Căn chỉnh từ mẫu với từ nghe được ----------
const GAP_TARGET = 1; // bỏ sót một từ mẫu
const GAP_HEARD = 0.6; // thừa một từ

function align(target, heard) {
  const n = target.length, m = heard.length;
  const cost = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const back = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));
  for (let i = 1; i <= n; i++) { cost[i][0] = i * GAP_TARGET; back[i][0] = "T"; }
  for (let j = 1; j <= m; j++) { cost[0][j] = j * GAP_HEARD; back[0][j] = "H"; }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = cost[i - 1][j - 1] + (1 - similarity(target[i - 1], heard[j - 1]));
      const del = cost[i - 1][j] + GAP_TARGET;
      const ins = cost[i][j - 1] + GAP_HEARD;
      if (sub <= del && sub <= ins) { cost[i][j] = sub; back[i][j] = "M"; }
      else if (del <= ins) { cost[i][j] = del; back[i][j] = "T"; }
      else { cost[i][j] = ins; back[i][j] = "H"; }
    }
  }

  const pairs = []; // {t: index|null, h: index|null}
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const step = back[i][j];
    if (step === "M") { pairs.push({ t: i - 1, h: j - 1 }); i--; j--; }
    else if (step === "T") { pairs.push({ t: i - 1, h: null }); i--; }
    else { pairs.push({ t: null, h: j - 1 }); j--; }
  }
  return pairs.reverse();
}

// ---------- Chấm điểm ----------
// status: correct | close | wrong | missing
function scoreOne(targetText, heardText, confidence) {
  const target = tokenize(targetText);
  const heard = tokenize(heardText);

  const words = target.map((w) => ({ word: w, status: "missing", heard: "", score: 0 }));
  const extra = [];

  for (const p of align(target, heard)) {
    if (p.t === null) { extra.push(heard[p.h]); continue; }
    if (p.h === null) continue;
    const sim = similarity(target[p.t], heard[p.h]);
    const entry = words[p.t];
    entry.heard = heard[p.h];
    if (sim >= 0.999) { entry.status = "correct"; entry.score = 100; }
    else if (sim >= 0.6) { entry.status = "close"; entry.score = Math.round(40 + sim * 55); }
    else { entry.status = "wrong"; entry.score = Math.round(sim * 40); }
  }

  const textScore = words.length ? words.reduce((s, w) => s + w.score, 0) / words.length : 0;
  const extraPenalty = Math.min(0.15, extra.length * 0.04);
  const conf = typeof confidence === "number" && confidence > 0 ? Math.min(1, confidence) : 1;
  // Mỗi từ chưa đúng bị trừ thêm 4 điểm để một câu "gần đúng" không đạt điểm tuyệt đối
  const flawed = words.filter((w) => w.status !== "correct").length;
  const total = Math.round(textScore * (1 - extraPenalty) * (0.9 + 0.1 * conf)) - flawed * 4;

  return { score: Math.max(0, Math.min(100, total)), words, extra, heardText: heard.join(" ") };
}

/**
 * @param {string} targetText  câu/từ mẫu
 * @param {{text:string, confidence:number}[]} alternatives  các kết quả nhận dạng
 * @returns kết quả của phương án tốt nhất
 */
export function scorePronunciation(targetText, alternatives) {
  const list = (alternatives || []).filter((a) => a && a.text && a.text.trim());
  if (!list.length) {
    return { score: 0, words: tokenize(targetText).map((w) => ({ word: w, status: "missing", heard: "", score: 0 })), extra: [], heardText: "" };
  }
  let best = null;
  for (const alt of list) {
    const r = scoreOne(targetText, alt.text, alt.confidence);
    if (!best || r.score > best.score) best = r;
  }
  return best;
}

// ---------- Nhận xét tiếng Việt ----------
function wordTip(w) {
  const t = w.word, h = w.heard;
  if (w.status === "missing") return `Bạn bỏ sót từ "${t}". Hãy đọc đủ từng từ trong câu.`;
  if (!h) return null;

  if (/(es|s)$/.test(t) && !/(es|s)$/.test(h) && similarity(t.replace(/(es|s)$/, ""), h) > 0.8)
    return `"${t}": thiếu âm đuôi /s/ hoặc /z/. Hãy bật hơi ở cuối từ.`;
  if (/ed$/.test(t) && !/ed$/.test(h) && similarity(t.replace(/ed$/, ""), h) > 0.7)
    return `"${t}": thiếu âm đuôi -ed (/t/, /d/ hoặc /ɪd/).`;
  if (/ing$/.test(t) && !/ing$/.test(h))
    return `"${t}": âm đuôi -ing cần có /ŋ/ ở cuối, đừng đọc thành "-in".`;
  if (t.length > 3 && h === t.slice(0, -1))
    return `"${t}": bạn đang nuốt phụ âm cuối "${t.slice(-1)}". Hãy phát âm rõ âm cuối.`;
  if (/th/.test(t) && !/th/.test(h))
    return `"${t}": âm "th" cần đặt đầu lưỡi giữa hai hàm răng (/θ/ hoặc /ð/), không đọc thành "t", "d", "s" hay "z".`;
  return `"${t}": máy nghe thành "${h}". Nghe lại mẫu và đọc chậm từng âm tiết.`;
}

export function buildFeedback(result, { isWord = false } = {}) {
  const { score, words, extra } = result;
  let title, desc;

  if (!result.heardText) {
    return {
      title: "Chưa nghe thấy giọng bạn 🎧",
      desc: "Hãy kiểm tra micro, nói to và rõ hơn rồi thử lại.",
      tips: [],
    };
  }

  const flawless = words.every((w) => w.status === "correct") && !extra.length;
  if (score >= 90 && flawless) { title = "Phát âm xuất sắc! 🎉"; desc = isWord ? "Từ này bạn đọc rất rõ ràng." : "Bạn đọc rõ ràng, đủ từ và tự nhiên."; }
  else if (score >= 75) { title = "Phát âm rất tốt! 👍"; desc = "Gần như hoàn hảo, chỉ còn vài chi tiết nhỏ cần chú ý."; }
  else if (score >= 55) { title = "Khá ổn, cố thêm chút nữa 💪"; desc = "Người nghe hiểu được phần lớn, nhưng một số từ còn chưa rõ."; }
  else { title = "Cần luyện thêm nhé 🌱"; desc = "Hãy nghe mẫu vài lần, đọc chậm rồi thử lại."; }

  const tips = [];
  for (const w of words) {
    if (w.status === "correct") continue;
    const tip = wordTip(w);
    if (tip) tips.push(tip);
    if (tips.length >= 4) break;
  }
  if (extra.length && tips.length < 5) tips.push(`Máy còn nghe thêm: "${extra.join(" ")}". Hãy đọc đúng theo câu mẫu, không thêm từ.`);

  return { title, desc, tips };
}

export function scoreClass(score) {
  return score >= 75 ? "" : score >= 55 ? "warn" : "bad";
}

// ---------- Nhận dạng giọng nói (1 lượt) ----------
export class SpeechListener {
  static get supported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  constructor(lang = "en-US") {
    this.lang = lang;
    this.rec = null;
    this.listening = false;
  }

  /**
   * Bắt đầu nghe một lượt. Trả về Promise<{text, confidence}[]>.
   * Reject với Error có .code: unsupported | not-allowed | audio-capture | no-speech | network | aborted
   */
  listen({ onInterim } = {}) {
    return new Promise((resolve, reject) => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        const e = new Error("Trình duyệt không hỗ trợ nhận dạng giọng nói");
        e.code = "unsupported";
        return reject(e);
      }

      const rec = new SR();
      rec.lang = this.lang;
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 3;
      this.rec = rec;

      let finalAlts = null;
      let lastInterim = "";
      let settled = false;
      const done = (fn, val) => {
        if (settled) return;
        settled = true;
        this.listening = false;
        this.rec = null;
        fn(val);
      };

      rec.onstart = () => { this.listening = true; };

      rec.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            finalAlts = [];
            for (let k = 0; k < res.length; k++) {
              finalAlts.push({ text: res[k].transcript, confidence: res[k].confidence });
            }
          } else {
            lastInterim = res[0].transcript;
            if (onInterim) onInterim(lastInterim);
          }
        }
      };

      rec.onerror = (event) => {
        const e = new Error(event.error);
        e.code = event.error === "service-not-allowed" ? "not-allowed" : event.error;
        done(reject, e);
      };

      rec.onend = () => {
        if (finalAlts && finalAlts.length) return done(resolve, finalAlts);
        if (lastInterim) return done(resolve, [{ text: lastInterim, confidence: 0 }]);
        const e = new Error("no-speech");
        e.code = "no-speech";
        done(reject, e);
      };

      try {
        rec.start();
      } catch (err) {
        err.code = err.code || "aborted";
        done(reject, err);
      }
    });
  }

  stop() {
    try { this.rec?.stop(); } catch { /* bỏ qua */ }
  }

  abort() {
    try { this.rec?.abort(); } catch { /* bỏ qua */ }
  }
}
