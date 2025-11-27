const pool = require('./dbConfig');

console.log('Updating Order #48 with contact information...\n');

pool.query(
    'UPDATE orders SET CustomerEmail = ?, CustomerPhone = ? WHERE OrderID = ?',
    ['customer@example.com', '09123456789', 48],
    function(err, result) {
        if (err) {
            console.error('Error updating order:', err);
        } else {
            console.log('Order #48 updated successfully!');
            console.log('Affected rows:', result.affectedRows);
            console.log('\nYou should now be able to see the email and phone when viewing order #48.');
            console.log('Email: customer@example.com');
            console.log('Phone: 09123456789');
        }
        pool.end();
    }
);
