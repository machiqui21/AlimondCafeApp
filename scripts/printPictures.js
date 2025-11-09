const db = require('../dbConfig');

db.query("SELECT ProductID, Name, Picture, Category FROM products WHERE Category = 'Standard'", function(err, rows) {
  if (err) {
    console.error('DB error', err);
    process.exit(1);
  }
  console.log('Standard products and Picture field:');
  rows.forEach(r => {
    console.log(r.ProductID + '\t' + r.Name + '\t' + (r.Picture || '<empty>'));
  });
  process.exit(0);
});
