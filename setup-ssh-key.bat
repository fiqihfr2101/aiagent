@echo off
REM ============================================================
REM Setup SSH Key Authentication
REM Jalankan sebagai Administrator!
REM ============================================================

echo.
echo ========================================
echo   Setup SSH Key Authentication
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

REM Configuration
set SSH_KEY=ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH1Cvr/kwd1y/3mekiXu3s88/XJGnfZFIIo/uZs1PWdj hermes-vps

REM Create .ssh directory if not exists
echo [1/4] Creating .ssh directory...
if not exist "%USERPROFILE%\.ssh" (
    mkdir "%USERPROFILE%\.ssh"
    echo ✅ Created .ssh directory
) else (
    echo ✅ .ssh directory exists
)

REM Add SSH key to authorized_keys
echo.
echo [2/4] Adding SSH key to authorized_keys...
echo %SSH_KEY% >> "%USERPROFILE%\.ssh\authorized_keys"
echo ✅ SSH key added

REM Set permissions
echo.
echo [3/4] Setting permissions...
icacls "%USERPROFILE%\.ssh" /inheritance:r /grant:r "%USERNAME%:F"
icacls "%USERPROFILE%\.ssh\authorized_keys" /inheritance:r /grant:r "%USERNAME%:F"
echo ✅ Permissions set

REM Restart SSH service
echo.
echo [4/4] Restarting SSH service...
net stop sshd
net start sshd
echo ✅ SSH service restarted

echo.
echo ========================================
echo   SSH Key Authentication Setup Complete!
echo ========================================
echo.
echo SSH Key: hermes-vps
echo.
echo Test from VPS:
echo   ssh fiqih@100.108.172.112
echo.
pause
