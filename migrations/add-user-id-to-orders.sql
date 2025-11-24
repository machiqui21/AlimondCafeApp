-- Add UserID column to orders table to link orders with logged-in users
-- Run this migration to enable user order history tracking

ALTER TABLE orders 
ADD COLUMN UserID INT DEFAULT NULL AFTER OrderID,
ADD KEY idx_user_id (UserID);

-- Add foreign key constraint to reference users table
-- Note: If you want to enforce referential integrity, uncomment the following line
-- ALTER TABLE orders ADD CONSTRAINT fk_orders_user FOREIGN KEY (UserID) REFERENCES users (UserID) ON DELETE SET NULL;
