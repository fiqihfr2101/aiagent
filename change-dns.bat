@echo off
REM ============================================================
REM Change DNS to Google DNS (8.8.8.8) and Cloudflare DNS (1.1.1.1)
REM Jalankan sebagai Administrator!
REM ============================================================

echo.
echo ========================================
echo   Change DNS Settings
echo ========================================
echo.

REM Check if running as admin
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Please run as Administrator!
    echo Right-click and select "Run as administrator"
    pause
    exit /b 1
)

echo [1/3] Setting DNS for Wi-Fi...
netsh interface ip set dns "Wi-Fi" static 8.8.8.8
netsh interface ip add dns "Wi-Fi" 1.1.1.1 index=2

echo.
echo [2/3] Setting DNS for Ethernet...
netsh interface ip set dns "Ethernet" static 8.8.8.8
netsh interface ip add dns "Ethernet" 1.1.1.1 index=2

echo.
echo [3/3] Flushing DNS cache...
ipconfig /flushdns

echo.
echo ========================================
echo   DNS Settings Updated!
echo ========================================
echo.
echo Primary DNS: 8.8.8.8 (Google)
echo Secondary DNS: 1.1.1.1 (Cloudflare)
echo.
echo Test: https://api.orc.routex.web.id/health
echo.
pause
