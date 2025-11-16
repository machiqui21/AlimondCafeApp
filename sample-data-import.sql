-- Alimond Cafe - Data Import Template
-- Fill in your product data and run this file to populate the database

USE alimondcafe;

-- ============================================
-- PRODUCTS DATA
-- ============================================
-- Instructions: Replace the sample data below with your actual products
-- 
-- Column guide:
-- - Name: Product name (e.g., 'Iced Coffee', 'Cappuccino')
-- - Category: 'Standard' for regular menu items, 'Custom' for milk/sweeteners, 'Extras' for toppings
-- - Description: Product description
-- - Picture: Image filename (e.g., 'coffee.jpg') - put images in /images folder
-- - Price: Base price (set to NULL if HasSizes = 1)
-- - HasSizes: 1 if product has multiple sizes (S/M/L), 0 otherwise
-- - HasExtras: 1 if product can have toppings/extras, 0 otherwise
-- - HasCustom: 1 if product can have custom milk/sweetener, 0 otherwise
-- - Type: Product type (e.g., 'Coffee', 'Frappe', 'Milk', 'Sweetener', 'Toppings')

-- STANDARD PRODUCTS (Coffee, Drinks, Food, etc.)
INSERT INTO `products` (`Name`, `Category`, `Description`, `Picture`, `Price`, `HasSizes`, `HasExtras`, `HasCustom`, `Type`, `IsAvailable`) VALUES
-- Coffee Products
('Iced Coffee', 'Standard', 'Refreshing iced coffee', 'iced-coffee.jpg', NULL, 1, 1, 1, 'Coffee', 1),
('Hot Coffee', 'Standard', 'Classic hot coffee', 'hot-coffee.jpg', NULL, 1, 1, 1, 'Coffee', 1),
('Cappuccino', 'Standard', 'Espresso with steamed milk', 'cappuccino.jpg', NULL, 1, 0, 1, 'Coffee', 1),
('Latte', 'Standard', 'Smooth espresso and milk', 'latte.jpg', NULL, 1, 0, 1, 'Coffee', 1),

-- Frappe Products
('Mocha Frappe', 'Standard', 'Chocolate coffee frappe', 'mocha-frappe.jpg', NULL, 1, 1, 0, 'Frappe', 1),
('Caramel Frappe', 'Standard', 'Sweet caramel frappe', 'caramel-frappe.jpg', NULL, 1, 1, 0, 'Frappe', 1),

-- Non-Coffee Drinks
('Hot Chocolate', 'Standard', 'Rich hot chocolate', 'hot-chocolate.jpg', NULL, 1, 1, 0, 'Non-Coffee', 1),
('Iced Tea', 'Standard', 'Refreshing iced tea', 'iced-tea.jpg', NULL, 1, 0, 0, 'Non-Coffee', 1),

-- Food Items (no sizes)
('Blueberry Muffin', 'Standard', 'Fresh blueberry muffin', 'muffin.jpg', 75.00, 0, 0, 0, 'Pastry', 1),
('Chocolate Cake', 'Standard', 'Rich chocolate cake slice', 'cake.jpg', 95.00, 0, 0, 0, 'Dessert', 1);

-- Get the last inserted ProductID for reference
SET @last_product_id = LAST_INSERT_ID();

-- ============================================
-- SIZE PRICES
-- ============================================
-- Instructions: Define prices for products with HasSizes = 1
-- Each product with sizes needs 3 entries (Small, Medium, Large)

INSERT INTO `size_prices` (`ProductID`, `Size`, `Price`) VALUES
-- Iced Coffee sizes (assuming ProductID = 1)
(1, 'Small', 65.00),
(1, 'Medium', 85.00),
(1, 'Large', 105.00),

-- Hot Coffee sizes (assuming ProductID = 2)
(2, 'Small', 55.00),
(2, 'Medium', 75.00),
(2, 'Large', 95.00),

-- Cappuccino sizes (assuming ProductID = 3)
(3, 'Small', 75.00),
(3, 'Medium', 95.00),
(3, 'Large', 115.00),

-- Latte sizes (assuming ProductID = 4)
(4, 'Small', 80.00),
(4, 'Medium', 100.00),
(4, 'Large', 120.00),

-- Mocha Frappe sizes (assuming ProductID = 5)
(5, 'Small', 95.00),
(5, 'Medium', 115.00),
(5, 'Large', 135.00),

-- Caramel Frappe sizes (assuming ProductID = 6)
(6, 'Small', 95.00),
(6, 'Medium', 115.00),
(6, 'Large', 135.00),

-- Hot Chocolate sizes (assuming ProductID = 7)
(7, 'Small', 70.00),
(7, 'Medium', 90.00),
(7, 'Large', 110.00),

-- Iced Tea sizes (assuming ProductID = 8)
(8, 'Small', 50.00),
(8, 'Medium', 70.00),
(8, 'Large', 90.00);

