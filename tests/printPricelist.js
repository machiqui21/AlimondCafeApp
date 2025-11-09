const db = require('../dbConfig');

db.query('SELECT * FROM pricelist LIMIT 20', function(err, rows){
  if (err) { console.error('ERR', err); process.exit(1); }
  console.log('FIELDS:', rows.length ? Object.keys(rows[0]) : 'empty');
  console.log(rows.slice(0,20));
  process.exit(0);
});
