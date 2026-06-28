@echo off
REM ============================================================
REM Verify SSH Key Configuration
REM ============================================================

echo.
echo ========================================
echo   Verify SSH Key Configuration
echo ========================================
echo.

REM Check if authorized_keys exists
echo [1/3] Checking authorized_keys...
if exist "%USERPROFILE%\.ssh\authorized_keys" (
    echo ✅ authorized_keys exists
) else (
    echo ❌ authorized_keys does NOT exist
    echo.
    echo Please run setup-ssh-key.bat as Administrator first.
    pause
    exit /b 1
)

REM Check if SSH key is in authorized_keys
echo.
echo [2/3] Checking SSH key...
findstr /i "hermes-vps" "%USERPROFILE%\.ssh\authorized_keys" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ SSH key found (hermes-vps)
) else (
    echo ❌ SSH key NOT found
    echo.
    echo Please add the SSH key:
    echo   ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH1Cvr/kwd1y/3mekiXu3s88/XJGnfZFIIo/uZs1PWdj hermes-vps
    echo.
    pause
    exit /b 1
)

REM Check permissions
echo.
echo [3/3] Checking permissions...
icacls "%USERPROFILE%\.ssh\authorized_keys" | findstr /i "%USERNAME%" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Permissions correct
) else (
    echo ❌ Permissions may be incorrect
    echo.
    echo Run setup-ssh-key.bat as Administrator to fix.
    echo.
)

echo.
echo ========================================
echo   Summary
echo ========================================
echo.
echo SSH Key: hermes-vps
echo Location: %USERPROFILE%\.ssh\authorized_keys
echo.
echo Test from VPS:
echo   ssh -o BatchMode=yes fiqih@100.108.172.112 "echo OK"
echo.
pause
