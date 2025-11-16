# MySQL Connection Issues - Troubleshooting Guide

## Problem Identified
Your MySQL server in XAMPP has file permission issues preventing it from starting properly. The process is running but can't access its data files.

## Quick Fix Steps

### Step 1: Run Permission Fix (AS ADMINISTRATOR)
1. Right-click on `fix-mysql-permissions.bat` in your project folder
2. Select "Run as administrator"
3. Follow the prompts

### Step 2: Start MySQL via XAMPP Control Panel
1. Open XAMPP Control Panel (it should open automatically from the batch file)
2. Click "Start" next to MySQL
3. Wait for it to turn green

### Step 3: Create the Database
Once MySQL is running, create the `alimondcafe` database:

**Option A: Using phpMyAdmin**
1. Open http://localhost/phpmyadmin/
2. Click "New" in the left sidebar
3. Database name: `alimondcafe`
4. Collation: `utf8mb4_unicode_ci`
5. Click "Create"

**Option B: Using Command Line**
```powershell
& "C:\xampp\mysql\bin\mysql.exe" -u root -e "CREATE DATABASE IF NOT EXISTS alimondcafe CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### Step 4: Import Database Schema (if you have one)
If you have SQL files in your migrations folder:
```powershell
Get-ChildItem migrations/*.sql | ForEach-Object {
    & "C:\xampp\mysql\bin\mysql.exe" -u root alimondcafe < $_.FullName
}
```

### Step 5: Test Connection
```powershell
node test-db-connection.js
```

### Step 6: Run Your App
```powershell
node app.js
```

## Alternative: Manual Permission Fix

If the batch file doesn't work:

1. **Open Command Prompt as Administrator**
   - Press Windows key
   - Type "cmd"
   - Right-click "Command Prompt"
   - Select "Run as administrator"

2. **Run these commands:**
```cmd
cd C:\xampp\mysql\data
icacls . /grant Everyone:F /T
icacls ibdata1 /grant Everyone:F
```

3. **Restart MySQL from XAMPP Control Panel**

## Common Issues

### "Access Denied" when running batch file
- You must run as administrator (right-click → Run as administrator)

### MySQL still won't start
- Check if another MySQL service is running:
  ```powershell
  Get-Service | Where-Object {$_.Name -like "*mysql*"}
  ```
- Stop conflicting MySQL services via Services.msc

### Port 3306 is blocked
- Check Windows Firewall
- Temporarily disable antivirus to test

### Still having issues?
1. Check XAMPP Control Panel logs (click "Logs" button next to MySQL)
2. Look for error messages
3. The most common error is file corruption - you may need to backup and recreate the data directory

## Environment Variables (.env file)

Your current configuration:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=alimondcafe
```

This is correct for XAMPP default installation.
