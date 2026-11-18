// ============================================
// EngQuests - Learning Store (Flashcard, Thống kê, Streak, XP & Level)
// ============================================

import { normalizeTopic } from "./features.js";

const STORAGE_KEYS = {
  WORDS: "voca_words",
  STATS: "voca_stats",
  STREAK: "voca_streak",
  XP: "voca_xp",
  GOAL: "voca_daily_goal",
};

const DEFAULT_STATS = {
  speakingSeconds: 0,
  wordsLearned: 0,
  pronunciationCount: 0,
  pronunciationTotal: 0,
  pronunciationBest: 0,
};

function readJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* localStorage đầy hoặc bị chặn: bỏ qua */
  }
}

// Ngày theo múi giờ người dùng (toISOString dùng UTC nên lệch ngày ở Việt Nam trước 7h sáng)
function localDateKey(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function dayDiff(fromKey, toKey) {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

const sameWord = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

export class LearningStore {
  // ---- XP Định mức ----
  static XP_PER_WORD = 15;
  static XP_PER_PRONUNCIATION = 10;
  static XP_HIGH_SCORE_BONUS = 15; // điểm >= 90
  static XP_PER_MINUTE_SPEAKING = 5;

  // ---- Từ vựng / flashcard ----
  static getWords() {
    const words = readJSON(STORAGE_KEYS.WORDS, []);
    if (!Array.isArray(words)) return [];
    return words.map((w) => ({ ...w, category: normalizeTopic(w.category === "General" ? "" : w.category) }));
  }

  static findWord(word) {
    return this.getWords().find((w) => sameWord(w.word, word)) || null;
  }

  static hasWord(word) {
    return !!this.findWord(word);
  }

  /** Thêm hoặc cập nhật một từ. */
  static saveWord(wordObj) {
    if (!wordObj || !wordObj.word) return null;
    const words = this.getWords();
    const idx = words.findIndex((w) => sameWord(w.word, wordObj.word));
    const old = idx >= 0 ? words[idx] : null;

    const entry = {
      ...(old || {}),
      id: old ? old.id : Date.now().toString() + Math.random().toString(36).slice(2, 6),
      word: wordObj.word.trim(),
      ipa: wordObj.ipa || old?.ipa || "",
      pos: wordObj.pos || old?.pos || "",
      meaning: wordObj.meaning || old?.meaning || "",
      example: wordObj.example || old?.example || "",
      category: normalizeTopic(wordObj.category || old?.category),
      addedAt: old ? old.addedAt : new Date().toISOString(),
      mastered: old ? old.mastered : false,
    };

    if (old) words[idx] = entry;
    else words.unshift(entry);

    writeJSON(STORAGE_KEYS.WORDS, words);
    if (!old) {
      this.incrementWordsLearned();
      this.addXP(this.XP_PER_WORD, "Thêm từ mới: " + entry.word);
    }
    return entry;
  }

  static setWordCategory(id, category) {
    const words = this.getWords();
    const w = words.find((x) => x.id === id);
    if (w) {
      w.category = normalizeTopic(category);
      writeJSON(STORAGE_KEYS.WORDS, words);
    }
    return w;
  }

  static toggleWordMastered(id) {
    const words = this.getWords();
    const word = words.find((w) => w.id === id);
    if (word) {
      word.mastered = !word.mastered;
      writeJSON(STORAGE_KEYS.WORDS, words);
    }
    return word;
  }

  static deleteWord(id) {
    const words = this.getWords().filter((w) => w.id !== id);
    writeJSON(STORAGE_KEYS.WORDS, words);
    return words;
  }

  /** Điểm phát âm gần nhất và cao nhất của một từ trong flashcard (nếu có) */
  static setWordPronunciation(word, score) {
    const words = this.getWords();
    const w = words.find((x) => sameWord(x.word, word));
    if (!w) return null;
    w.pronLast = score;
    w.pronBest = Math.max(w.pronBest || 0, score);
    writeJSON(STORAGE_KEYS.WORDS, words);
    return w;
  }

  /** Đếm số từ theo chủ đề: { "Công nghệ": 3, ... } */
  static getTopicCounts(words = this.getWords()) {
    const counts = {};
    words.forEach((w) => {
      counts[w.category] = (counts[w.category] || 0) + 1;
    });
    return counts;
  }

  // ---- Thống kê ----
  static getStats() {
    return { ...DEFAULT_STATS, ...readJSON(STORAGE_KEYS.STATS, {}) };
  }

  static _bump(mutator) {
    const stats = this.getStats();
    mutator(stats);
    writeJSON(STORAGE_KEYS.STATS, stats);
    this.updateStreak();
    return stats;
  }

  static addSpeakingTime(seconds) {
    const mins = Math.floor(seconds / 60);
    if (mins >= 1) {
      this.addXP(mins * this.XP_PER_MINUTE_SPEAKING, "Hội thoại giọng nói");
    }
    return this._bump((s) => {
      s.speakingSeconds += seconds;
    });
  }

  static incrementWordsLearned() {
    return this._bump((s) => {
      s.wordsLearned += 1;
    });
  }

  static addPronunciationResult(score) {
    let earnedXP = this.XP_PER_PRONUNCIATION;
    if (score >= 90) earnedXP += this.XP_HIGH_SCORE_BONUS;
    this.addXP(earnedXP, `Phát âm ${score} điểm`);

    return this._bump((s) => {
      s.pronunciationCount += 1;
      s.pronunciationTotal += score;
      s.pronunciationBest = Math.max(s.pronunciationBest, score);
    });
  }

  static getPronunciationAverage() {
    const s = this.getStats();
    return s.pronunciationCount ? Math.round(s.pronunciationTotal / s.pronunciationCount) : 0;
  }

  // ---- Streak ----
  static getStreak() {
    const raw = readJSON(STORAGE_KEYS.STREAK, null);
    if (raw && typeof raw.count === "number" && raw.lastActiveDate) return raw;
    return { count: 0, lastActiveDate: null };
  }

  /** Chuỗi ngày hiển thị: bỏ lỡ hơn 1 ngày thì coi như đã đứt (0) */
  static getCurrentStreak() {
    const s = this.getStreak();
    if (!s.lastActiveDate) return 0;
    return dayDiff(s.lastActiveDate, localDateKey()) > 1 ? 0 : s.count;
  }

  static updateStreak() {
    const streak = this.getStreak();
    const today = localDateKey();

    if (!streak.lastActiveDate) {
      streak.count = 1;
    } else {
      const diff = dayDiff(streak.lastActiveDate, today);
      if (diff === 0) return streak;
      streak.count = diff === 1 ? streak.count + 1 : 1;
    }

    streak.lastActiveDate = today;
    writeJSON(STORAGE_KEYS.STREAK, streak);
    return streak;
  }

  // ---- Hệ thống XP & Cấp độ (Gamification) ----
  static getXP() {
    const raw = readJSON(STORAGE_KEYS.XP, { total: 0, today: 0, todayDate: null });
    const today = localDateKey();
    if (raw.todayDate !== today) {
      raw.today = 0;
      raw.todayDate = today;
    }
    return raw;
  }

  static addXP(amount, reason = "") {
    if (!amount || amount <= 0) return this.getXP();
    const xp = this.getXP();
    xp.total = (xp.total || 0) + amount;
    xp.today = (xp.today || 0) + amount;
    writeJSON(STORAGE_KEYS.XP, xp);

    // Kích hoạt event cho giao diện
    try {
      window.dispatchEvent(
        new CustomEvent("voca-xp-gained", {
          detail: { amount, reason, total: xp.total, today: xp.today },
        })
      );
    } catch {}

    return xp;
  }

  static getLevel() {
    const totalXP = this.getXP().total || 0;
    // Mỗi cấp cần Level * 100 XP
    let level = 1;
    let needed = 100;
    let accumulated = 0;

    while (accumulated + needed <= totalXP) {
      accumulated += needed;
      level++;
      needed = level * 100;
    }

    const currentXPInLevel = totalXP - accumulated;
    return {
      level,
      currentXP: currentXPInLevel,
      nextLevelXP: needed,
      totalXP,
      progress: Math.min(1, Math.max(0, currentXPInLevel / needed)),
    };
  }

  static getLevelTitle(level) {
    if (level <= 2) return "🌱 Mầm non";
    if (level <= 5) return "🌿 Đang lớn";
    if (level <= 10) return "🌳 Vững vàng";
    if (level <= 20) return "⭐ Ngôi sao";
    if (level <= 35) return "💎 Kim cương";
    return "👑 Huyền thoại";
  }

  // ---- Mục tiêu hàng ngày (Daily Goal) ----
  static getDailyGoal() {
    return readJSON(STORAGE_KEYS.GOAL, { targetXP: 50 });
  }

  static getDailyProgress() {
    const xp = this.getXP();
    const goal = this.getDailyGoal();
    const current = xp.today || 0;
    const target = goal.targetXP || 50;
    return {
      current,
      target,
      progress: Math.min(1, current / target),
      completed: current >= target,
    };
  }
}
