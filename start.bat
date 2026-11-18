@echo off
chcp 65001 >nul
title EngQuests - Trợ lý học tiếng Anh
color 0B

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║     📚 EngQuests - Khởi động ứng dụng        ║
echo  ╠══════════════════════════════════════════╣
echo  ║  Trợ lý học tiếng Anh thông minh với AI  ║
echo  ╚══════════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: Kiểm tra Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo  [LỖI] Không tìm thấy Node.js!
    echo  Vui lòng cài đặt tại: https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Hiển thị Node version
for /f "tokens=*" %%v in ('node -v') do echo  [OK] Node.js %%v

:: Kiểm tra node_modules
if not exist "node_modules\" (
    echo.
    echo  [*] Đang cài đặt dependencies...
    call npm install
    if %errorlevel% neq 0 (
        color 0C
        echo  [LỖI] Cài đặt dependencies thất bại!
        pause
        exit /b 1
    )
    echo  [OK] Dependencies đã cài xong!
)

:: Kiểm tra .env
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo.
        color 0E
        echo  ╔══════════════════════════════════════════╗
        echo  ║  ⚠️  CHƯA CÓ API KEY!                    ║
        echo  ╠══════════════════════════════════════════╣
        echo  ║  1. Truy cập: aistudio.google.com/apikey ║
        echo  ║  2. Tạo API Key (miễn phí)               ║
        echo  ║  3. Nhập API Key bên dưới                 ║
        echo  ╚══════════════════════════════════════════╝
        echo.
        set /p API_KEY="  Nhập Gemini API Key: "
        if defined API_KEY (
            echo GEMINI_API_KEY=%API_KEY%> .env
            color 0B
            echo  [OK] Đã lưu API Key!
        ) else (
            echo  [SKIP] Bỏ qua - bạn cần thêm key vào file .env sau.
        )
    )
) else (
    :: Kiểm tra xem .env có key thật chưa
    findstr /C:"your_gemini_api_key_here" ".env" >nul 2>nul
    if %errorlevel% equ 0 (
        echo.
        color 0E
        echo  ⚠️  API Key trong .env vẫn là giá trị mẫu!
        echo.
        set /p API_KEY="  Nhập Gemini API Key (Enter để bỏ qua): "
        if defined API_KEY (
            echo GEMINI_API_KEY=%API_KEY%> .env
            color 0B
            echo  [OK] Đã cập nhật API Key!
        )
    ) else (
        echo  [OK] File .env đã có API Key
    )
)

echo.
echo  ──────────────────────────────────────────
echo  🚀 Đang khởi động EngQuests...
echo  ──────────────────────────────────────────
echo.
echo  Ứng dụng sẽ mở tại: http://localhost:8888
echo  Nhấn Ctrl+C để dừng server
echo.

:: Mở trình duyệt sau 3 giây
start "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:8888"

:: Chạy Netlify Dev
call npx netlify-cli dev
