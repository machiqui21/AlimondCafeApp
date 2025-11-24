const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'alimondcafe'
});

console.log('Adding size prices for Matcha Latte...\n');

db.connect((err) => {
    if (err) {
        console.error('Connection error:', err);
        process.exit(1);
    }
    
    const productId = 1; // Matcha Latte ProductID
    const sizes = [
        { size: 'Small', price: 85.00 },
        { size: 'Medium', price: 105.00 },
        { size: 'Large', price: 125.00 }
    ];
    
    console.log('Adding the following sizes:');
    sizes.forEach(s => console.log(`  ${s.size}: ₱${s.price}`));
    console.log();
    
    let completed = 0;
    sizes.forEach(sizeData => {
        db.query(
            'INSERT INTO size_prices (ProductID, Size, Price) VALUES (?, ?, ?)',
            [productId, sizeData.size, sizeData.price],
            (err, result) => {
                if (err) {
                    console.error(`Error adding ${sizeData.size}:`, err);
                } else {
                    console.log(`✓ Added ${sizeData.size}: ₱${sizeData.price}`);
                }
                
                completed++;
                if (completed === sizes.length) {
                    console.log('\nVerifying sizes:');
                    db.query('SELECT * FROM size_prices WHERE ProductID = ?', [productId], (err, results) => {
                        if (err) {
                            console.error('Verification error:', err);
                        } else {
                            results.forEach(row => {
                                console.log(`  ${row.Size}: ₱${row.Price}`);
                            });
                        }
                        db.end();
                    });
                }
            }
        );
    });
});
