var express = require('express');
var app = express();    
var mysql = require('mysql');
app.set('view engine', 'ejs');
app.use(express.static('styles'));

// MySQL connection setup
var db = mysql.createConnection({
    host: 'localhost',
    user: 'root', 
    database: 'alimondcafe' // change to your actual database name
});

db.connect(function(err) {
    if (err) throw err;
    console.log('Connected to MySQL database!');
});

app.get('/', function(req, res) {
        res.render("homepage");
});

app.get('/menu', function(req, res) {
        // Query products and their prices by size
        const productQuery = 'SELECT * FROM products';
        const priceQuery = 'SELECT * FROM price';
        db.query(productQuery, function(err, products) {
            if (err) throw err;
            db.query(priceQuery, function(err, prices) {
                if (err) throw err;
                // Merge prices into products by product_id
                const productMap = {};
                products.forEach(p => {
                    productMap[p.id] = { name: p.name, prices: {} };
                });
                prices.forEach(pr => {
                    if (productMap[pr.product_id]) {
                        productMap[pr.product_id].prices[pr.size] = pr.amount;
                    }
                });
                // Convert map to array
                const mergedProducts = Object.values(productMap);
                res.render("menu", { products: mergedProducts });
            });
        });
});

app.listen(2000, function() {
        console.log("Server is running on port 2000");
});
