// Check database schema for orders table
const db = require('./dbConfig');

function query(sql) {
    return new Promise((resolve, reject) => {
        db.query(sql, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
}

async function checkSchema() {
    try {
        console.log('Checking database schema...\n');
        
        // Describe orders table
        const columns = await query('DESCRIBE orders');
        console.log('=== Orders Table Schema ===');
        columns.forEach(col => {
            console.log(`${col.Field.padEnd(20)} | ${col.Type.padEnd(15)} | ${col.Null.padEnd(5)} | ${col.Key.padEnd(5)} | ${col.Default || 'NULL'}`);
        });
        
        // Check if PaymentMethod column exists
        const hasPaymentMethod = columns.some(col => col.Field === 'PaymentMethod');
        console.log(`\nPaymentMethod column exists: ${hasPaymentMethod}`);
        
        if (!hasPaymentMethod) {
            console.log('\n⚠️  PaymentMethod column is MISSING!');
            console.log('Run this SQL to add it:');
            console.log('ALTER TABLE orders ADD COLUMN PaymentMethod VARCHAR(50) DEFAULT NULL AFTER StatusID;');
        }
        
        // Check recent orders
        const orders = await query('SELECT OrderID, CustomerName, StatusID, PaymentMethod FROM orders ORDER BY OrderID DESC LIMIT 5');
        console.log('\n=== Recent Orders ===');
        console.table(orders);
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkSchema();
