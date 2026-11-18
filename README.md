# EngQuests - Trợ lý học tiếng Anh với AI

Chat, giọng nói thời gian thực (Gemini Live) và nhận diện đồ vật qua camera để học từ vựng tiếng Anh.

## Kiến trúc

- **Frontend** (`public/`): HTML/CSS/JS thuần, không cần build.
- **Backend** (`netlify/functions/`): API key Gemini nằm trên server, trình duyệt không bao giờ thấy.
  - `POST /api/chat`: proxy chat chữ. Persona, model và giới hạn token do server quyết định.
  - `POST /api/live-token`: cấp token tạm (dùng 1 lần, tối đa 30 phút) để trình duyệt mở WebSocket Gemini Live. Model và persona bị khoá trong token.
  - Giới hạn tần suất theo IP khai báo trong `config.rateLimit` của từng function.
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
3. Site configuration > Environment variables: thêm `GEMINI_API_KEY`. Có thể thêm `CHAT_MODEL`, `LIVE_MODEL` nếu muốn đổi model.
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

Mã nguồn: `public/js/games.js` (logic), `public/js/games-data.js` (kho từ, câu hỏi ngữ pháp, câu mẫu). Từ trong sổ từ của người dùng được trộn vào các game từ vựng.

## Chạy trên cả Netlify và GitHub Pages

- Đường dẫn CSS/JS là đường dẫn tương đối nên chạy được cả ở gốc domain (Netlify) lẫn thư mục con (`.../EngQuests/` trên GitHub Pages).
- `public/js/config.js`: trên `*.github.io` ứng dụng tự gọi API ở `https://engquests.netlify.app`; trên Netlify gọi `/api/...` cùng domain.
- `netlify/lib/cors.mjs`: cho phép `https://teelumm210.github.io` gọi API. Thêm domain khác bằng biến môi trường `ALLOWED_ORIGINS` (cách nhau bằng dấu phẩy).
- Site Netlify phải ở chế độ **công khai** thì trang GitHub Pages mới gọi được chat AI và gọi thoại.
