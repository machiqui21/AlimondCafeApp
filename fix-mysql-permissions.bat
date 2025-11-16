@echo off
echo ========================================
echo MySQL Permission Fix for XAMPP
echo ========================================
echo.
echo This script will:
echo 1. Stop MySQL if running
echo 2. Fix file permissions
echo 3. Restart MySQL
echo.
pause

echo.
echo Stopping MySQL...
taskkill /F /IM mysqld.exe 2>nul
timeout /t 2 /nobreak >nul

echo.
echo Fixing permissions on MySQL data directory...
icacls "C:\xampp\mysql\data" /grant Everyone:F /T

echo.
echo Fixing permissions on ibdata1...
icacls "C:\xampp\mysql\data\ibdata1" /grant Everyone:F

echo.
echo Starting MySQL via XAMPP Control Panel...
start "" "C:\xampp\xampp-control.exe"

echo.
echo ========================================
echo Done!
echo.
echo Please use XAMPP Control Panel to start MySQL.
echo Then run: node test-db-connection.js
echo ========================================
pause
