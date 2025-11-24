const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'alimondcafe'
});

console.log('Connecting to database...');

db.connect((err) => {
    if (err) {
        console.error('Connection error:', err);
        process.exit(1);
    }
    
    console.log('Connected! Checking current product types...\n');
    
    // First, check current types
    db.query('SELECT ProductID, Name, Type FROM products WHERE Name IN ("Matcha Latte", "Cookies")', (err, results) => {
        if (err) {
            console.error('Query error:', err);
            db.end();
            process.exit(1);
        }
        
        console.log('Current products:');
        results.forEach(row => {
            console.log(`  ${row.Name} (ID: ${row.ProductID}) - Type: ${row.Type || 'NULL'}`);
        });
        
        if (results.length === 0) {
            console.log('  No products found with these names.');
            db.end();
            process.exit(0);
        }
        
        console.log('\nUpdating product types...');
        
        const updates = [];
        results.forEach(row => {
            if (row.Name === 'Matcha Latte') {
                updates.push(
                    new Promise((resolve, reject) => {
                        db.query('UPDATE products SET Type = ? WHERE ProductID = ?', ['Tea Latte', row.ProductID], (err, result) => {
                            if (err) reject(err);
                            else {
                                console.log(`✓ Updated ${row.Name} to Type: "Tea Latte"`);
                                resolve();
                            }
                        });
                    })
                );
            }
            if (row.Name === 'Cookies') {
                updates.push(
                    new Promise((resolve, reject) => {
                        db.query('UPDATE products SET Type = ? WHERE ProductID = ?', ['Pastry', row.ProductID], (err, result) => {
                            if (err) reject(err);
                            else {
                                console.log(`✓ Updated ${row.Name} to Type: "Pastry"`);
                                resolve();
                            }
                        });
                    })
                );
            }
        });
        
        Promise.all(updates)
            .then(() => {
                console.log('\nAll updates completed successfully!');
                
                // Verify the updates
                db.query('SELECT ProductID, Name, Type FROM products WHERE Name IN ("Matcha Latte", "Cookies")', (err, results) => {
                    if (err) {
                        console.error('Verification error:', err);
                    } else {
                        console.log('\nVerified product types:');
                        results.forEach(row => {
                            console.log(`  ${row.Name} (ID: ${row.ProductID}) - Type: ${row.Type}`);
                        });
                    }
                    db.end();
                });
            })
            .catch(err => {
                console.error('Update error:', err);
                db.end();
                process.exit(1);
            });
    });
});
