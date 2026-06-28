@echo off
REM ============================================================
REM Verify SSH Key untuk Administrator
REM ============================================================

echo.
echo ========================================
echo   Verify SSH Key untuk Administrator
echo ========================================
echo.

REM Check if administrators_authorized_keys exists
echo [1/3] Checking administrators_authorized_keys...
if exist "C:\ProgramData\ssh\administrators_authorized_keys" (
    echo ✅ administrators_authorized_keys exists
) else (
    echo ❌ administrators_authorized_keys does NOT exist
    echo.
    echo Please run fix-ssh-key-admin.bat as Administrator first.
    pause
    exit /b 1
)

REM Check if SSH key is in administrators_authorized_keys
echo.
echo [2/3] Checking SSH key...
findstr /i "hermes-vps" "C:\ProgramData\ssh\administrators_authorized_keys" >nul 2>&1
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
icacls "C:\ProgramData\ssh\administrators_authorized_keys" | findstr /i "qoinj" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Permissions correct
) else (
    echo ❌ Permissions may be incorrect
    echo.
    echo Run fix-ssh-key-admin.bat as Administrator to fix.
    echo.
)

echo.
echo ========================================
echo   Summary
echo ========================================
echo.
echo SSH Key: hermes-vps
echo Location: C:\ProgramData\ssh\administrators_authorized_keys
echo Username: qoinj
echo.
echo Test from VPS:
echo   ssh -o BatchMode=yes qoinj@100.108.172.112 "echo OK"
echo.
pause
