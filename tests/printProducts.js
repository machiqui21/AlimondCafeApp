const db = require('../dbConfig');

db.query('SELECT * FROM products LIMIT 5', function(err, rows){
  if (err) { console.error('ERR', err); process.exit(1); }
  console.log('FIELDS:', rows.length ? Object.keys(rows[0]) : 'empty');
  console.log(rows.slice(0,5));
  process.exit(0);
});
