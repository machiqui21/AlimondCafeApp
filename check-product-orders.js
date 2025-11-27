const db = require('./dbConfig');

// Check which products have orders
const query = `
  SELECT 
    p.ProductID,
    p.Name,
    COUNT(od.OrderDetailID) as OrderCount
  FROM products p
  LEFT JOIN order_details od ON p.ProductID = od.ProductID
  GROUP BY p.ProductID, p.Name
  ORDER BY p.Name
`;

db.query(query, (err, results) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  
  console.log('\n=== Products and Their Order Counts ===\n');
  results.forEach(row => {
    console.log(`${row.Name.padEnd(30)} | Orders: ${row.OrderCount} | ${row.OrderCount > 0 ? '❌ Cannot Delete' : '✅ Can Delete'}`);
  });
  
  console.log('\n=== Products WITH orders (Delete disabled) ===');
  const withOrders = results.filter(r => r.OrderCount > 0);
  withOrders.forEach(row => {
    console.log(`- ${row.Name} (${row.OrderCount} orders)`);
  });
  
  console.log('\n=== Products WITHOUT orders (Delete enabled) ===');
  const withoutOrders = results.filter(r => r.OrderCount === 0);
  withoutOrders.forEach(row => {
    console.log(`- ${row.Name}`);
  });
  
  process.exit(0);
});
