// ============================================
// EngQuests - Chủ đề từ vựng & gợi ý luyện phát âm
// ============================================

// Danh sách chủ đề cố định: AI chọn một trong số này khi giới thiệu từ mới,
// người dùng có thể đổi chủ đề của từ trong sổ.
export const TOPICS = [
  { id: "Đồ ăn & Đồ uống", icon: "🍜", keywords: ["ăn", "uống", "món", "quả", "trái cây", "rau", "thịt", "cá", "bánh", "cà phê", "nước", "nấu", "bếp", "đồ uống"] },
  { id: "Gia đình & Bạn bè", icon: "👨‍👩‍👧", keywords: ["gia đình", "bạn bè", "bố", "mẹ", "anh", "chị", "em", "con cái", "họ hàng", "hàng xóm", "người yêu"] },
  { id: "Nhà cửa & Đồ dùng", icon: "🏠", keywords: ["nhà", "phòng", "bàn", "ghế", "giường", "cốc", "ly", "tách", "chén", "bình", "cửa", "đồ dùng", "đồ vật", "quần áo", "đèn"] },
  { id: "Du lịch & Di chuyển", icon: "✈️", keywords: ["du lịch", "chuyến", "xe", "máy bay", "sân bay", "khách sạn", "đường", "vé", "hành lý", "đi lại", "tàu"] },
  { id: "Công việc & Học tập", icon: "💼", keywords: ["công việc", "học", "trường", "làm việc", "văn phòng", "đồng nghiệp", "phỏng vấn", "bài tập", "sách", "bút", "kỳ thi", "sếp", "nghề"] },
  { id: "Sức khỏe & Cơ thể", icon: "🩺", keywords: ["sức khỏe", "bệnh", "đau", "thuốc", "bác sĩ", "cơ thể", "tay", "chân", "đầu", "mắt", "tập thể dục"] },
  { id: "Mua sắm & Tiền bạc", icon: "🛍️", keywords: ["mua", "bán", "tiền", "giá", "cửa hàng", "thanh toán", "giảm giá", "ngân hàng", "đắt", "rẻ"] },
  { id: "Công nghệ", icon: "💻", keywords: ["công nghệ", "máy tính", "điện thoại", "mạng", "phần mềm", "ứng dụng", "chuột", "bàn phím", "tai nghe", "màn hình"] },
  { id: "Thiên nhiên & Thời tiết", icon: "🌿", keywords: ["thiên nhiên", "thời tiết", "mưa", "nắng", "gió", "cây", "hoa", "biển", "núi", "động vật", "con vật", "sông"] },
  { id: "Cảm xúc & Tính cách", icon: "😊", keywords: ["cảm xúc", "vui", "buồn", "giận", "tính cách", "lo lắng", "hạnh phúc", "tự tin", "xấu hổ", "yêu", "ghét"] },
  { id: "Giải trí & Thể thao", icon: "⚽", keywords: ["giải trí", "thể thao", "phim", "nhạc", "trò chơi", "bóng", "sở thích", "du ngoạn", "hát", "chơi"] },
  { id: "Khác", icon: "📌", keywords: [] },
];

export const DEFAULT_TOPIC = "Khác";
export const TOPIC_IDS = TOPICS.map((t) => t.id);

function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

export function topicIcon(topic) {
  return (TOPICS.find((t) => t.id === topic) || TOPICS[TOPICS.length - 1]).icon;
}

/** Chuẩn hoá tên chủ đề do AI trả về về đúng một chủ đề trong danh sách (không khớp -> "Khác") */
export function normalizeTopic(raw) {
  const f = fold(raw);
  if (!f) return DEFAULT_TOPIC;
  const exact = TOPICS.find((t) => fold(t.id) === f);
  if (exact) return exact.id;
  // khớp một phần: "Đồ ăn" -> "Đồ ăn & Đồ uống"
  const partial = TOPICS.find((t) => t.id !== DEFAULT_TOPIC && (fold(t.id).includes(f) || f.includes(fold(t.id))));
  if (partial) return partial.id;
  const byWord = TOPICS.find(
    (t) =>
      t.id !== DEFAULT_TOPIC &&
      fold(t.id)
        .split(/[\s&]+/)
        .filter((w) => w.length >= 4)
        .some((w) => f.includes(w))
  );
  return byWord ? byWord.id : DEFAULT_TOPIC;
}

/** Đoán chủ đề từ nghĩa tiếng Việt khi AI không gửi kèm chủ đề */
export function guessTopic(meaning) {
  const f = fold(meaning);
  if (!f) return DEFAULT_TOPIC;
  let best = null;
  let bestScore = 0;
  for (const t of TOPICS) {
    const score = t.keywords.filter((k) => f.includes(fold(k))).length;
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best ? best.id : DEFAULT_TOPIC;
}

// Từ gợi ý khi người dùng bấm "Luyện phát âm" mà sổ từ còn trống
export const PRACTICE_STARTERS = [
  { text: "pronunciation", ipa: "/prəˌnʌn.siˈeɪ.ʃən/", meaning: "Cách phát âm" },
  { text: "vegetable", ipa: "/ˈvedʒ.tə.bəl/", meaning: "Rau củ" },
  { text: "comfortable", ipa: "/ˈkʌmf.tɚ.bəl/", meaning: "Thoải mái" },
  { text: "schedule", ipa: "/ˈskedʒ.uːl/", meaning: "Lịch trình" },
  { text: "three", ipa: "/θriː/", meaning: "Số ba" },
  { text: "thought", ipa: "/θɑːt/", meaning: "Suy nghĩ / đã nghĩ" },
  { text: "library", ipa: "/ˈlaɪ.brer.i/", meaning: "Thư viện" },
  { text: "An apple a day keeps the doctor away.", ipa: "/ən ˈæp.əl ə deɪ kiːps ðə ˈdɑːk.tɚ əˈweɪ/", meaning: "Mỗi ngày một quả táo giúp tránh xa bác sĩ." },
];
