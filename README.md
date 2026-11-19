# EngQuests - Trợ lý học tiếng Anh với AI

Chat, giọng nói thời gian thực (Gemini Live) và nhận diện đồ vật qua camera để học từ vựng tiếng Anh.

## Kiến trúc

- **Frontend** (`public/`): HTML/CSS/JS thuần, không cần build.
- **Backend** (`netlify/functions/`): API key Gemini nằm trên server, trình duyệt không bao giờ thấy.
  - `POST /api/chat`: proxy chat chữ. Persona, model và giới hạn token do server quyết định.
  - `POST /api/live-token`: cấp token tạm (dùng 1 lần, tối đa 30 phút) để trình duyệt mở WebSocket Gemini Live. Model và persona bị khoá trong token.
  - Giới hạn tần suất theo IP khai báo trong `config.rateLimit` của từng function.
  - `POST /api/auth`: đăng ký / đăng nhập (tên đăng nhập + mật khẩu, mật khẩu băm scrypt, không cần email).
  - `POST /api/progress`: đọc / ghi tiến trình học của tài khoản (token Bearer). Lưu bằng Netlify Blobs.
  - `POST /api/define`: tra nghĩa tiếng Việt, IPA, ví dụ cho một từ (dùng khi lưu từ chưa có nghĩa).
  - `POST /api/vision`: phân tích ảnh camera cho Săn từ, Khung cảnh, Menu & biển hiệu.
- Persona dùng chung ở `public/js/persona.js` (cả client lẫn function đều import).

## Chạy local

```bash
npm install
cp .env.example .env     # rồi điền GEMINI_API_KEY
npx netlify-cli dev      # http://localhost:8888
```

Trên Windows có thể chạy `start.bat`.

## Deploy lên Netlify

1. Đưa code lên GitHub (không kèm `.env`, `node_modules`, `.netlify`).
2. Netlify > Add new site > Import an existing project > chọn repo. Build command để trống, publish directory `public` (đã có trong `netlify.toml`).
3. Site configuration > Environment variables: thêm `GEMINI_API_KEY`. Có thể thêm `CHAT_MODEL`, `LIVE_MODEL` nếu muốn đổi model, và `AUTH_SECRET` (chuỗi ngẫu nhiên từ 16 ký tự) để ký phiên đăng nhập; nếu không đặt, máy chủ tự sinh một khoá và lưu trong Netlify Blobs.
4. Deploy, rồi thử chat chữ và một cuộc gọi thoại.

Lưu ý: nếu đổi biến môi trường sau khi deploy, cần deploy lại để function nhận giá trị mới.

## Cấu trúc

```
public/            frontend (index.html, css/, js/)
netlify/functions/ chat.mjs, live-token.mjs
netlify.toml       cấu hình build, header bảo mật
.env.example       mẫu biến môi trường
```


## Trò chơi học tiếng Anh

Nút **Trò chơi** trên thanh công cụ (hoặc chip "Chơi game học tiếng Anh" ở màn hình chính) mở khu game, mỗi ván đều cộng XP:

- 🃏 **Ghép thẻ**: ghép từ tiếng Anh với nghĩa tiếng Việt.
- 🌧️ **Mưa chữ**: chạm đúng từ đang rơi trước khi chạm đất.
- ⚡ **Ngữ pháp nhanh**: điền khuyết có tính giờ, combo, 3 mạng.
- 🔤 **Đoán chữ**: đoán từ tiếng Anh từ nghĩa tiếng Việt.
- 🧩 **Xếp câu**: sắp xếp từ thành câu đúng.

- 🦖 **Khủng long gõ/đọc từ**: hoàn thành từ thì khủng long tự nhảy khi tới gần xương rồng.
- ✈️ **Máy bay bắn chim**: di chuyển máy bay (kéo màn hình, nút ◀ ▶ hoặc phím mũi tên), gõ từ để bắn đạn thẳng lên; cứ 5 từ có một vật phẩm; càng chơi lâu chim càng đông, nhanh và có loại khó hạ.
- 🐟 **Bắn cá**: chọn 1/2/3 phút, gõ từ trên cá để pháo bắn; cá nhỏ/vừa/lớn, cá vàng, cá nóc, boss; đạn có hạn; bong bóng vật phẩm.

Mã nguồn: `public/js/games.js` (logic), `public/js/games-arcade.js` (khủng long, máy bay), `public/js/games-fish.js` (bắn cá), `public/js/games-data.js` (kho từ, câu hỏi ngữ pháp, câu mẫu). Từ trong sổ từ của người dùng được trộn vào các game từ vựng.

## Chạy trên cả Netlify và GitHub Pages

