-- Migration: Add profile fields to users table
-- Date: 2025
-- Description: Adds FirstName, LastName, and MobilePhone columns to existing users table

-- Add new columns
ALTER TABLE users 
ADD COLUMN FirstName VARCHAR(100) AFTER UserID,
ADD COLUMN LastName VARCHAR(100) AFTER FirstName,
ADD COLUMN MobilePhone VARCHAR(20) AFTER Email;

-- For existing users, set default values if needed
-- Uncomment the following if you have existing users that need defaults:
-- UPDATE users SET FirstName = 'Update' WHERE FirstName IS NULL;
-- UPDATE users SET LastName = 'Required' WHERE LastName IS NULL;
-- UPDATE users SET MobilePhone = '0000000000' WHERE MobilePhone IS NULL;

-- Make the columns NOT NULL after setting defaults (if you uncommented above)
-- ALTER TABLE users MODIFY COLUMN FirstName VARCHAR(100) NOT NULL;
-- ALTER TABLE users MODIFY COLUMN LastName VARCHAR(100) NOT NULL;
-- ALTER TABLE users MODIFY COLUMN MobilePhone VARCHAR(20) NOT NULL;
