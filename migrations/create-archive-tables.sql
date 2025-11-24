-- Create archive tables for completed/cancelled orders
-- Run this migration to set up the archival system

-- Create orders archive table (same structure as orders)
CREATE TABLE IF NOT EXISTS orders_archive (
    OrderID INT PRIMARY KEY,
    CustomerName VARCHAR(255),
    TotalAmount DECIMAL(10,2),
    StatusID INT,
    PaymentMethod VARCHAR(50),
    Notes TEXT,
    UserID INT,
    CreatedAt TIMESTAMP,
    UpdatedAt TIMESTAMP,
    ArchivedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_archived_at (ArchivedAt),
    INDEX idx_created_at (CreatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create order_details archive table
CREATE TABLE IF NOT EXISTS order_details_archive (
    OrderDetailID INT PRIMARY KEY,
    OrderID INT,
    ProductID INT,
    ProductName VARCHAR(255),
    Quantity INT,
    UnitPrice DECIMAL(10,2),
    Subtotal DECIMAL(10,2),
    Size VARCHAR(50),
    Notes TEXT,
    ArchivedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_order_id (OrderID),
    INDEX idx_archived_at (ArchivedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create order_item_options archive table
CREATE TABLE IF NOT EXISTS order_item_options_archive (
    OptionID INT PRIMARY KEY,
    OrderDetailID INT,
    OptionType VARCHAR(100),
    OptionValue VARCHAR(255),
    OptionPrice DECIMAL(10,2),
    ArchivedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_order_detail_id (OrderDetailID),
    INDEX idx_archived_at (ArchivedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add index to orders table for faster archival queries
ALTER TABLE orders ADD INDEX IF NOT EXISTS idx_status_created (StatusID, CreatedAt);

-- Migration complete
SELECT 'Archive tables created successfully' AS Status;
