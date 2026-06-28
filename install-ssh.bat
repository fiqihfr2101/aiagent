@echo off
REM ============================================================
REM Install SSH Server di Windows
REM Jalankan sebagai Administrator!
REM ============================================================

echo.
echo ========================================
echo   Install SSH Server
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

echo [1/4] Installing OpenSSH Server...
powershell -Command "Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0"

if %errorlevel% neq 0 (
    echo ❌ Failed to install OpenSSH Server
    pause
    exit /b 1
)

echo.
echo [2/4] Starting SSH service...
net start sshd

echo.
echo [3/4] Setting SSH to auto-start...
sc config sshd start=auto

echo.
echo [4/4] Configuring firewall...
netsh advfirewall firewall add rule name="SSH Server" dir=in action=allow protocol=TCP localport=22

echo.
echo ========================================
echo   SSH Server installed successfully!
echo ========================================
echo.
echo SSH is now running on port 22.
echo.
echo Test from another device:
echo   ssh fiqih@100.108.172.112
echo.
pause
