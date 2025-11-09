const db = require('../dbConfig');
const path = require('path');

console.log('Starting Picture basename update...');

// Create backup table if not exists
const createBackupTable = `
CREATE TABLE IF NOT EXISTS picture_backup (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ProductID INT,
  oldPicture TEXT,
  newPicture VARCHAR(255),
  changedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
`;

db.query(createBackupTable, function(err) {
  if (err) {
    console.error('Failed to ensure picture_backup table:', err);
    process.exit(1);
  }

  // Select products with non-empty Picture
  db.query("SELECT ProductID, Picture FROM products WHERE Picture IS NOT NULL AND Picture <> ''", function(err, rows) {
    if (err) {
      console.error('Failed to fetch products:', err);
      process.exit(1);
    }

    if (!rows || rows.length === 0) {
      console.log('No products with Picture to update.');
      process.exit(0);
    }

    let updates = 0;
    let processed = 0;

    rows.forEach(r => {
      processed++;
      const pid = r.ProductID;
      const picRaw = (r.Picture || '').toString().trim();
      const basename = path.basename(picRaw);
      // Only update if basename differs from the stored value
      if (basename && basename !== picRaw) {
        db.query('UPDATE products SET Picture = ? WHERE ProductID = ?', [basename, pid], function(err) {
          if (err) {
            console.error('Failed to update ProductID', pid, err);
          } else {
            updates++;
            // insert backup record
            db.query('INSERT INTO picture_backup (ProductID, oldPicture, newPicture) VALUES (?, ?, ?)', [pid, picRaw, basename], function(err) {
              if (err) console.warn('Failed to insert backup for', pid, err);
            });
          }
        });
      }

      // When finished processing last row, print summary after a small delay to allow async updates to finish
      if (processed === rows.length) {
        // Wait a moment for DB updates and inserts to complete
        setTimeout(() => {
          console.log(`Processed ${rows.length} rows. Performed ${updates} updates.`);
          console.log('If updates > 0, image files should be copied into ./images/ to be served at /images/<filename>');
          process.exit(0);
        }, 600);
      }
    });
  });
});
