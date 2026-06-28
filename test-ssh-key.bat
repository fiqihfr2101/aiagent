@echo off
REM ============================================================
REM Test SSH Key Authentication dari VPS
REM ============================================================

echo.
echo ========================================
echo   Test SSH Key Authentication
echo ========================================
echo.

REM Configuration
set TAILSCALE_IP=100.108.172.112
set COMPUTER_USER=fiqih

REM Check if SSH key is in authorized_keys
echo [1/2] Checking SSH key...
findstr /i "hermes-vps" "%USERPROFILE%\.ssh\authorized_keys" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ SSH key found in authorized_keys
) else (
    echo ❌ SSH key NOT found in authorized_keys
    echo.
    echo Please add the SSH key first.
    pause
    exit /b 1
)

REM Test SSH connection
echo.
echo [2/2] Testing SSH connection (key auth)...
echo Connecting to %COMPUTER_USER%@%TAILSCALE_IP%...
echo.

ssh -o BatchMode=yes -o ConnectTimeout=5 %COMPUTER_USER%@%TAILSCALE_IP% "echo SSH key authentication successful! && exit"

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   SSH key authentication successful!
    echo ========================================
    echo.
    echo VPS can now connect without password:
    echo   ssh %COMPUTER_USER%@%TAILSCALE_IP%
    echo.
) else (
    echo.
    echo ❌ SSH key authentication failed
    echo.
    echo Possible issues:
    echo 1. SSH key not properly added
    echo 2. SSH server not running
    echo 3. Firewall blocking port 22
    echo 4. Tailscale connection issue
    echo.
    echo Try with password first:
    echo   ssh %COMPUTER_USER%@%TAILSCALE_IP%
    echo.
)

pause
