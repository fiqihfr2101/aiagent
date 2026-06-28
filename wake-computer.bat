@echo off
REM ============================================================
REM Wake-on-LAN Script dengan Tailscale
REM Computer: 100.108.172.112 (Tailscale)
REM MAC: 9C:69:D3:70:D7:03
REM ============================================================

echo.
echo ========================================
echo   H.E.R.M.E.S. Wake-on-LAN Script
echo   (via Tailscale)
echo ========================================
echo.

REM Configuration
set MAC_ADDRESS=9C:69:D3:70:D7:03
set TAILSCALE_IP=100.108.172.112
set BROADCAST=255.255.255.255
set DASHBOARD_URL=http://100.108.172.112:3000
set API_URL=http://100.108.172.112:8000

REM Check current status via Tailscale
echo [1/3] Checking current status (via Tailscale)...
ping -n 1 -w 1000 %TAILSCALE_IP% >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Computer is already ON
    echo.
    echo Dashboard: %DASHBOARD_URL%
    echo API: %API_URL%
    echo.
    pause
    exit /b 0
) else (
    echo ❌ Computer is OFF
)

REM Send WoL packet
echo.
echo [2/3] Sending Wake-on-LAN packet...
echo MAC Address: %MAC_ADDRESS%
echo Broadcast: %BROADCAST%

python -c "import socket; mac_bytes = bytes.fromhex('%MAC_ADDRESS%'.replace(':', '').replace('-', '')); magic_packet = b'\xff' * 6 + mac_bytes * 16; sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1); sock.sendto(magic_packet, ('%BROADCAST%', 9)); sock.close(); print('✅ WoL packet sent successfully!')"

if %errorlevel% neq 0 (
    echo ❌ Failed to send WoL packet
    pause
    exit /b 1
)

REM Wait for computer to boot
echo.
echo [3/3] Waiting for computer to boot...
echo (This may take 30-60 seconds)
echo.

set ATTEMPTS=0
set MAX_ATTEMPTS=30

:CHECK_LOOP
set /a ATTEMPTS+=1
echo Checking... (%ATTEMPTS%/%MAX_ATTEMPTS%)

ping -n 1 -w 1000 %TAILSCALE_IP% >nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   Computer is now ON! (via Tailscale)
    echo ========================================
    echo.
    echo Dashboard: %DASHBOARD_URL%
    echo API: %API_URL%
    echo.
    echo Tip: It may take 1-2 minutes for Docker containers to start
    pause
    exit /b 0
)

if %ATTEMPTS% geq %MAX_ATTEMPTS% goto TIMEOUT

timeout /t 2 /nobreak >nul
goto CHECK_LOOP

:TIMEOUT
echo.
echo ========================================
echo   Timeout: Computer did not respond
echo ========================================
echo.
echo Possible issues:
echo 1. Computer is not connected to power
echo 2. Ethernet cable is disconnected
echo 3. Wake-on-LAN is not enabled in BIOS
echo 4. Wake-on-LAN is not enabled in Windows
echo 5. Firewall is blocking WoL packets
echo.
pause
exit /b 1
