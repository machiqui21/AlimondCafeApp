-- Migration: Add missing columns to products table
-- Run this if your products table already exists and is missing these columns

USE alimondcafe;

-- Add Type column if it doesn't exist
ALTER TABLE `products` 
ADD COLUMN IF NOT EXISTS `Type` VARCHAR(100) DEFAULT NULL AFTER `Category`;

-- Add HasSizes column if it doesn't exist
ALTER TABLE `products` 
ADD COLUMN IF NOT EXISTS `HasSizes` TINYINT(1) DEFAULT 0 AFTER `Price`;

-- Add HasExtras column if it doesn't exist
ALTER TABLE `products` 
ADD COLUMN IF NOT EXISTS `HasExtras` TINYINT(1) DEFAULT 0 AFTER `HasSizes`;

-- Add HasCustom column if it doesn't exist
ALTER TABLE `products` 
ADD COLUMN IF NOT EXISTS `HasCustom` TINYINT(1) DEFAULT 0 AFTER `HasExtras`;

-- Verify the changes
DESCRIBE products;

SELECT 'Migration completed successfully!' AS status;
