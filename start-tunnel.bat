@echo off
REM ============================================================
REM Start Cloudflare Tunnel untuk H.E.R.M.E.S. Dashboard
REM ============================================================

echo.
echo ========================================
echo  Starting H.E.R.M.E.S. Cloudflare Tunnel
echo  Domain: orc.frackment.id
echo ========================================
echo.

REM Cek apakah tunnel sudah dikonfigurasi
if not exist "%USERPROFILE%\.cloudflared\config.yml" (
    echo ERROR: Tunnel belum dikonfigurasi!
    echo Jalankan setup-cloudflare-tunnel.bat terlebih dahulu.
    echo.
    pause
    exit /b 1
)

REM Cek apakah Docker containers running
echo [1/3] Checking Docker containers...
docker ps --format "table {{.Names}}\t{{.Status}}" | findstr "aiagent" >nul
if %errorlevel% neq 0 (
    echo WARNING: Docker containers belum running!
    echo Starting Docker containers...
    cd /d "C:\Users\qoinj\Documents\Fiqih\AIAgent"
    docker-compose up -d
    echo.
)

REM Cek apakah backend dan frontend running
echo [2/3] Checking services...
curl -s http://localhost:8000/health >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Backend tidak running di port 8000!
    pause
    exit /b 1
)

curl -s http://localhost:3000 >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Frontend tidak running di port 3000!
    pause
    exit /b 1
)

echo [3/3] Starting Cloudflare Tunnel...
echo.
echo ========================================
echo  Dashboard: https://orc.frackment.id
echo  API: https://api.orc.frackment.id
echo ========================================
echo.
echo Tekan Ctrl+C untuk stop tunnel
echo.

REM Start tunnel
"C:\Users\qoinj\cloudflared.exe" tunnel run hermes-dashboard

echo.
echo Tunnel stopped.
pause
