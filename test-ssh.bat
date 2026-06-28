@echo off
REM ============================================================
REM Test SSH Connection
REM ============================================================

echo.
echo ========================================
echo   Test SSH Connection
echo ========================================
echo.

REM Configuration
set TAILSCALE_IP=100.108.172.112
set COMPUTER_USER=fiqih

REM Check if SSH is running
echo [1/2] Checking SSH service...
net start | findstr /i "ssh" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ SSH service is running
) else (
    echo ❌ SSH service is NOT running
    echo.
    echo Please run install-ssh.bat as Administrator first.
    pause
    exit /b 1
)

REM Test SSH connection
echo.
echo [2/2] Testing SSH connection...
echo Connecting to %COMPUTER_USER%@%TAILSCALE_IP%...
echo.

ssh %COMPUTER_USER%@%TAILSCALE_IP% "echo SSH connection successful! && exit"

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   SSH connection successful!
    echo ========================================
    echo.
    echo You can now use SSH to connect to this computer:
    echo   ssh %COMPUTER_USER%@%TAILSCALE_IP%
    echo.
) else (
    echo.
    echo ❌ SSH connection failed
    echo.
    echo Possible issues:
    echo 1. SSH server not running
    echo 2. Firewall blocking port 22
    echo 3. Wrong username or password
    echo 4. Tailscale connection issue
    echo.
)

pause
