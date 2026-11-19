// ============================================================
// EngQuests - Tra nghĩa tiếng Việt cho một từ
//  1. Tra ngay trong dữ liệu có sẵn (games-data.js), không cần mạng
//  2. Không có thì hỏi /api/define (Gemini) với giới hạn thời gian, có nhớ kết quả
// ============================================================

import { WORDS, PICTURE_WORDS } from "./games-data.js";
import { API_BASE } from "./config.js";

const local = new Map();
for (const w of [...WORDS, ...PICTURE_WORDS]) {
  const k = String(w.en).toLowerCase();
  if (!local.has(k)) local.set(k, { meaning: w.vi, topic: w.topic });
}
const cache = new Map(); // từ -> kết quả hoặc Promise đang chạy (tránh tra trùng)

export const MEANING_PLACEHOLDER = "Từ vựng tiếng Anh";

export function lookupLocal(word) {
  return local.get(String(word || "").trim().toLowerCase()) || null;
}

/** @returns {Promise<{ipa?:string,pos?:string,meaning:string,example?:string,topic?:string}|null>} */
export async function defineWord(word, { timeoutMs = 10000 } = {}) {
  const key = String(word || "").trim().toLowerCase();
  if (!/^[a-z][a-z\s'-]{0,39}$/.test(key)) return null;
  if (cache.has(key)) return cache.get(key);
  const p = lookup(key, timeoutMs);
  cache.set(key, p);
  const r = await p;
  if (r) cache.set(key, r);
  else cache.delete(key);
  return r;
}

async function lookup(key, timeoutMs) {
  const known = lookupLocal(key);
  let result = known ? { meaning: known.meaning, topic: known.topic } : null;

  // Có sẵn nghĩa nhưng thiếu IPA/ví dụ: vẫn thử hỏi AI để bổ sung, nhưng không bắt người dùng chờ lâu
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), result ? 4000 : timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/api/define`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: key }),
      signal: ctrl.signal,
    });
    if (res.ok) {
      const d = await res.json();
      if (d && d.meaning) result = { ...d, meaning: known?.meaning || d.meaning, topic: known?.topic || d.topic };
    }
  } catch {
    /* mất mạng / quá thời gian: dùng kết quả có sẵn (nếu có) */
  } finally {
    clearTimeout(timer);
  }
  return result;
}
