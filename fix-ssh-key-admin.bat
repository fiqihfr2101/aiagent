@echo off
REM ============================================================
REM Fix SSH Key untuk Administrator
REM Jalankan sebagai Administrator!
REM ============================================================

echo.
echo ========================================
echo   Fix SSH Key untuk Administrator
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

REM Add SSH key to administrators_authorized_keys
echo [1/3] Adding SSH key to administrators_authorized_keys...
echo %SSH_KEY% >> "C:\ProgramData\ssh\administrators_authorized_keys"
echo ✅ SSH key added

REM Set permissions
echo.
echo [2/3] Setting permissions...
icacls "C:\ProgramData\ssh\administrators_authorized_keys" /inheritance:r /grant:r "SYSTEM:F"
icacls "C:\ProgramData\ssh\administrators_authorized_keys" /inheritance:r /grant:r "Administrators:F"
icacls "C:\ProgramData\ssh\administrators_authorized_keys" /inheritance:r /grant:r "qoinj:F"
echo ✅ Permissions set

REM Restart SSH service
echo.
echo [3/3] Restarting SSH service...
net stop sshd
net start sshd
echo ✅ SSH service restarted

echo.
echo ========================================
echo   SSH Key Fix Complete!
echo ========================================
echo.
echo SSH Key: hermes-vps
echo Location: C:\ProgramData\ssh\administrators_authorized_keys
echo.
echo Test from VPS:
echo   ssh qoinj@100.108.172.112
echo.
pause
