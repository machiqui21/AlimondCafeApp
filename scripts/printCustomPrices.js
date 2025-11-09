const db = require('../dbConfig');

db.query('SELECT * FROM custom_prices', function(err, rows) {
  if (err) {
    console.error('Error querying custom_prices:', err.message || err);
    process.exit(1);
  }
  console.log('custom_prices rows:');
  if (!rows || rows.length === 0) {
    console.log('(no rows)');
    process.exit(0);
  }
  rows.forEach(r => {
    // print all columns in a compact way
    console.log(Object.keys(r).map(k => `${k}=${r[k]}`).join(' | '));
  });
  process.exit(0);
});
