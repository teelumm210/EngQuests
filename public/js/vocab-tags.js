// ============================================
// EngQuests - Đọc các thẻ máy do AI đính kèm cuối tin nhắn
//   [[VOCAB {...}]]     từ vựng mới -> hỏi thêm vào flashcard
//   [[PRACTICE {...}]]  mời luyện phát âm ngay trong chat
// Người dùng không nhìn thấy các thẻ này: parseReply() trả về văn bản đã loại thẻ.
// ============================================

import { normalizeTopic, guessTopic } from "./features.js";

const TAG_RE = /\[\[(VOCAB|PRACTICE)\s+(\{[\s\S]*?\})\s*\]\]/g;
const WORD_RE = /^[A-Za-z][A-Za-z\s'-]{0,39}$/;

const clip = (v, n) => String(v ?? "").trim().slice(0, n);

function cleanVocab(o) {
  const word = clip(o.word, 40);
  if (!WORD_RE.test(word)) return null;
  const meaning = clip(o.meaning, 120);
  return {
    word,
    ipa: clip(o.ipa, 60),
    pos: clip(o.pos, 20),
    meaning,
    example: clip(o.example, 200),
    // AI chọn chủ đề; nếu thiếu/không hợp lệ thì thử đoán theo nghĩa
    category: o.topic ? normalizeTopic(o.topic) : guessTopic(meaning),
  };
}

function cleanPractice(o) {
  const text = clip(o.text, 140);
  if (!text || text.split(/\s+/).length > 14) return null;
  return { text, ipa: clip(o.ipa, 140), meaning: clip(o.meaning, 160) };
}

/** Dự phòng khi AI quên thẻ: có từ in đậm + phiên âm /…/ ngay sau thì coi là từ mới */
function fallbackVocab(text) {
  const m = text.match(/\*\*([A-Za-z][A-Za-z\s'-]{1,30})\*\*\s*[\(\[]?\s*(\/[^\/\n]{2,60}\/)/);
  if (!m) return null;
  const after = text.slice(m.index + m[0].length, m.index + m[0].length + 200);
  const meaning = after
    .split("\n")[0]
    .replace(/^[\s\)\]:\-–—=,.]*/, "")
    .replace(/^(có\s+)?(nghĩa là|nghĩa|tức là|là)\s*[:,]?\s*/i, "")
    .split(/[.!?;]/)[0]
    .replace(/\*\*/g, "")
    .trim();
  const ex = text.match(/["“]([^"”\n]{8,140})["”]/);
  return cleanVocab({ word: m[1].trim(), ipa: m[2], meaning, example: ex ? ex[1] : "" });
}

/**
 * @param {string} raw  nội dung AI trả về (có thể kèm thẻ)
 * @returns {{display: string, vocab: object[], practice: object|null}}
 */
export function parseReply(raw) {
  const vocab = [];
  let practice = null;

  let display = String(raw || "").replace(TAG_RE, (_m, kind, json) => {
    try {
      const obj = JSON.parse(json);
      if (kind === "VOCAB") {
        const v = cleanVocab(obj);
        if (v && vocab.length < 3 && !vocab.some((x) => x.word.toLowerCase() === v.word.toLowerCase())) vocab.push(v);
      } else if (!practice) {
        practice = cleanPractice(obj);
      }
    } catch {
      /* thẻ hỏng: bỏ qua, vẫn giữ phần văn bản */
    }
    return "";
  });

  // Tin bị cắt giữa chừng khi đang viết thẻ -> không để lộ "[[VOCAB {..." ra cho người dùng
  display = display.replace(/\[\[[\s\S]*$/, "").replace(/\n{3,}/g, "\n\n").trim();

  if (!vocab.length && !practice) {
    const fb = fallbackVocab(display);
    if (fb) vocab.push(fb);
  }
  return { display, vocab, practice };
}
