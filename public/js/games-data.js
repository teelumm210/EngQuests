// ============================================
// EngQuests - Dữ liệu cho các trò chơi học tiếng Anh
//  WORDS     : từ vựng (en, vi, chủ đề) cho Ghép thẻ, Mưa chữ, Đoán chữ
//  GRAMMAR   : câu hỏi ngữ pháp điền khuyết (Ngữ pháp nhanh)
//  SENTENCES : câu để sắp xếp (Xếp câu)
// ============================================

const W = (topic, pairs) => pairs.map(([en, vi]) => ({ en, vi, topic }));

export const WORDS = [
  ...W("Đồ ăn & Đồ uống", [["apple", "quả táo"], ["bread", "bánh mì"], ["rice", "cơm, gạo"], ["chicken", "thịt gà"], ["egg", "quả trứng"], ["milk", "sữa"], ["coffee", "cà phê"], ["noodle", "mì, phở"], ["vegetable", "rau củ"], ["cheese", "phô mai"], ["sugar", "đường"]]),
  ...W("Gia đình & Bạn bè", [["mother", "mẹ"], ["father", "bố"], ["sister", "chị/em gái"], ["brother", "anh/em trai"], ["grandmother", "bà"], ["uncle", "chú, bác"], ["neighbor", "hàng xóm"], ["cousin", "anh chị em họ"], ["friend", "bạn bè"]]),
  ...W("Nhà cửa & Đồ dùng", [["table", "cái bàn"], ["chair", "cái ghế"], ["bed", "cái giường"], ["window", "cửa sổ"], ["kitchen", "nhà bếp"], ["lamp", "cái đèn"], ["mirror", "cái gương"], ["pillow", "cái gối"], ["umbrella", "cái ô"]]),
  ...W("Du lịch & Di chuyển", [["airport", "sân bay"], ["ticket", "vé"], ["luggage", "hành lý"], ["passport", "hộ chiếu"], ["hotel", "khách sạn"], ["journey", "chuyến đi"], ["map", "bản đồ"], ["station", "nhà ga"]]),
  ...W("Công việc & Học tập", [["teacher", "giáo viên"], ["homework", "bài tập về nhà"], ["exam", "kỳ thi"], ["office", "văn phòng"], ["meeting", "cuộc họp"], ["salary", "tiền lương"], ["deadline", "hạn chót"], ["library", "thư viện"], ["notebook", "quyển vở"]]),
  ...W("Sức khỏe & Cơ thể", [["headache", "đau đầu"], ["medicine", "thuốc"], ["doctor", "bác sĩ"], ["hospital", "bệnh viện"], ["healthy", "khỏe mạnh"], ["exercise", "tập thể dục"], ["fever", "cơn sốt"], ["shoulder", "bờ vai"]]),
  ...W("Mua sắm & Tiền bạc", [["price", "giá cả"], ["cheap", "rẻ"], ["expensive", "đắt"], ["discount", "giảm giá"], ["receipt", "hóa đơn"], ["wallet", "ví tiền"], ["customer", "khách hàng"], ["cashier", "thu ngân"]]),
  ...W("Công nghệ", [["laptop", "máy tính xách tay"], ["password", "mật khẩu"], ["battery", "pin"], ["keyboard", "bàn phím"], ["screen", "màn hình"], ["download", "tải xuống"], ["charger", "cục sạc"]]),
  ...W("Thiên nhiên & Thời tiết", [["rain", "mưa"], ["mountain", "ngọn núi"], ["river", "dòng sông"], ["forest", "khu rừng"], ["sunny", "có nắng"], ["cloud", "đám mây"], ["flower", "bông hoa"], ["ocean", "đại dương"], ["storm", "cơn bão"]]),
  ...W("Cảm xúc & Tính cách", [["happy", "vui vẻ"], ["angry", "tức giận"], ["nervous", "lo lắng"], ["proud", "tự hào"], ["lazy", "lười biếng"], ["brave", "dũng cảm"], ["shy", "nhút nhát"], ["excited", "háo hức"]]),
  ...W("Giải trí & Thể thao", [["music", "âm nhạc"], ["movie", "bộ phim"], ["football", "bóng đá"], ["hobby", "sở thích"], ["guitar", "đàn ghi-ta"], ["painting", "bức tranh"]]),
];

// a = đáp án đúng, o = các đáp án sai, e = giải thích ngắn (tiếng Việt)
const Q = (q, a, o, e) => ({ q, a, o, e });

