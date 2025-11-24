-- Add PaymentMethod column to orders table
-- Run this migration if the PaymentMethod column doesn't exist

USE alimondcafe;

-- Add PaymentMethod column if it doesn't exist
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS PaymentMethod VARCHAR(50) DEFAULT NULL AFTER StatusID;

-- Verify the column was added
DESCRIBE orders;
