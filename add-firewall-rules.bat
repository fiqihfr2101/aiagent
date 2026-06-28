@echo off
REM add-firewall-rules.bat
REM Jalankan sebagai Administrator (klik kanan > Run as administrator)

echo Adding firewall rules for Hermes Dashboard...

netsh advfirewall firewall add rule name="Hermes Dashboard Frontend" dir=in action=allow protocol=TCP localport=3000
netsh advfirewall firewall add rule name="Hermes Dashboard Backend" dir=in action=allow protocol=TCP localport=8000
netsh advfirewall firewall add rule name="Hermes Temporal UI" dir=in action=allow protocol=TCP localport=8080
netsh advfirewall firewall add rule name="Hermes Temporal gRPC" dir=in action=allow protocol=TCP localport=7233
netsh advfirewall firewall add rule name="Hermes Redis" dir=in action=allow protocol=TCP localport=6379
netsh advfirewall firewall add rule name="Hermes PostgreSQL" dir=in action=allow protocol=TCP localport=5432

echo.
echo Firewall rules added successfully!
echo.
echo You can now access the dashboard from other devices:
echo   Frontend: http://192.168.0.105:3000
echo   Backend:  http://192.168.0.105:8000
echo.
pause
