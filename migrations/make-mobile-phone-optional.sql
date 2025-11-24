-- Make MobilePhone field optional (allow NULL values)
ALTER TABLE users MODIFY COLUMN MobilePhone VARCHAR(20) DEFAULT NULL;
