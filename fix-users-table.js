const db = require('./dbConfig');

console.log('Adding missing columns to users table...');

const alterStatements = [
    'ALTER TABLE users ADD COLUMN FirstName VARCHAR(100) AFTER UserID',
    'ALTER TABLE users ADD COLUMN LastName VARCHAR(100) AFTER FirstName',
    'ALTER TABLE users ADD COLUMN MobilePhone VARCHAR(20) DEFAULT NULL AFTER Email'
];

async function runAlters() {
    for (const sql of alterStatements) {
        try {
            await new Promise((resolve, reject) => {
                db.query(sql, (err, result) => {
                    if (err) {
                        if (err.code === 'ER_DUP_FIELDNAME') {
                            console.log('Column already exists (skipping):', err.message);
                            resolve();
                        } else {
                            reject(err);
                        }
                    } else {
                        console.log('✓ Executed:', sql);
                        resolve(result);
                    }
                });
            });
        } catch (e) {
            console.error('Error:', e.message);
        }
    }
    
    console.log('\nVerifying updated schema:');
    db.query('DESCRIBE users', (err, results) => {
        if (err) console.error(err);
        else console.table(results);
        process.exit(0);
    });
}

runAlters();
