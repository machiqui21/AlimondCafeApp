@echo off
echo ====================================================
echo Setup New XAMPP with Existing Database
echo ====================================================
echo.
echo Before running this script, make sure:
echo 1. You have installed the new XAMPP
echo 2. You know the installation path (e.g., C:\xampp or C:\xampp2)
echo.
set /p XAMPP_PATH="Enter your new XAMPP installation path (e.g., C:\xampp): "

if not exist "%XAMPP_PATH%\mysql\bin\mysqld.exe" (
    echo ERROR: MySQL not found at %XAMPP_PATH%\mysql\bin\mysqld.exe
    echo Please check the path and try again.
    pause
    exit /b 1
)

echo.
echo Using XAMPP at: %XAMPP_PATH%
echo.
pause

echo.
echo Step 1: Stopping any existing MySQL...
taskkill /F /IM mysqld.exe 2>nul
timeout /t 2 /nobreak >nul

echo.
echo Step 2: Copying your alimondcafe database...
if not exist "%XAMPP_PATH%\mysql\data\alimondcafe" (
    mkdir "%XAMPP_PATH%\mysql\data\alimondcafe"
)
xcopy "C:\xampp\mysql\data_backup_20251116\alimondcafe" "%XAMPP_PATH%\mysql\data\alimondcafe\" /E /I /H /Y
echo Database copied successfully

echo.
echo Step 3: Setting permissions...
icacls "%XAMPP_PATH%\mysql\data" /grant Everyone:F /T

echo.
echo Step 4: Starting MySQL from new XAMPP...
start "" "%XAMPP_PATH%\mysql\bin\mysqld.exe" --defaults-file="%XAMPP_PATH%\mysql\bin\my.ini" --standalone --console

echo.
echo Waiting for MySQL to start...
timeout /t 5 /nobreak

echo.
echo Step 5: Verifying database exists...
"%XAMPP_PATH%\mysql\bin\mysql.exe" -u root -e "SHOW DATABASES;"

echo.
echo Step 6: Updating your .env file...
echo Creating .env with new XAMPP settings...
(
echo # MySQL Database Configuration
echo DB_HOST=localhost
echo DB_PORT=3306
echo DB_USER=root
echo DB_PASSWORD=
echo DB_NAME=alimondcafe
echo.
echo # Optional: Keep-alive interval in milliseconds
echo KEEPALIVE_MS=30000
) > "%~dp0.env"

echo.
echo ====================================================
echo Setup Complete!
echo.
echo MySQL is running from: %XAMPP_PATH%
echo Database 'alimondcafe' has been restored.
echo.
echo Next steps:
echo 1. Open a NEW terminal window
echo 2. Run: node test-db-connection.js
echo 3. Run: node app.js
echo.
echo Keep this window open to see MySQL logs.
echo ====================================================
pause
