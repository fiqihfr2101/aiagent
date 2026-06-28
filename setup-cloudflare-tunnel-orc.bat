@echo off
REM ============================================================
REM Cloudflare Tunnel Setup untuk orc.routex.web.id
REM ============================================================

echo.
echo ========================================
echo   Cloudflare Tunnel Setup
echo   Domain: orc.routex.web.id
echo ========================================
echo.

REM Step 1: Login ke Cloudflare
echo [Step 1/6] Login ke Cloudflare...
echo.
echo Browser akan terbuka, silakan:
echo 1. Login ke Cloudflare
echo 2. Pilih domain: routex.web.id
echo 3. Klik "Authorize"
echo.
pause
"C:\Users\qoinj\cloudflared.exe" tunnel login

echo.
echo [Step 1/6] Login berhasil!
echo.

REM Step 2: Buat Tunnel
echo [Step 2/6] Membuat tunnel...
"C:\Users\qoinj\cloudflared.exe" tunnel create hermes-dashboard
echo.

REM Step 3: Dapatkan Tunnel ID
echo [Step 3/6] Mendapatkan Tunnel ID...
echo.
echo Silakan copy Tunnel ID dari output di atas
echo dan paste di sini:
echo.
set /p TUNNEL_ID="Tunnel ID: "

echo.
echo Tunnel ID: %TUNNEL_ID%
echo.

REM Step 4: Buat config file
echo [Step 4/6] Membuat konfigurasi...
mkdir "%USERPROFILE%\.cloudflared" 2>nul

(
echo tunnel: %TUNNEL_ID%
echo credentials-file: %USERPROFILE%\.cloudflared\%TUNNEL_ID%.json
echo.
echo ingress:
echo   # Dashboard
echo   - hostname: orc.routex.web.id
echo     service: http://localhost:3000
echo     originRequest:
echo       noTLSVerify: true
echo.
echo   # API
echo   - hostname: api.orc.routex.web.id
echo     service: http://localhost:8000
echo     originRequest:
echo       noTLSVerify: true
echo.
echo   # Catch-all
echo   - service: http_status:404
) > "%USERPROFILE%\.cloudflared\config.yml"

echo Konfigurasi berhasil dibuat!
echo Lokasi: %USERPROFILE%\.cloudflared\config.yml
echo.

REM Step 5: Setup DNS
echo [Step 5/6] Setup DNS Records
echo.
echo ============================================================
echo  SILAKAN TAMBAHKAN DNS RECORDS DI CLOUDFLARE:
echo ============================================================
echo.
echo  1. Buka: https://dash.cloudflare.com
echo  2. Pilih domain: routex.web.id
echo  3. Klik "DNS" -^> "Records"
echo  4. Tambah 2 CNAME records:
echo.
echo  +---------+------------------+----------------------------------------+---------+
echo  ^| Type    ^| Name             ^| Target                                 ^| Proxy   ^|
echo  +---------+------------------+----------------------------------------+---------+
echo  ^| CNAME   ^| orc              ^| %TUNNEL_ID%.cfargotunnel.com ^| Proxied ^|
echo  +---------+------------------+----------------------------------------+---------+
echo  ^| CNAME   ^| api.orc          ^| %TUNNEL_ID%.cfargotunnel.com ^| Proxied ^|
echo  +---------+------------------+----------------------------------------+---------+
echo.
echo  5. Klik "Save" untuk kedua records
echo.
echo ============================================================
echo.
pause

REM Step 6: Test Tunnel
echo.
echo [Step 6/6] Testing tunnel...
echo.
echo Tekan Ctrl+C untuk stop test
echo.
"C:\Users\qoinj\cloudflared.exe" tunnel run hermes-dashboard

echo.
echo ============================================================
echo  SETUP SELESAI!
echo ============================================================
echo.
echo  Dashboard: https://orc.routex.web.id
echo  API: https://api.orc.routex.web.id
echo.
echo  Untuk menjalankan tunnel:
echo  "C:\Users\qoinj\cloudflared.exe" tunnel run hermes-dashboard
echo.
echo  Untuk auto-start, buat Task Scheduler:
echo  1. Buka Task Scheduler
echo  2. Create Basic Task
echo  3. Trigger: At startup
echo  4. Action: Start a program
echo  5. Program: C:\Users\qoinj\cloudflared.exe
echo  6. Arguments: tunnel run hermes-dashboard
echo ============================================================
echo.
pause
