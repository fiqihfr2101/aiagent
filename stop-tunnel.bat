@echo off
REM ============================================================
REM Stop Cloudflare Tunnel
REM ============================================================

echo.
echo Stopping Cloudflare Tunnel...
echo.

REM Find and kill cloudflared process
taskkill /F /IM cloudflared.exe 2>nul

if %errorlevel% equ 0 (
    echo Tunnel stopped successfully!
) else (
    echo Tunnel tidak ditemukan atau sudah stopped.
)

echo.
pause
