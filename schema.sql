-- Alim ondCafe Database Schema
-- Complete database structure for the cafe application

USE alimondcafe;

-- Currency table
CREATE TABLE IF NOT EXISTS `currency` (
  `CurrencyID` INT NOT NULL AUTO_INCREMENT,
  `Code` VARCHAR(3) NOT NULL,
  `Symbol` VARCHAR(10) NOT NULL,
  `ExchangeRate` DECIMAL(10, 4) DEFAULT 1.0000,
  `IsDefault` TINYINT(1) DEFAULT 0,
  PRIMARY KEY (`CurrencyID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Status table for order status
CREATE TABLE IF NOT EXISTS `status` (
  `StatusID` INT NOT NULL AUTO_INCREMENT,
  `StatusName` VARCHAR(50) NOT NULL,
  `Description` TEXT,
  PRIMARY KEY (`StatusID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Products table
CREATE TABLE IF NOT EXISTS `products` (
  `ProductID` INT NOT NULL AUTO_INCREMENT,
  `Name` VARCHAR(255) NOT NULL,
  `Category` VARCHAR(100) DEFAULT NULL,
  `Type` VARCHAR(100) DEFAULT NULL,
  `Description` TEXT,
  `Picture` VARCHAR(255) DEFAULT NULL,
  `Price` DECIMAL(10, 2) DEFAULT NULL,
  `HasSizes` TINYINT(1) DEFAULT 0,
  `HasExtras` TINYINT(1) DEFAULT 0,
  `HasCustom` TINYINT(1) DEFAULT 0,
  `IsAvailable` TINYINT(1) DEFAULT 1,
  `CreatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `UpdatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ProductID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Size prices table
CREATE TABLE IF NOT EXISTS `size_prices` (
  `SizePriceID` INT NOT NULL AUTO_INCREMENT,
  `ProductID` INT NOT NULL,
  `Size` VARCHAR(50) NOT NULL,
  `Price` DECIMAL(10, 2) NOT NULL,
  PRIMARY KEY (`SizePriceID`),
  KEY `idx_product_id` (`ProductID`),
  CONSTRAINT `fk_size_prices_product` FOREIGN KEY (`ProductID`) REFERENCES `products` (`ProductID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Highlights table
CREATE TABLE IF NOT EXISTS `highlights` (
  `HighlightID` INT NOT NULL AUTO_INCREMENT,
  `ProductID` INT NOT NULL,
  `DisplayOrder` INT DEFAULT 0,
  `IsActive` TINYINT(1) DEFAULT 1,
  `CreatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`HighlightID`),
  KEY `idx_product_id` (`ProductID`),
  CONSTRAINT `fk_highlights_product` FOREIGN KEY (`ProductID`) REFERENCES `products` (`ProductID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- About table
CREATE TABLE IF NOT EXISTS `about` (
  `AboutID` INT NOT NULL AUTO_INCREMENT,
  `Title` VARCHAR(255) DEFAULT NULL,
  `Content` TEXT,
  `Image` VARCHAR(255) DEFAULT NULL,
  `DisplayOrder` INT DEFAULT 0,
  `CreatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `UpdatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`AboutID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Orders table
CREATE TABLE IF NOT EXISTS `orders` (
  `OrderID` INT NOT NULL AUTO_INCREMENT,
  `CustomerName` VARCHAR(255) DEFAULT NULL,
  `CustomerEmail` VARCHAR(255) DEFAULT NULL,
  `CustomerPhone` VARCHAR(50) DEFAULT NULL,
  `TotalAmount` DECIMAL(10, 2) DEFAULT 0.00,
  `StatusID` INT DEFAULT 1,
  `Notes` TEXT,
  `CreatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `UpdatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`OrderID`),
  KEY `idx_status_id` (`StatusID`),
  CONSTRAINT `fk_orders_status` FOREIGN KEY (`StatusID`) REFERENCES `status` (`StatusID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Order details table
CREATE TABLE IF NOT EXISTS `order_details` (
  `OrderDetailID` INT NOT NULL AUTO_INCREMENT,
  `OrderID` INT NOT NULL,
  `ProductID` INT NOT NULL,
  `ProductName` VARCHAR(255) NOT NULL,
  `Quantity` INT NOT NULL DEFAULT 1,
  `UnitPrice` DECIMAL(10, 2) NOT NULL,
  `Subtotal` DECIMAL(10, 2) NOT NULL,
  `Size` VARCHAR(50) DEFAULT NULL,
  `Notes` TEXT,
  PRIMARY KEY (`OrderDetailID`),
  KEY `idx_order_id` (`OrderID`),
  KEY `idx_product_id` (`ProductID`),
  CONSTRAINT `fk_order_details_order` FOREIGN KEY (`OrderID`) REFERENCES `orders` (`OrderID`) ON DELETE CASCADE,
  CONSTRAINT `fk_order_details_product` FOREIGN KEY (`ProductID`) REFERENCES `products` (`ProductID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Order item options table
CREATE TABLE IF NOT EXISTS `order_item_options` (
  `OptionID` INT NOT NULL AUTO_INCREMENT,
  `OrderDetailID` INT NOT NULL,
  `OptionName` VARCHAR(100) NOT NULL,
  `OptionValue` VARCHAR(255) NOT NULL,
  `ExtraPrice` DECIMAL(10, 2) DEFAULT 0.00,
  PRIMARY KEY (`OptionID`),
  KEY `idx_order_detail_id` (`OrderDetailID`),
  CONSTRAINT `fk_item_options_detail` FOREIGN KEY (`OrderDetailID`) REFERENCES `order_details` (`OrderDetailID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default status values
INSERT INTO `status` (`StatusID`, `StatusName`, `Description`) VALUES
(1, 'Pending', 'Order has been placed and is awaiting processing'),
(2, 'Confirmed', 'Order has been confirmed'),
(3, 'Preparing', 'Order is being prepared'),
(4, 'Ready', 'Order is ready for pickup/delivery'),
(5, 'Completed', 'Order has been completed'),
(6, 'Cancelled', 'Order has been cancelled')
ON DUPLICATE KEY UPDATE StatusName=VALUES(StatusName);

-- Insert default currency
INSERT INTO `currency` (`CurrencyID`, `Code`, `Symbol`, `ExchangeRate`, `IsDefault`) VALUES
(1, 'PHP', '₱', 1.0000, 1),
(2, 'USD', '$', 0.018, 0)
ON DUPLICATE KEY UPDATE Code=VALUES(Code);
