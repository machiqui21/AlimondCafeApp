// Usage:
//  node scripts/clearOrders.js           -> shows how many orders exist (dry-run)
//  node scripts/clearOrders.js --force   -> deletes all orders from the DB for safety

const db = require('../dbConfig');

const force = process.argv.indexOf('--force') !== -1;

function closeAndExit(code){
  try { db.end(); } catch(e){}
  process.exit(code);
}

function handleError(err){
  console.error('Error while accessing DB:', err && err.message || err);
  closeAndExit(2);
}

db.query('SELECT COUNT(*) AS cnt FROM orders', function(err, rows){
  if (err) return handleError(err);
  const cnt = rows && rows[0] ? (rows[0].cnt || rows[0]['COUNT(*)'] || 0) : 0;
  console.log('Orders table contains', cnt, 'rows.');
  if (!force) {
    console.log('\nDry-run: no rows were deleted. To delete all rows run:');
    console.log('  node scripts/clearOrders.js --force\n');
    closeAndExit(0);
  }

  console.log('Deleting all orders from the orders table...');
  db.query('DELETE FROM orders', function(delErr, result){
    if (delErr) return handleError(delErr);
    const affected = result && (result.affectedRows || result.affectedRows === 0) ? result.affectedRows : null;
    console.log('Delete completed. Rows removed:', affected);
    closeAndExit(0);
  });
});