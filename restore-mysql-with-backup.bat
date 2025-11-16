@echo off
echo ====================================================
echo XAMPP MySQL Recovery with Database Restore
echo ====================================================
echo.
echo This will:
echo 1. Reset MySQL to clean state
echo 2. Restore your alimondcafe database from backup
echo.
pause

echo.
echo Step 1: Stopping MySQL...
taskkill /F /IM mysqld.exe 2>nul
timeout /t 2 /nobreak >nul

echo.
echo Step 2: Resetting MySQL data folder...
if exist "C:\xampp\mysql\backup" (
    rd /S /Q "C:\xampp\mysql\data"
    xcopy "C:\xampp\mysql\backup" "C:\xampp\mysql\data\" /E /I /H /Y
    echo Clean data restored
) else (
    echo ERROR: No clean backup found at C:\xampp\mysql\backup
    pause
    exit /b 1
)

echo.
echo Step 3: Copying your alimondcafe database back...
xcopy "C:\xampp\mysql\data_backup_20251116\alimondcafe" "C:\xampp\mysql\data\alimondcafe\" /E /I /H /Y
echo Database restored

echo.
echo Step 4: Setting permissions...
icacls "C:\xampp\mysql\data" /grant Everyone:F /T
icacls "C:\xampp\mysql\data\ibdata1" /grant Everyone:F

echo.
echo Step 5: Starting MySQL...
start "" "C:\xampp\mysql\bin\mysqld.exe" --defaults-file="C:\xampp\mysql\bin\my.ini" --standalone --console

echo.
echo Waiting for MySQL to start...
timeout /t 5 /nobreak

echo.
echo Step 6: Verifying database...
"C:\xampp\mysql\bin\mysql.exe" -u root -e "SHOW DATABASES;"

echo.
echo ====================================================
echo Done! Your alimondcafe database has been restored.
echo.
echo MySQL is now running in the background.
echo.
echo Next step: In a NEW terminal, run:
echo   node test-db-connection.js
echo.
echo Keep this window open to see MySQL logs.
echo ====================================================
echo.
pause
