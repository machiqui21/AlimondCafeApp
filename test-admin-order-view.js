const pool = require('./dbConfig');

async function dbQuery(sql, params) {
    return new Promise((resolve, reject) => {
        pool.query(sql, params, (err, results) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
}

async function testAdminOrderView() {
    try {
        const orderId = 52;
        
        console.log('Testing admin order view for Order #52\n');
        
        // Get order items
        const items = await dbQuery(`
            SELECT od.*, p.Name AS ProductName
            FROM order_details od
            LEFT JOIN products p ON p.ProductID = od.ProductID
            WHERE od.OrderID = ?
            ORDER BY od.OrderDetailID
        `, [orderId]);
        
        console.log('Items from DB:');
        items.forEach((item, idx) => {
            console.log(`  ${idx + 1}. ${item.ProductName} (DetailID: ${item.OrderDetailID})`);
        });
        console.log('');
        
        // Get order options
        const options = await dbQuery(`
            SELECT oio.* 
            FROM order_item_options oio
            WHERE oio.OrderDetailID IN (SELECT OrderDetailID FROM order_details WHERE OrderID = ?)
            ORDER BY oio.OrderDetailID, oio.OptionID
        `, [orderId]);
        
        console.log('Options from DB:');
        console.log(`Total options: ${options.length}`);
        options.forEach((opt, idx) => {
            console.log(`  ${idx + 1}. DetailID=${opt.OrderDetailID}, ${opt.OptionName}: ${opt.OptionValue} (+₱${opt.ExtraPrice})`);
        });
        console.log('');
        
        // Group options by OrderDetailID
        const optionsByDetailId = {};
        options.forEach(opt => {
            const detailId = opt.OrderDetailID;
            if (!optionsByDetailId[detailId]) {
                optionsByDetailId[detailId] = [];
            }
            optionsByDetailId[detailId].push({
                type: opt.OptionName || 'Other',
                name: opt.OptionValue || '',
                price: parseFloat(opt.ExtraPrice || 0) || 0
            });
        });
        
        console.log('Grouped options:');
        console.log(JSON.stringify(optionsByDetailId, null, 2));
        console.log('');
        
        // Attach options to items
        items.forEach(item => {
            item.options = optionsByDetailId[item.OrderDetailID] || [];
        });
        
        console.log('Final items with options:');
        items.forEach((item, idx) => {
            console.log(`\n  Item ${idx + 1}: ${item.ProductName}`);
            console.log(`    OrderDetailID: ${item.OrderDetailID}`);
            console.log(`    Options count: ${item.options.length}`);
            if (item.options.length > 0) {
                item.options.forEach(opt => {
                    console.log(`      - ${opt.type}: ${opt.name} (+₱${opt.price})`);
                });
            }
        });
        
        pool.end();
    } catch (error) {
        console.error('Error:', error);
        pool.end();
    }
}

testAdminOrderView();