- Đường dẫn CSS/JS là đường dẫn tương đối nên chạy được cả ở gốc domain (Netlify) lẫn thư mục con (`.../EngQuests/` trên GitHub Pages).
- `public/js/config.js`: trên `*.github.io` ứng dụng tự gọi API ở `https://engquests.netlify.app`; trên Netlify gọi `/api/...` cùng domain.
- `netlify/lib/cors.mjs`: cho phép `https://teelumm210.github.io` gọi API. Thêm domain khác bằng biến môi trường `ALLOWED_ORIGINS` (cách nhau bằng dấu phẩy).
- Site Netlify phải ở chế độ **công khai** thì trang GitHub Pages mới gọi được chat AI và gọi thoại.


## Tài khoản & đồng bộ

- Nút người ở góc trên phải mở khung đăng nhập / tạo tài khoản. Không đăng nhập vẫn dùng bình thường (dữ liệu nằm trong trình duyệt).
- Khi đăng nhập, dữ liệu trên máy được **gộp** với dữ liệu tài khoản (từ vựng hợp hai bên, XP/điểm game lấy giá trị lớn hơn) rồi tự đồng bộ sau mỗi thay đổi. Mã gộp: `public/js/sync-merge.js`; đồng bộ và giao diện: `public/js/accounts.js`.
- Tài khoản không có email nên không khôi phục được mật khẩu.

## Camera học từ

Chip "Săn từ, quét cảnh, dịch menu" (mã `public/js/quests.js`):

- 🎯 **Săn từ**: mỗi ngày 5 chữ cái (giống nhau trên mọi thiết bị), chụp vật có tên tiếng Anh bắt đầu bằng chữ đó. Đúng +20 XP (+10 nếu dùng gợi ý), xong cả 5 chữ +50 XP. Máy chủ tự kiểm tra chữ cái đầu.
- 🏠 **Khung cảnh**: AI nêu 10 từ trong ảnh, sau đó hỏi lại (gõ hoặc nói đáp án), mỗi câu đúng +5 XP.
- 🍽️ **Menu & biển hiệu**: giải nghĩa từng mục và lưu từ vào sổ.
- Trên điện thoại dùng ô chọn ảnh có `capture` (mở app camera, hoạt động cả khi trình duyệt chặn `getUserMedia`); trên máy tính có thêm nút webcam. Ảnh được thu nhỏ tại máy và không được lưu.

## Mic và trình duyệt

- `public/js/compat.js` nhận biết trình duyệt trong app (Zalo, Facebook, Messenger...) và trình duyệt không có micro, rồi hiện hướng dẫn mở bằng Safari/Chrome thay vì treo ở "Đang kết nối…". Kết nối cuộc gọi có giới hạn thời gian và báo lỗi rõ ràng.
- Lệnh "Có / Lưu đi / Yes / Save it" được nhận cả hai ngôn ngữ (`public/js/voice-commands.js`), và AI được dặn dựa vào âm thanh chứ không chờ bản chép lời.
- Icon Material tải với `display=block`; nếu font không tải được, icon tự chuyển sang emoji, không hiện chữ như `book_2`.

## Game

- **Khủng long gõ / đọc từ**: gõ xong từ thì khủng long tự nhảy khi tới gần xương rồng. Ô nhập không bị khoá giữa các xương rồng nên không phải chạm lại, bàn phím điện thoại giữ nguyên; chế độ đọc tự nghe lại sau lần bấm micro đầu tiên (trừ iPhone/iPad).
- **Đoán chữ**: nhìn hình (emoji, dữ liệu ở `PICTURE_WORDS` trong `public/js/games-data.js`) rồi đoán từ tiếng Anh; đoán xong mới hiện nghĩa tiếng Việt.

## Cấu hình AI (giảm lỗi "AI phản hồi quá lâu")

`netlify/lib/gemini.mjs` dùng chung cho `chat`, `vision`, `define`: model chính chạy trước, nếu sau ~6,5 giây chưa trả lời thì mở thêm model dự phòng **chạy song song** (ai xong trước thắng), lỗi tạm thời thì chuyển model ngay, và gọi với thinking tắt để trả lời nhanh (tự gọi lại bình thường nếu model từ chối cấu hình này).

## Cập nhật game

- **Khủng long đọc từ**: nhảy ngay khi kết quả nhận giọng tạm thời đã khớp từ, không chờ trình duyệt tự cắt (`earlyMatch` trong `SpeechListener`).
- **Mưa chữ**: 15 vòng, tốc độ tăng nhanh hơn, 5-7 bóng với đáp án nhiễu giống đáp án, bóng lắc ngang từ vòng 4, vòng chẵn từ vòng 6 đảo chiều (cho từ tiếng Anh, bắt nghĩa tiếng Việt).
- **Máy bay bắn chim**: mỗi từ gõ đúng bắn loạt đạn tự dẫn, mỗi con chim trên màn hình nhận đủ số viên để bị hạ.
