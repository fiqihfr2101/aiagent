@echo off
REM ============================================================
REM Check SSH Status
REM ============================================================

echo.
echo ========================================
echo   Check SSH Status
echo ========================================
echo.

REM Check if SSH server is installed
echo [1/3] Checking SSH server installation...
if exist "C:\Windows\System32\OpenSSH\sshd.exe" (
    echo ✅ SSH server is installed
) else (
    echo ❌ SSH server is NOT installed
    echo.
    echo Please run install-ssh.bat as Administrator first.
    pause
    exit /b 1
)

REM Check if SSH service is running
echo.
echo [2/3] Checking SSH service status...
net start | findstr /i "ssh" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ SSH service is running
) else (
    echo ❌ SSH service is NOT running
    echo.
    echo Start with: net start sshd
    echo.
)

REM Check firewall rule
echo.
echo [3/3] Checking firewall rule...
netsh advfirewall firewall show rule name="SSH Server" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Firewall rule exists
) else (
    echo ❌ Firewall rule does NOT exist
    echo.
    echo Add with: netsh advfirewall firewall add rule name="SSH Server" dir=in action=allow protocol=TCP localport=22
    echo.
)

echo.
echo ========================================
echo   Summary
echo ========================================
echo.
echo SSH Server: C:\Windows\System32\OpenSSH\sshd.exe
echo Service: sshd
echo Port: 22
echo.
echo Connect from another device:
echo   ssh fiqih@100.108.172.112
echo.
pause
