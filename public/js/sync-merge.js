// ============================================================
// EngQuests - Gộp tiến trình học giữa thiết bị này và tài khoản (hàm thuần, không đụng DOM)
// Nguyên tắc: không bao giờ làm mất thành tích. Số liệu tích luỹ lấy giá trị lớn hơn,
// từ vựng hợp hai bên, từ bị xoá được nhớ lại bằng "tombstones".
// ============================================================

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const lower = (w) => String(w || "").trim().toLowerCase();
const ts = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function mergeWords(local = [], cloud = [], tombstones = {}) {
  const map = new Map();
  const latest = new Map(); // thời điểm thêm muộn nhất giữa hai bên, để so với tombstone
  for (const e of [...(Array.isArray(cloud) ? cloud : []), ...(Array.isArray(local) ? local : [])]) {
    if (!e || !e.word) continue;
    const key = lower(e.word);
    latest.set(key, Math.max(latest.get(key) || 0, ts(e.addedAt)));
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...e });
      continue;
    }
    const topic = (c) => (c && c !== "Khác" ? c : "");
    map.set(key, {
      ...prev,
      ...e,
      id: prev.id || e.id,
      ipa: prev.ipa || e.ipa || "",
      pos: prev.pos || e.pos || "",
      meaning: prev.meaning || e.meaning || "",
      example: prev.example || e.example || "",
      category: topic(prev.category) || topic(e.category) || prev.category || e.category,
      addedAt: ts(prev.addedAt) && ts(e.addedAt) ? (ts(prev.addedAt) <= ts(e.addedAt) ? prev.addedAt : e.addedAt) : prev.addedAt || e.addedAt,
      mastered: !!(prev.mastered || e.mastered),
      pronBest: Math.max(num(prev.pronBest), num(e.pronBest)) || undefined,
      pronLast: e.pronLast ?? prev.pronLast,
    });
  }
  const out = [];
  for (const [key, w] of map) {
    const gone = num(tombstones[key]);
    if (gone && gone > (latest.get(key) || 0)) continue; // đã xoá sau lần thêm gần nhất
    if (w.pronBest === undefined) delete w.pronBest;
    if (w.pronLast === undefined) delete w.pronLast;
    out.push(w);
  }
  return out.sort((a, b) => ts(b.addedAt) - ts(a.addedAt));
}

export function mergeTombstones(a, b) {
  const out = { ...obj(b) };
  for (const [k, v] of Object.entries(obj(a))) out[k] = Math.max(num(out[k]), num(v));
  const keys = Object.keys(out);
  if (keys.length > 500) keys.sort((x, y) => out[x] - out[y]).slice(0, keys.length - 500).forEach((k) => delete out[k]);
  return out;
}

export function mergeMaxNumbers(a, b) {
  const out = {};
  for (const k of new Set([...Object.keys(obj(a)), ...Object.keys(obj(b))])) {
    const x = obj(a)[k];
    const y = obj(b)[k];
    out[k] = typeof x === "number" || typeof y === "number" ? Math.max(num(x), num(y)) : x ?? y;
  }
  return out;
}

export function mergeStreak(a, b) {
  const x = obj(a);
  const y = obj(b);
  if (!x.lastActiveDate) return y.lastActiveDate ? y : x;
  if (!y.lastActiveDate) return x;
  if (x.lastActiveDate === y.lastActiveDate) return { ...x, count: Math.max(num(x.count), num(y.count)) };
  return x.lastActiveDate > y.lastActiveDate ? x : y; // định dạng YYYY-MM-DD so sánh theo chữ được
}

export function mergeXP(a, b) {
  const x = obj(a);
  const y = obj(b);
  const out = { total: Math.max(num(x.total), num(y.total)), today: 0, todayDate: null };
  if (x.todayDate && y.todayDate && x.todayDate === y.todayDate) {
    out.todayDate = x.todayDate;
    out.today = Math.max(num(x.today), num(y.today));
  } else {
    const pick = (x.todayDate || "") >= (y.todayDate || "") ? x : y;
    out.todayDate = pick.todayDate || null;
    out.today = num(pick.today);
  }
  return out;
}

export function mergeQuests(a, b) {
  const x = obj(a);
  const y = obj(b);
  const out = { totals: mergeMaxNumbers(x.totals, y.totals) };
  const hx = obj(x.hunt);
  const hy = obj(y.hunt);
  if (hx.date && hy.date && hx.date === hy.date) {
    const n = Math.max((hx.targets || []).length, (hy.targets || []).length);
    const targets = [];
    for (let i = 0; i < n; i++) {
      const tx = (hx.targets || [])[i];
      const ty = (hy.targets || [])[i];
      if (tx && ty) {
        const doneSide = tx.done ? tx : ty.done ? ty : tx;
        targets.push({ ...doneSide, done: !!(tx.done || ty.done), word: tx.word || ty.word || "" });
      } else targets.push(tx || ty);
    }
    out.hunt = { ...hx, targets, rerolls: Math.max(num(hx.rerolls), num(hy.rerolls)) };
  } else if (hx.date || hy.date) {
    out.hunt = (hx.date || "") >= (hy.date || "") ? hx : hy;
  }
  return out;
}

/** Gộp hai ảnh chụp tiến trình. local thắng ở các mục không thể gộp (mục tiêu ngày). */
export function mergeSnapshots(local = {}, cloud = {}) {
  const l = obj(local);
  const c = obj(cloud);
  const tombstones = mergeTombstones(l.tombstones, c.tombstones);
  return {
    words: mergeWords(l.words, c.words, tombstones),
    tombstones,
    stats: mergeMaxNumbers(l.stats, c.stats),
    streak: mergeStreak(l.streak, c.streak),
    xp: mergeXP(l.xp, c.xp),
    goal: Object.keys(obj(l.goal)).length ? l.goal : obj(c.goal),
    best: mergeMaxNumbers(l.best, c.best),
    quests: mergeQuests(l.quests, c.quests),
  };
}