export const GRAMMAR = [
  Q("She ___ to school every day.", "goes", ["go", "going", "gone"], "Hiện tại đơn, chủ ngữ ngôi thứ 3 số ít (she) thì động từ thêm -s/-es."),
  Q("They ___ football now.", "are playing", ["play", "plays", "played"], "Có \"now\" nên dùng hiện tại tiếp diễn: am/is/are + V-ing."),
  Q("I ___ him yesterday.", "saw", ["see", "seen", "seeing"], "\"Yesterday\" là dấu hiệu quá khứ đơn; quá khứ của see là saw."),
  Q("We have lived here ___ 2015.", "since", ["for", "from", "in"], "Dùng since + mốc thời gian (2015); for + khoảng thời gian."),
  Q("He has worked here ___ five years.", "for", ["since", "ago", "during"], "Dùng for + khoảng thời gian (five years)."),
  Q("There isn't ___ milk in the fridge.", "any", ["some", "many", "a"], "Câu phủ định với danh từ không đếm được dùng any."),
  Q("She is ___ than her sister.", "taller", ["tall", "more tall", "tallest"], "Tính từ ngắn so sánh hơn: thêm -er (taller)."),
  Q("This is the ___ movie I have ever seen.", "best", ["better", "good", "most good"], "So sánh nhất của good là the best."),
  Q("I'm looking forward to ___ you.", "seeing", ["see", "saw", "seen"], "Look forward to + V-ing (to ở đây là giới từ)."),
  Q("If it rains, we ___ at home.", "will stay", ["stay", "would stay", "stayed"], "Câu điều kiện loại 1: If + hiện tại đơn, will + V."),
  Q("If I were you, I ___ study harder.", "would", ["will", "am", "can"], "Câu điều kiện loại 2: If + quá khứ, would + V."),
  Q("He is ___ honest man.", "an", ["a", "the", "some"], "Honest đọc là /ˈɒnɪst/ (h câm, âm nguyên âm) nên dùng an."),
  Q("My brother is ___ university student.", "a", ["an", "the", "some"], "University đọc là /ˌjuːnɪˈvɜːsəti/ (bắt đầu bằng âm /j/) nên dùng a."),
  Q("She is interested ___ music.", "in", ["on", "at", "about"], "Be interested in + danh từ."),
  Q("The meeting starts ___ 9 a.m.", "at", ["in", "on", "by"], "Giờ cụ thể dùng at."),
  Q("My birthday is ___ July.", "in", ["on", "at", "to"], "Tháng dùng in."),
  Q("We met ___ Monday.", "on", ["in", "at", "by"], "Thứ trong tuần và ngày dùng on."),
  Q("He ___ TV when I called.", "was watching", ["watched", "watches", "is watching"], "Hành động đang diễn ra thì có hành động khác xen vào: quá khứ tiếp diễn."),
  Q("She asked me where I ___.", "lived", ["live", "living", "lives"], "Câu tường thuật: lùi thì, live → lived."),
  Q("You ___ smoke here. It's forbidden.", "must not", ["don't have to", "needn't", "might not"], "Must not = cấm đoán."),
  Q("You ___ come early tomorrow; we start late.", "don't have to", ["mustn't", "can't", "shouldn't"], "Don't have to = không cần thiết (không bị cấm)."),
  Q("The book ___ by millions of people.", "is read", ["reads", "is reading", "read"], "Câu bị động hiện tại đơn: is/are + V3."),
  Q("My phone ___ stolen last week.", "was", ["is", "were", "has"], "Bị động quá khứ đơn: was/were + V3; phone là số ít nên dùng was."),
  Q("Neither Tom nor his friends ___ here.", "are", ["is", "was", "be"], "Neither ... nor: chia động từ theo chủ ngữ gần nhất (friends → are)."),
  Q("Each of the students ___ a book.", "has", ["have", "having", "are having"], "Each of + danh từ số nhiều vẫn đi với động từ số ít."),
  Q("I enjoy ___ English.", "learning", ["to learn", "learn", "learned"], "Enjoy + V-ing."),
  Q("She decided ___ a new job.", "to find", ["finding", "find", "found"], "Decide + to V."),
  Q("He asked me ___ the window.", "to open", ["opening", "open", "opened"], "Ask somebody + to V."),
  Q("The girl ___ is singing is my cousin.", "who", ["which", "whose", "whom"], "Who thay thế cho người, làm chủ ngữ trong mệnh đề quan hệ."),
  Q("This is the car ___ I bought last year.", "which", ["who", "whose", "where"], "Which thay thế cho vật (the car)."),
  Q("I have ___ finished my homework.", "already", ["yet", "since", "ago"], "Already dùng trong câu khẳng định với hiện tại hoàn thành."),
  Q("Have you finished ___?", "yet", ["already", "since", "still"], "Yet dùng trong câu hỏi và phủ định với hiện tại hoàn thành."),
  Q("She speaks English ___.", "fluently", ["fluent", "fluency", "more fluent"], "Bổ nghĩa cho động từ cần trạng từ (fluently)."),
  Q("He is very ___ at math.", "good", ["well", "nice", "best"], "Be good at + danh từ (good là tính từ)."),
  Q("How ___ water do you drink a day?", "much", ["many", "few", "a lot"], "Water là danh từ không đếm được nên dùng how much."),
  Q("How ___ students are in your class?", "many", ["much", "little", "any"], "Students là danh từ đếm được số nhiều nên dùng how many."),
  Q("I wish I ___ a car.", "had", ["have", "has", "will have"], "Wish + quá khứ đơn: ước điều không có thật ở hiện tại."),
  Q("By the time we arrived, the film ___.", "had started", ["started", "has started", "starts"], "Hành động xảy ra trước một mốc trong quá khứ: quá khứ hoàn thành."),
  Q("I usually ___ breakfast at 7.", "have", ["having", "am having", "has"], "Thói quen: hiện tại đơn, chủ ngữ I dùng have."),
  Q("Look! The baby ___.", "is crying", ["cries", "cried", "cry"], "\"Look!\" báo hiệu hành động đang diễn ra: hiện tại tiếp diễn."),
  Q("She suggested ___ to the beach.", "going", ["to go", "go", "went"], "Suggest + V-ing."),
  Q("Do you mind ___ the door?", "closing", ["to close", "close", "closed"], "Mind + V-ing."),
  Q("We ___ each other since 2010.", "have known", ["know", "knew", "are knowing"], "Since + mốc thời gian: hiện tại hoàn thành; know không chia tiếp diễn."),
  Q("He didn't ___ the answer.", "know", ["knew", "known", "knows"], "Sau didn't dùng động từ nguyên mẫu."),
];

