@echo off
REM ============================================================
REM Remote Shutdown Script dengan Tailscale
REM Computer: 100.108.172.112 (Tailscale)
REM ============================================================

echo.
echo ========================================
echo   H.E.R.M.E.S. Remote Shutdown
echo   (via Tailscale)
echo ========================================
echo.

REM Configuration
set TAILSCALE_IP=100.108.172.112
set COMPUTER_USER=fiqih
set DASHBOARD_URL=http://100.108.172.112:3000

REM Check current status
echo [1/2] Checking current status (via Tailscale)...
ping -n 1 -w 1000 %TAILSCALE_IP% >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Computer is already OFF
    echo.
    pause
    exit /b 0
) else (
    echo ✅ Computer is ON
)

REM Confirm shutdown
echo.
echo ⚠️  WARNING: This will shutdown the computer!
echo    Dashboard: %DASHBOARD_URL%
echo.
set /p CONFIRM="Are you sure? (y/N): "
if /i not "%CONFIRM%"=="y" (
    echo Cancelled.
    pause
    exit /b 0
)

REM Send shutdown command via SSH (Tailscale)
echo.
echo [2/2] Sending shutdown command (via Tailscale SSH)...
ssh %COMPUTER_USER%@%TAILSCALE_IP% "shutdown /s /t 60 /c \"Remote shutdown from Hermes VPS\""

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   Shutdown command sent!
    echo ========================================
    echo.
    echo Computer will shutdown in 60 seconds.
    echo.
    echo To cancel shutdown on computer:
    echo   shutdown /a
    echo.
) else (
    echo.
    echo ❌ Failed to send shutdown command
    echo.
    echo Possible issues:
    echo 1. SSH server not running on computer
    echo 2. Firewall blocking SSH (port 22)
    echo 3. Wrong username or password
    echo 4. Tailscale connection issue
    echo.
)

pause
