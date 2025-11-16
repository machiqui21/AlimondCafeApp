@echo off
echo ====================================================
echo XAMPP MySQL Emergency Recovery Script
echo ====================================================
echo.
echo WARNING: This will backup and reset MySQL data
echo Your databases will be lost unless you have a backup!
echo.
echo Press Ctrl+C to cancel, or
pause

echo.
echo Step 1: Stopping any MySQL processes...
taskkill /F /IM mysqld.exe 2>nul
timeout /t 2 /nobreak >nul

echo.
echo Step 2: Backing up current data folder...
if exist "C:\xampp\mysql\data_backup_%date:~-4,4%%date:~-10,2%%date:~-7,2%" (
    echo Backup already exists for today
) else (
    xcopy "C:\xampp\mysql\data" "C:\xampp\mysql\data_backup_%date:~-4,4%%date:~-10,2%%date:~-7,2%\" /E /I /H /Y
    echo Backup created
)

echo.
echo Step 3: Restoring clean MySQL data from backup...
if exist "C:\xampp\mysql\backup" (
    rd /S /Q "C:\xampp\mysql\data"
    xcopy "C:\xampp\mysql\backup" "C:\xampp\mysql\data\" /E /I /H /Y
    echo Clean data restored
) else (
    echo ERROR: No clean backup found at C:\xampp\mysql\backup
    echo You may need to reinstall XAMPP
    pause
    exit /b 1
)

echo.
echo Step 4: Setting permissions...
icacls "C:\xampp\mysql\data" /grant Everyone:F /T

echo.
echo Step 5: Starting MySQL...
cd /d "C:\xampp"
start "" "C:\xampp\mysql\bin\mysqld.exe" --defaults-file="C:\xampp\mysql\bin\my.ini" --standalone --console

timeout /t 5 /nobreak

echo.
echo Step 6: Creating alimondcafe database...
"C:\xampp\mysql\bin\mysql.exe" -u root -e "CREATE DATABASE IF NOT EXISTS alimondcafe CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo.
echo ====================================================
echo Done! MySQL should now be running.
echo.
echo Next steps:
echo 1. Test connection: node test-db-connection.js
echo 2. Import your database if you have SQL files
echo 3. Run your app: node app.js
echo ====================================================
pause
