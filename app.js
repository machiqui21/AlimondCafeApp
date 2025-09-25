console.log("App started");
var express = require('express');
var app = express();    
app.set('view engine', 'ejs');
app.use(express.static('styles'));
var db = require('./dbConfig');

app.use('/images', express.static('images'));

app.get('/', function(req, res) {
        res.render("homepage");
});

app.get('/menu', function(req, res) {
        console.log("GET /menu called");
        const productQuery = "SELECT * FROM products WHERE category = 'Standard'";
        const priceQuery = "SELECT * FROM pricelist WHERE category = 'Standard'";
        const extraQuery = "SELECT * FROM pricelist WHERE category = 'Extras'";
        db.query(productQuery, function(err, products) {
                if (err) {
                        console.error('Product query error:', err);
                        return res.status(500).send('Database error');
                }
                console.log('Products:', products);
                db.query(priceQuery, function(err, pricelist) {
                        if (err) {
                                console.error('Price query error:', err);
                                return res.status(500).send('Database error');
                        }
                        console.log('Pricelist:', pricelist);

                        db.query(extraQuery, function(err, extraPricelist) {
                                if (err) {
                                        console.error('Extra Price query error:', err);
                                        return res.status(500).send('Database error');
                                }
                                console.log('Extra Pricelist:', extraPricelist);
                                res.render('menu', { ProductData: products, PriceData: pricelist, ExtraPriceData: extraPricelist });
                        });
                });
        });
});

app.listen(2000, function() {
        console.log("Server is running on port 2000");
});
