const db = require('./dbConfig');

const query = `
  SELECT ProductID, Name, Description, Type
  FROM products
  ORDER BY Name
`;

db.query(query, (err, results) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  
  console.log('\n=== Product Descriptions ===\n');
  results.forEach(row => {
    console.log(`${row.Name.padEnd(30)} | Type: ${(row.Type || 'N/A').padEnd(20)} | Desc: ${row.Description || '❌ NO DESCRIPTION'}`);
  });
  
  console.log('\n=== Products WITHOUT descriptions ===');
  const noDesc = results.filter(r => !r.Description || r.Description.trim() === '');
  if (noDesc.length > 0) {
    noDesc.forEach(row => {
      console.log(`- ${row.Name}`);
    });
  } else {
    console.log('All products have descriptions!');
  }
  
  process.exit(0);
});