-- ============================================
-- CUSTOM OPTIONS (Milk, Sweeteners)
-- ============================================
-- Instructions: Add milk and sweetener options
-- Category should be 'Custom', Type should be 'Milk' or 'Sweetener'

INSERT INTO `products` (`Name`, `Category`, `Description`, `Picture`, `Price`, `HasSizes`, `HasExtras`, `HasCustom`, `Type`, `IsAvailable`) VALUES
-- Milk Options
('Fresh Milk', 'Custom', 'Regular fresh milk', NULL, 10.00, 0, 0, 0, 'Milk', 1),
('Oat Milk', 'Custom', 'Dairy-free oat milk', NULL, 15.00, 0, 0, 0, 'Milk', 1),
('Almond Milk', 'Custom', 'Dairy-free almond milk', NULL, 15.00, 0, 0, 0, 'Milk', 1),
('Soy Milk', 'Custom', 'Dairy-free soy milk', NULL, 15.00, 0, 0, 0, 'Milk', 1),

-- Sweetener Options
('White Sugar', 'Custom', 'Regular white sugar', NULL, 0.00, 0, 0, 0, 'Sweetener', 1),
('Brown Sugar', 'Custom', 'Natural brown sugar', NULL, 5.00, 0, 0, 0, 'Sweetener', 1),
('Honey', 'Custom', 'Natural honey', NULL, 10.00, 0, 0, 0, 'Sweetener', 1),
('Stevia', 'Custom', 'Zero-calorie sweetener', NULL, 5.00, 0, 0, 0, 'Sweetener', 1);

-- ============================================
-- EXTRAS/TOPPINGS
-- ============================================
-- Instructions: Add toppings and extras
-- Category should be 'Extras', Type can be 'Toppings'

INSERT INTO `products` (`Name`, `Category`, `Description`, `Picture`, `Price`, `HasSizes`, `HasExtras`, `HasCustom`, `Type`, `IsAvailable`) VALUES
('Whipped Cream', 'Extras', 'Fresh whipped cream topping', NULL, 15.00, 0, 0, 0, 'Toppings', 1),
('Chocolate Syrup', 'Extras', 'Rich chocolate syrup drizzle', NULL, 10.00, 0, 0, 0, 'Toppings', 1),
('Caramel Drizzle', 'Extras', 'Sweet caramel topping', NULL, 10.00, 0, 0, 0, 'Toppings', 1),
('Extra Shot Espresso', 'Extras', 'Additional espresso shot', NULL, 25.00, 0, 0, 0, 'Toppings', 1),
('Pearl Boba', 'Extras', 'Tapioca pearls', NULL, 20.00, 0, 0, 0, 'Toppings', 1),
('Vanilla Syrup', 'Extras', 'Sweet vanilla flavoring', NULL, 10.00, 0, 0, 0, 'Toppings', 1);

-- ============================================
-- HIGHLIGHTED PRODUCTS (Featured on homepage)
-- ============================================
-- Instructions: Add products you want to highlight on the homepage
-- Use the ProductID from the products table

INSERT INTO `highlights` (`ProductID`, `DisplayOrder`, `IsActive`) VALUES
(1, 1, 1),  -- Iced Coffee
(5, 2, 1),  -- Mocha Frappe
(4, 3, 1);  -- Latte

-- ============================================
-- ABOUT SECTION (Optional)
-- ============================================
-- Instructions: Add content for your About page

INSERT INTO `about` (`Title`, `Content`, `Image`, `DisplayOrder`) VALUES
('Welcome to Alimond''s Café', 
 'Every cup brewed with love, for the neighborhood we call home. We serve premium coffee and delicious treats in a cozy atmosphere.',
 'cafe-interior.jpg', 1),

('Our Story', 
 'Founded with passion for great coffee, Alimond''s Café has been serving the community with dedication and care.',
 'our-story.jpg', 2);

-- ============================================
-- Verification Queries
-- ============================================
-- Run these to verify your data was inserted correctly

SELECT 'Products' as TableName, COUNT(*) as RecordCount FROM products
UNION ALL
SELECT 'Size Prices', COUNT(*) FROM size_prices
UNION ALL
SELECT 'Highlights', COUNT(*) FROM highlights
UNION ALL
SELECT 'About', COUNT(*) FROM about;

-- Show all products with their properties
SELECT ProductID, Name, Category, Type, Price, HasSizes, HasExtras, HasCustom, IsAvailable 
FROM products 
ORDER BY Category, Type, Name;

-- Show all size prices
SELECT sp.SizePriceID, p.Name as ProductName, sp.Size, sp.Price
FROM size_prices sp
JOIN products p ON sp.ProductID = p.ProductID
ORDER BY p.Name, FIELD(sp.Size, 'Small', 'Medium', 'Large');
