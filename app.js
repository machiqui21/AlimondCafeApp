console.log("App started");

var express = require('express');
var app = express();
var i18n = require('i18n');
app.set('view engine', 'ejs');
app.use(express.static('styles'));
var db = require('./dbConfig');

i18n.configure({
        locales: ['en', 'tl'],
        directory: __dirname + '/locales',
        defaultLocale: 'en',
        cookie: 'lang',
        queryParameter: 'lang'
});
app.use(i18n.init);

app.use('/images', express.static('images'));

app.get('/', function(req, res) {
        const productQuery = "SELECT * FROM products WHERE category = 'Standard'";
        const priceQuery = "SELECT * FROM pricelist WHERE category = 'Standard'";
        const extraQuery = "SELECT * FROM pricelist WHERE category = 'Extras'";
        db.query(productQuery, function(err, products) {
                if (err) {
                        console.error('Product query error:', err);
                        return res.status(500).send('Database error');
                }
                db.query(priceQuery, function(err, pricelist) {
                        if (err) {
                                console.error('Price query error:', err);
                                return res.status(500).send('Database error');
                        }
                        db.query(extraQuery, function(err, extraPricelist) {
                                if (err) {
                                        console.error('Extra Price query error:', err);
                                        return res.status(500).send('Database error');
                                }
                                res.render('homepage', { ProductData: products, PriceData: pricelist, ExtraPriceData: extraPricelist, __: req.__ });
                        });
                });
        });
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
                                // Convert RowDataPacket arrays to plain objects
                                const plainProducts = products.map(row => ({ ...row }));
                                const plainPricelist = pricelist.map(row => ({ ...row }));
                                const plainExtraPricelist = extraPricelist.map(row => ({ ...row }));
                                                                console.log('Sending to EJS:', {
                                                                        ProductData: plainProducts,
                                                                        PriceData: plainPricelist,
                                                                        ExtraPriceData: plainExtraPricelist
                                                                });
                                                                res.render('menu', { ProductData: plainProducts, PriceData: plainPricelist, ExtraPriceData: plainExtraPricelist, __: req.__ });
                        });
                });
        });
});

app.listen(2000, function() {
        console.log("Server is running on port 2000");
});