export const SENTENCES = [
  { en: "I would like a cup of coffee, please.", vi: "Làm ơn cho tôi một tách cà phê." },
  { en: "She goes to school by bike every day.", vi: "Cô ấy đi học bằng xe đạp mỗi ngày." },
  { en: "Can you tell me how to get to the station?", vi: "Bạn có thể chỉ tôi đường đến nhà ga không?" },
  { en: "We are going to visit our grandparents tomorrow.", vi: "Ngày mai chúng tôi sẽ đi thăm ông bà." },
  { en: "He has lived in Hanoi for ten years.", vi: "Anh ấy đã sống ở Hà Nội mười năm." },
  { en: "What time does the meeting start?", vi: "Cuộc họp bắt đầu lúc mấy giờ?" },
  { en: "I am learning English to find a better job.", vi: "Tôi đang học tiếng Anh để tìm việc tốt hơn." },
  { en: "They didn't come to the party last night.", vi: "Tối qua họ không đến bữa tiệc." },
  { en: "The weather is much better than yesterday.", vi: "Thời tiết tốt hơn hôm qua nhiều." },
  { en: "Please turn off your phone during the movie.", vi: "Vui lòng tắt điện thoại trong lúc xem phim." },
  { en: "My sister is taller than me.", vi: "Chị tôi cao hơn tôi." },
  { en: "Do you want to play football with us?", vi: "Bạn có muốn chơi bóng đá với chúng tôi không?" },
  { en: "I have never been to Japan before.", vi: "Tôi chưa từng đến Nhật Bản." },
  { en: "She is reading a book in the library.", vi: "Cô ấy đang đọc sách trong thư viện." },
  { en: "It's raining, so take an umbrella with you.", vi: "Trời đang mưa, nên hãy mang theo ô." },
  { en: "How much does this jacket cost?", vi: "Chiếc áo khoác này giá bao nhiêu?" },
  { en: "He always drinks water after exercise.", vi: "Anh ấy luôn uống nước sau khi tập thể dục." },
  { en: "We should eat more vegetables and fruit.", vi: "Chúng ta nên ăn nhiều rau và trái cây hơn." },
  { en: "Could you speak more slowly, please?", vi: "Bạn có thể nói chậm hơn được không?" },
  { en: "The train leaves at half past seven.", vi: "Tàu rời đi lúc bảy giờ rưỡi." },
  { en: "I forgot my password again.", vi: "Tôi lại quên mật khẩu rồi." },
  { en: "Thank you for helping me with my homework.", vi: "Cảm ơn bạn đã giúp tôi làm bài tập." },
  { en: "There are many beautiful places in Vietnam.", vi: "Có rất nhiều nơi đẹp ở Việt Nam." },
  { en: "My favorite hobby is listening to music.", vi: "Sở thích của tôi là nghe nhạc." },
];
