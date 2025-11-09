const db = require('../dbConfig');
const fs = require('fs');
const path = require('path');

db.query("SELECT ProductID, Name, Picture FROM products", function(err, rows) {
  if (err) { console.error(err); process.exit(1); }
  rows.forEach(r => {
    const picRaw = (r.Picture || '').toString().trim();
    if (!picRaw) {
      console.log(r.ProductID + '\t' + r.Name + '\t<empty>');
      return;
    }
    const filename = path.basename(picRaw);
    const dest = path.join(__dirname, '..', 'images', filename);
    const srcExists = fs.existsSync(picRaw);
    const destExists = fs.existsSync(dest);
    console.log(r.ProductID + '\t' + r.Name + '\t' + picRaw + '\n\t srcExists=' + srcExists + '\t dest=' + dest + '\t destExists=' + destExists);
  });
  process.exit(0);
});
