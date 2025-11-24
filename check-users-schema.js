const db = require('./dbConfig');

db.query('DESCRIBE users', function(err, results) {
    if (err) {
        console.error('Error:', err);
        process.exit(1);
    }
    console.log('Users table schema:');
    console.table(results);
    
    // Also show a sample query
    db.query('SELECT * FROM users LIMIT 1', function(err2, rows) {
        if (err2) console.error('Sample query error:', err2);
        else console.log('\nSample row:', rows);
        process.exit(0);
    });
});
