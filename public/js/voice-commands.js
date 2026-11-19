// ============================================================
// EngQuests - Nhận lệnh xác nhận bằng giọng nói (Có / Lưu đi / Yes / Save it ...)
// Hội thoại thường bằng tiếng Anh nên lời "Lưu đi", "Có" của người dùng hay bị bộ chép lời
// ghi sai ngôn ngữ (vd. "loo dee"). Hàm này bỏ dấu, chấp nhận cả hai ngôn ngữ và một số cách
// chép sai phổ biến. Chỉ xét câu ngắn để không bắt nhầm câu chuyện bình thường.
// ============================================================

export function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const YES = new Set([
  // tiếng Việt (đã bỏ dấu)
  "co", "co a", "co nhe", "u", "um", "uhm", "uh huh", "da", "vang", "duoc", "duoc roi", "dong y",
  "luu", "luu di", "luu nhe", "luu vao", "luu vao di", "luu tu nay", "luu tu do", "luu giup", "luu giup minh",
  "them", "them di", "them vao", "them vao di", "them tu nay",
  // tiếng Anh
  "yes", "yes please", "yeah", "yep", "yup", "ok", "okay", "ok save it", "sure", "of course", "please do",
  "go ahead", "sounds good", "why not", "save", "save it", "save this", "save that", "save the word", "save it please",
  "add", "add it", "add this", "add that", "add the word", "add it please", "add to flashcards", "add it to my notebook",
  // cách chép sai thường gặp của "lưu đi"
  "loo dee", "lou dee", "lu dee", "luu dee", "lieu di", "liu di", "lu di", "luudi", "loo di", "lou di",
]);

const NO = new Set([
  "khong", "ko", "k", "khong can", "khong can dau", "khong luu", "dung", "dung luu", "thoi", "thoi khong", "bo qua", "de sau",
  "no", "nope", "nah", "no thanks", "no thank you", "not now", "skip", "skip it", "later", "cancel",
  "dont", "don't", "dont save", "don't save", "do not save", "not this one",
]);

const NEG_WORDS = new Set(["khong", "ko", "dung", "thoi", "no", "not", "dont", "don't", "never", "skip", "cancel"]);

/**
 * @param {string} text  lời người dùng (có thể là cả lượt nói đang được chép dần)
 * @returns {"yes" | "no" | null}
 */
export function classifyConfirm(text) {
  const f = fold(text);
  if (!f) return null;
  const tokens = f.split(" ");

  // Lời dài là chuyện trò bình thường: chỉ xét 3 từ cuối xem có phải lệnh không
  const windows = tokens.length <= 6 ? [tokens] : [tokens.slice(-3), tokens.slice(-2), tokens.slice(-1)];

  for (const w of windows) {
    const phrase = w.join(" ");
    if (NO.has(phrase)) return "no";
    if (w.some((t) => NEG_WORDS.has(t))) {
      // "don't save it", "khong luu", "please don't": phủ định thắng, nhưng chỉ khi là câu ngắn
      // hoặc mở đầu bằng từ phủ định (tránh bắt nhầm "I do not know this word")
      if (w.length <= 3 || NEG_WORDS.has(w[0])) return "no";
      continue;
    }
    if (YES.has(phrase)) return "yes";
    // "yes yes", "ok ok", "luu di luu di": lặp lại cùng một lệnh
    const half = w.length / 2;
    if (Number.isInteger(half) && half > 0 && w.slice(0, half).join(" ") === w.slice(half).join(" ") && YES.has(w.slice(0, half).join(" "))) return "yes";
    // câu ngắn bắt đầu bằng lệnh: "yes save it", "co luu di", "ok them vao"
    if (w.length <= 5 && w.length > 1) {
      for (let n = Math.min(3, w.length); n >= 1; n--) {
        if (YES.has(w.slice(0, n).join(" ")) && (w.length - n <= 3)) return "yes";
      }
    }
  }
  return null;
}
