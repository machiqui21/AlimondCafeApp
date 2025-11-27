const pool = require('./dbConfig');

function debugOrder48() {
    pool.getConnection(function(err, connection) {
        if (err) {
            console.error('Connection error:', err);
            return;
        }
    
        console.log('=== Debugging Order #48 ===\n');
        
        // Check order data
        connection.query('SELECT * FROM orders WHERE OrderID = ?', [48], function(err, orderRows) {
            if (err) {
                console.error('Query error:', err);
                connection.release();
                return;
            }
            
            console.log('Order data:');
            console.log(orderRows[0]);
            console.log('\n');
            
            // Check if order has UserID
            if (orderRows[0] && orderRows[0].UserID) {
                console.log(`Order has UserID: ${orderRows[0].UserID}\n`);
                
                // Get user data
                connection.query('SELECT UserID, Username, Email, FirstName, LastName, MobilePhone FROM users WHERE UserID = ?', 
                    [orderRows[0].UserID], function(err, userRows) {
                    if (err) {
                        console.error('User query error:', err);
                    } else {
                        console.log('User data:');
                        console.log(userRows[0]);
                        console.log('\n');
                    }
                    
                    // Check what the JOIN query returns
                    checkJoinQuery(connection);
                });
            } else {
                console.log('Order does not have a UserID associated!\n');
                checkJoinQuery(connection);
            }
        });
    });
}

function checkJoinQuery(connection) {
    connection.query(`
        SELECT o.*, s.StatusName, u.Email AS UserEmail, u.MobilePhone AS UserPhone 
        FROM orders o 
        LEFT JOIN status s ON o.StatusID = s.StatusID 
        LEFT JOIN users u ON o.UserID = u.UserID
        WHERE o.OrderID = ?
    `, [48], function(err, joinRows) {
        if (err) {
            console.error('JOIN query error:', err);
            connection.release();
            return;
        }
        
        console.log('JOIN query result:');
        console.log(joinRows[0]);
        console.log('\n');
        
        // Simulate the backend logic
        const order = joinRows[0];
        console.log('After fallback logic:');
        if (!order.CustomerEmail && order.UserEmail) {
            order.CustomerEmail = order.UserEmail;
            console.log(`CustomerEmail set to: ${order.CustomerEmail}`);
        } else {
            console.log(`CustomerEmail: ${order.CustomerEmail || '(empty)'}`);
        }
        
        if (!order.CustomerPhone && order.UserPhone) {
            order.CustomerPhone = order.UserPhone;
            console.log(`CustomerPhone set to: ${order.CustomerPhone}`);
        } else {
            console.log(`CustomerPhone: ${order.CustomerPhone || '(empty)'}`);
        }
        
        connection.release();
        pool.end();
    });
}

debugOrder48();

