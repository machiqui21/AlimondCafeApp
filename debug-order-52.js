const pool = require('./dbConfig');

function debugOrder52() {
    pool.getConnection(function(err, connection) {
        if (err) {
            console.error('Connection error:', err);
            return;
        }
    
        console.log('=== Debugging Order #52 ===\n');
        
        // Check order data
        connection.query('SELECT * FROM orders WHERE OrderID = ?', [52], function(err, orderRows) {
            if (err) {
                console.error('Query error:', err);
                connection.release();
                return;
            }
            
            console.log('Order data:');
            console.log(orderRows[0]);
            console.log('\n');
            
            // Get order items
            connection.query(`
                SELECT od.*, p.Name AS ProductName
                FROM order_details od
                LEFT JOIN products p ON p.ProductID = od.ProductID
                WHERE od.OrderID = ?
                ORDER BY od.OrderDetailID
            `, [52], function(err, items) {
                if (err) {
                    console.error('Items query error:', err);
                } else {
                    console.log('Order Items:');
                    items.forEach((item, idx) => {
                        console.log(`\n  Item ${idx + 1}:`);
                        console.log(`    OrderDetailID: ${item.OrderDetailID}`);
                        console.log(`    ProductName: ${item.ProductName}`);
                        console.log(`    Size: ${item.Size}`);
                        console.log(`    Quantity: ${item.Quantity}`);
                        console.log(`    UnitPrice: ${item.UnitPrice}`);
                    });
                    console.log('\n');
                }
                
                // Get options
                connection.query(`
                    SELECT oio.* 
                    FROM order_item_options oio
                    WHERE oio.OrderDetailID IN (SELECT OrderDetailID FROM order_details WHERE OrderID = ?)
                    ORDER BY oio.OrderDetailID, oio.OptionID
                `, [52], function(err, options) {
                    if (err) {
                        console.error('Options query error:', err);
                    } else {
                        console.log('Order Options:');
                        if (options.length === 0) {
                            console.log('  NO OPTIONS FOUND!');
                        } else {
                            options.forEach((opt, idx) => {
                                console.log(`\n  Option ${idx + 1}:`);
                                console.log(`    OrderDetailID: ${opt.OrderDetailID}`);
                                console.log(`    OptionName: ${opt.OptionName}`);
                                console.log(`    OptionValue: ${opt.OptionValue}`);
                                console.log(`    ExtraPrice: ${opt.ExtraPrice}`);
                            });
                        }
                    }
                    
                    connection.release();
                    pool.end();
                });
            });
        });
    });
}

debugOrder52();
