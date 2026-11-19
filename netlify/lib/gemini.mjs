// ============================================================
// Gọi Gemini generateContent với chiến lược "gọi song song dự phòng" (hedged request):
//  - Bắt đầu bằng model chính. Nếu sau HEDGE_AFTER_MS chưa có kết quả, mở thêm model kế tiếp CHẠY SONG SONG
//    (không huỷ model đang chạy). Ai trả về thành công trước thì thắng, các lần còn lại bị huỷ.
//  - Model lỗi tạm thời (429/5xx/timeout) thì chuyển ngay sang model kế tiếp.
//  - Thử tắt "thinking" để trả lời nhanh; nếu model từ chối cấu hình đó thì gọi lại bình thường.
// So với thử lần lượt (mỗi model chỉ được ~1/2 thời gian), cách này hầu như không còn báo "AI phản hồi quá lâu".
// ============================================================

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export const PRIMARY_MODEL = process.env.CHAT_MODEL || "gemini-3.8-flash";
export const MODELS = [...new Set([PRIMARY_MODEL, "gemini-3.5-flash", "gemini-3.5-flash-lite"])];

const HEDGE_AFTER_MS = 6500;
const MIN_ATTEMPT_MS = 3000;

const err = (status, code, message) => ({ status, code, message });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object} o
 * @param {string} o.apiKey
 * @param {object} o.body         thân request (contents, systemInstruction, generationConfig...)
 * @param {number} [o.budgetMs]   tổng thời gian tối đa
 * @param {boolean} [o.fastThinking] thử tắt thinking
 * @returns {Promise<{data:object, model:string} | {error:{status,code,message}}>}
 */
export async function generate({ apiKey, body, budgetMs = 23000, fastThinking = true, models = MODELS }) {
  const startedAt = Date.now();
  const deadline = startedAt + budgetMs;
  const controllers = [];
  const pending = new Map();
  let nextIdx = 0;
  let lastError = err(502, "UPSTREAM", "Máy chủ AI đang gặp sự cố. Bạn thử lại sau ít giây nhé.");

  const bodyFor = (variant) => {
    if (variant === 0 && fastThinking) {
      return JSON.stringify({ ...body, generationConfig: { ...(body.generationConfig || {}), thinkingConfig: { thinkingBudget: 0 } } });
    }
    return JSON.stringify(body);
  };

  async function attempt(i, signal) {
    const variants = fastThinking ? [0, 1] : [1];
    let last = null;
    for (const variant of variants) {
      let res;
      try {
        res = await fetch(`${API_BASE}/${encodeURIComponent(models[i])}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          signal,
          body: bodyFor(variant),
        });
      } catch (e) {
        return { err: e?.name === "AbortError" ? err(504, "TIMEOUT", "AI phản hồi quá lâu. Bạn thử lại nhé.") : err(502, "UPSTREAM", "Không kết nối được tới máy chủ AI.") };
      }
      if (res.ok) return { data: await res.json() };
      let msg = "";
      try {
        msg = (await res.json())?.error?.message || "";
      } catch {
        /* không phải JSON */
      }
      console.error("Gemini error", models[i], res.status, msg);
      if (res.status === 400 && variant === 0 && variants.length > 1 && !/token|too long|exceeds|context/i.test(msg)) continue; // thử lại không có thinkingConfig
      if (res.status === 400 && /token|too long|exceeds|context/i.test(msg)) {
        return { err: err(400, "CONTEXT_TOO_LONG", "Cuộc trò chuyện đã quá dài so với giới hạn của model."), fatal: true };
      }
      if (res.status === 400 || res.status === 401 || res.status === 403) return { err: err(500, "SERVER_CONFIG", "Cấu hình AI trên máy chủ chưa đúng."), fatal: true };
      if (res.status === 404) last = err(500, "MODEL_NOT_FOUND", "Model AI trên máy chủ không còn khả dụng.");
      else if (res.status === 429) last = err(429, "QUOTA", "EngQuests đang quá tải lượt dùng. Bạn đợi một lát rồi thử lại nhé.");
      else last = err(502, "UPSTREAM", "Máy chủ AI đang bận. Bạn thử lại sau ít giây nhé.");
      break;
    }
    return { err: last || err(502, "UPSTREAM", "Máy chủ AI đang bận. Bạn thử lại sau ít giây nhé.") };
  }

  function launch() {
    if (nextIdx >= models.length) return false;
    const i = nextIdx++;
    const ctrl = new AbortController();
    controllers.push(ctrl);
    const timer = setTimeout(() => ctrl.abort(), Math.max(1000, deadline - Date.now()));
    const p = attempt(i, ctrl.signal)
      .then((r) => ({ ...r, i }))
      .finally(() => clearTimeout(timer));
    pending.set(i, p);
    return true;
  }

  const newHedge = () => sleep(HEDGE_AFTER_MS).then(() => ({ hedge: true }));
  launch();
  let hedge = newHedge();

  while (pending.size) {
    const racers = [...pending.values()];
    if (nextIdx < models.length) racers.push(hedge);
    const r = await Promise.race(racers);

    if (r.hedge) {
      if (deadline - Date.now() > MIN_ATTEMPT_MS) launch();
      hedge = newHedge();
      continue;
    }
    pending.delete(r.i);
    if (r.data) {
      controllers.forEach((c) => c.abort());
      if (r.i > 0) console.warn("Dùng model dự phòng:", models[r.i]);
      return { data: r.data, model: models[r.i] };
    }
    lastError = r.err || lastError;
    if (r.fatal) {
      controllers.forEach((c) => c.abort());
      return { error: lastError };
    }
    // lỗi tạm thời: chuyển ngay sang model kế tiếp nếu còn thời gian
    if (!pending.size && nextIdx < models.length && deadline - Date.now() > MIN_ATTEMPT_MS) {
      await sleep(400);
      launch();
      hedge = newHedge();
    }
  }
  return { error: lastError };
}

export const textOf = (data) => (data?.candidates?.[0]?.content?.parts || []).filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("");
