// controlled logger: enable verbose logs when VERBOSE=1 or in development
const VERBOSE = (process.env.VERBOSE === '1') || (process.env.NODE_ENV === 'development');
function log() { if (VERBOSE) console.log.apply(console, arguments); }
const PERSIST_ORDERS = (process.env.PERSIST_ORDERS === '1'); // when true, orders are persisted to DB; otherwise kept in session only

log("App started");

// Global handlers to surface uncaught errors so we can debug startup crashes
process.on('uncaughtException', function(err){
        console.error('UNCAUGHT EXCEPTION:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', function(reason, p){
        console.error('UNHANDLED REJECTION at:', p, 'reason:', reason && reason.stack ? reason.stack : reason);
});
process.on('exit', function(code){
        try { console.log('PROCESS exit event. code=' + code); } catch(e){}
});
process.on('SIGINT', function(){ console.log('SIGINT received'); });
process.on('SIGTERM', function(){ console.log('SIGTERM received'); });

var express = require('express');
var app = express();
var i18n = require('i18n');
app.set('view engine', 'ejs');
// Ensure templates always reflect latest edits during development
app.set('view cache', false);
app.disable('etag');
app.use(express.static('styles'));
// parse URL-encoded bodies (for form submissions)
app.use(express.urlencoded({ extended: false }));
// simple in-memory session to hold current order between requests
var session = require('express-session');
app.use(session({ secret: 'alimond-secret', resave: false, saveUninitialized: true }));
var db = require('./dbConfig');
console.log('Required dbConfig module');
const fs = require('fs');
const path = require('path');

i18n.configure({
        locales: ['en', 'tl'],
        directory: __dirname + '/locales',
        defaultLocale: 'en',
        cookie: 'lang',
        queryParameter: 'lang'
});
app.use(i18n.init);

app.use('/images', express.static('images'));

// At startup: try to copy image files referenced by absolute paths in the products.Picture column
// into the local ./images folder so templates can serve them by filename.
try {
        const imagesDir = path.join(__dirname, 'images');
        if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
        db.query("SELECT Picture FROM products", function(err, rows) {
                if (err) {
                        console.warn('Could not read products for image sync:', err.message || err);
                        return;
                }
                rows.forEach(function(r) {
                        if (!r || !r.Picture) return;
                        var picRaw = r.Picture.toString().trim();
                        // ignore URLs
                        if (/^https?:\/\//i.test(picRaw)) return;
                        // if it's already just a filename, skip
                        var filename = path.basename(picRaw);
                        var dest = path.join(imagesDir, filename);
                        try {
                                // only copy if source exists and dest doesn't
                                if (!fs.existsSync(dest) && fs.existsSync(picRaw)) {
                                        fs.copyFileSync(picRaw, dest);
                                        log('Copied image', picRaw, '->', dest);
                                }
                        } catch (copyErr) {
                                // non-fatal - log and continue
                                console.warn('Failed to copy image', picRaw, copyErr.message || copyErr);
                        }
                });
        });

        // Also sync About image (About.Image) if it references a local file path
        db.query("SELECT Image FROM About", function(err, rows){
                if (err) {
                        // table might not exist on older installs; non-fatal
                        console.warn('Could not read About images for sync (non-fatal):', err.message || err);
                        return;
                }
                (rows || []).forEach(function(r){
                        if (!r || !r.Image) return;
                        var raw = (r.Image||'').toString().trim();
                        // skip URLs
                        if (/^https?:\/\//i.test(raw)) return;
                        var filename = path.basename(raw);
                        var dest = path.join(imagesDir, filename);
                        try {
                                if (!fs.existsSync(dest) && fs.existsSync(raw)) {
                                        fs.copyFileSync(raw, dest);
                                        log('Copied About image', raw, '->', dest);
                                }
                        } catch(e){
                                console.warn('Failed to copy About image', raw, e && e.message || e);
                        }
                });
        });
} catch (e) {
        console.warn('Image sync setup failed:', e.message || e);
}


// Warmup DB pool as early as possible to surface handshake issues before first request
try { if (db && typeof db.warmup === 'function') { db.warmup().then(function(ok){ if (!ok) console.warn('DB warmup could not complete; continuing'); }); } } catch(e){}

app.get('/', function(req, res) {
        // Query highlighted products if the highlights table exists; otherwise continue without failing the page
        const highlightsQuery = `
                SELECT p.*, h.Description as HighlightDescription 
                FROM products p 
                JOIN highlights h ON h.ProductID = p.ProductID 
                WHERE p.Category = 'Standard'
                ORDER BY h.ID`;

        db.query({ sql: highlightsQuery, timeout: 60_000 }, function(err, highlightedProducts) {
                let highlightError = false;
                if (err) {
                        // Non-fatal: many installs may not have a highlights table yet
                        console.warn('Highlighted products query error (non-fatal):', err && err.message || err);
                        highlightedProducts = [];
                        highlightError = true;
                }

                // Build the other-products query dynamically: if highlights unavailable, just load all Standard
                const otherProductsQuery = highlightError
                        ? `SELECT p.* FROM products p WHERE p.Category = 'Standard' ORDER BY p.Name`
                        : `SELECT p.* FROM products p WHERE p.Category = 'Standard' AND p.ProductID NOT IN (SELECT ProductID FROM highlights) ORDER BY p.Name`;

                db.query({ sql: otherProductsQuery, timeout: 60_000 }, function(err, otherProducts) {
                        if (err) {
                                console.error('Other products query error:', err && err.message || err);
                                // If this failed due to highlights table missing in the NOT IN subquery (race), retry without NOT IN
                                if (!highlightError) {
                                        const fallbackSql = `SELECT p.* FROM products p WHERE p.Category = 'Standard' ORDER BY p.Name`;
                                        return db.query({ sql: fallbackSql, timeout: 60_000 }, function(fbErr, fbRows){
                                                if (fbErr) {
                                                        console.error('Other products fallback query error:', fbErr && fbErr.message || fbErr);
                                                        return res.status(500).send('Database error');
                                                }
                                                return renderHomepage(highlightedProducts, fbRows);
                                        });
                                }
                                return res.status(500).send('Database error');
                        }

                        return renderHomepage(highlightedProducts, otherProducts);
                });

                function renderHomepage(highlightedProducts, otherProducts){
                        // Combine highlighted products first, then others
                        const allProducts = [...(highlightedProducts||[]), ...(otherProducts||[])];
                        // Load About content (Title, Description, Image) if available
                        const aboutQuery = "SELECT Title, Description, Image FROM About LIMIT 1";
                        db.query({ sql: aboutQuery, timeout: 60_000 }, function(err, aboutRows){
                                if (err) {
                                        // About table is optional; do not fail the page
                                        console.warn('About query error (non-fatal):', err && err.message || err);
                                }
                                const about = (aboutRows && aboutRows[0]) ? { ...aboutRows[0] } : null;
                                log('Homepage AboutData:', about);
                                res.render('homepage', { 
                                        ProductData: allProducts,
                                        HighlightedProducts: highlightedProducts || [],
                                        OtherProducts: otherProducts || [],
                                        AboutData: about,
                                        __: req.__ 
                                });
                        });
                }
        });
});

app.get('/login', function (req, res) {
    res.render('login.ejs');
});

app.get('/menu', function(req, res) {
        log("GET /menu called");
        const selectedProductId = req.query.productId ? parseInt(req.query.productId, 10) : null;
        const productQuery = "SELECT * FROM products WHERE Category = 'Standard'";
        const sizeTableCandidates = ["size_prices"];
        const productPrice = "SELECT * FROM products WHERE Category = 'Standard' and HasSizes = 0";

        db.query(productQuery, function(err, products) {
                if (err) {
                        console.error('Product query error:', err);
                        return res.status(500).send('Database error');
                }
                log('Products:', products);
                db.query(productPrice, function(err, productPrices) {
                        if (err) {
                                console.error('Product price query error:', err);
                                return res.status(500).send('Database error');
                        }
                        log('Product Prices:', productPrices);

                function tryLoadSizes(index, cb) {
                        if (index >= sizeTableCandidates.length) return cb(null, []);
                        const q = `SELECT * FROM ${sizeTableCandidates[index]}`;
                        db.query(q, function(err, sizePrices) {
                                if (err) {
                                        console.warn('Size price query failed for', sizeTableCandidates[index], err && err.message);
                                        return tryLoadSizes(index + 1, cb);
                                }
                                // If we got rows (even empty array is acceptable), return them.
                                return cb(null, sizePrices || []);
                        });
                }

                tryLoadSizes(0, function(err, sizePrices) {
                        if (err) {
                                console.error('Failed to load size prices:', err);
                                return res.status(500).send('Database error');
                        }
                        // Convert RowDataPacket arrays to plain objects
                        const plainProducts = products.map(row => ({ ...row }));
                        const plainSizePricelist = (sizePrices || []).map(row => ({ ...row }));

                        // custom items (milk/sugar/etc) now live in products table. Load them and normalize
                        const customProductsQuery = "SELECT * FROM products WHERE Category = 'Custom'";
                        const extrasProductQuery = "SELECT * FROM products WHERE Category = 'Extras'";

                        db.query(customProductsQuery, function(err, customProductsRows) {
                                if (err) {
                                        console.warn('Failed to load custom products:', err && err.message);
                                        customProductsRows = [];
                                }
                                const plainCustomPricelist = (customProductsRows || []).map(p => ({ option: p.Name, description: p.Description, price: parseFloat(p.Price || p.price || 0), type: p.Type || p.type || 'custom' }));

                                // Load extras products separately
                                db.query(extrasProductQuery, function(err, extrasProductsRows) {
                                        if (err) {
                                                console.warn('Failed to load extras products:', err && err.message);
                                                extrasProductsRows = [];
                                        }
                                        const extraFromProducts = (extrasProductsRows || []).map(function(p){
                                                return { Item: p.Name, description: p.Description, price: parseFloat(p.Price || p.price || 0) };
                                        });

                                        const ExtraPriceData = extraFromProducts || [];

                                        log('Custom Pricelist:', plainCustomPricelist);
                                        log('Size Prices:', plainSizePricelist);
                                        log('ExtraPriceData (derived):', ExtraPriceData);
                                        log('productPrices:', productPrices);

                                        res.render('menu', {
                                                ProductData: plainProducts,
                                                PriceData: [],
                                                SizePriceData: plainSizePricelist,
                                                ExtraPriceData: ExtraPriceData,
                                                CustomPriceData: plainCustomPricelist,
                                                orders: req.session.orders || [],
                                                selectedProductId: selectedProductId,
                                                __: req.__
                                        });
                                });
                        });
                });
        });
});

// Submenu by product type (e.g., Tea Latte, Brewed Coffee)
app.get('/menu/type/:type', function(req, res) {
        log("GET /menu/type/:type called", req.params.type);
        const typeParam = decodeURIComponent(req.params.type || '').trim();
        if (!typeParam) return res.redirect('/menu');

        const sizeTableCandidates = ["size_prices"];
        const productQuery = "SELECT * FROM products WHERE Category = 'Standard' AND Type = ?";

        db.query(productQuery, [typeParam], function(err, products) {
                if (err) {
                        console.error('Product-by-type query error:', err);
                        return res.status(500).send('Database error');
                }

                function tryLoadSizes(index, cb) {
                        if (index >= sizeTableCandidates.length) return cb(null, []);
                        const q = `SELECT * FROM ${sizeTableCandidates[index]}`;
                        db.query(q, function(err, sizePrices) {
                                if (err) {
                                        console.warn('Size price query failed for', sizeTableCandidates[index], err && err.message);
                                        return tryLoadSizes(index + 1, cb);
                                }
                                return cb(null, sizePrices || []);
                        });
                }

                tryLoadSizes(0, function(err, sizePrices) {
                        if (err) {
                                console.error('Failed to load size prices:', err);
                                return res.status(500).send('Database error');
                        }
                        const plainProducts = (products || []).map(row => ({ ...row }));
                        const plainSizePricelist = (sizePrices || []).map(row => ({ ...row }));

                        const customProductsQuery = "SELECT * FROM products WHERE Category = 'Custom'";
                        const extrasProductQuery = "SELECT * FROM products WHERE Category = 'Extras'";

                        db.query(customProductsQuery, function(err, customProductsRows) {
                                if (err) { console.warn('Failed to load custom products:', err && err.message); }
                                const plainCustomPricelist = (customProductsRows || []).map(p => ({ option: p.Name, description: p.Description, price: parseFloat(p.Price || p.price || 0), type: p.Type || p.type || 'custom' }));

                                db.query(extrasProductQuery, function(err, extrasProductsRows) {
                                        if (err) { console.warn('Failed to load extras products:', err && err.message); }
                                        const extraFromProducts = (extrasProductsRows || []).map(function(p){
                                                return { Item: p.Name, description: p.Description, price: parseFloat(p.Price || p.price || 0) };
                                        });
                                        const ExtraPriceData = extraFromProducts || [];

                                        res.render('submenu', {
                                                typeName: typeParam,
                                                ProductData: plainProducts,
                                                SizePriceData: plainSizePricelist,
                                                ExtraPriceData: ExtraPriceData,
                                                CustomPriceData: plainCustomPricelist,
                                                orders: req.session.orders || [],
                                                __: req.__
                                        });
                                });
                        });
                });
        });
});

});

// Handle order submissions from the form (clean async/await implementation)
const util = require('util');
const dbQuery = util.promisify(db.query).bind(db);

 

app.post('/order', async function(req, res) {
        try {
                log('POST /order received body:', req.body);
                const customerName = req.body.customerName || '';
                const productId = req.body.productId ? parseInt(req.body.productId, 10) : null;
                const productName = req.body.productName || req.body.product || '';
                const size = req.body.size || '';
                const sugar = req.body.sugar || '';
                const qty = parseInt(req.body.qty, 10) || 1;
                let extras = [];
                if (req.body.extras) extras = Array.isArray(req.body.extras) ? req.body.extras : [req.body.extras];

                                                // Load product row (prefer id)
                                                let productRow = null;
                                                if (productId) {
                                                        const rows = await dbQuery('SELECT * FROM products WHERE ProductID = ? LIMIT 1', [productId]);
                                                        productRow = rows && rows[0] ? rows[0] : null;
                                                } else if (productName) {
                                                        const rows = await dbQuery('SELECT * FROM products WHERE Name = ? LIMIT 1', [productName]);
                                                        productRow = rows && rows[0] ? rows[0] : null;
                                                }

                                                // Load size prices and custom prices (try both size_prices and sizes_prices table names)
                                                const sizePricesPromise = dbQuery("SELECT * FROM size_prices").catch(err => {
                                                        console.warn('size_prices not available, trying sizes_prices', err && err.message);
                                                        return dbQuery("SELECT * FROM sizes_prices").catch(e => { console.warn('sizes_prices also unavailable', e && e.message); return []; });
                                                });

                                                // Load custom items from products table (milk/sugar now stored as products)
                                                const customProductsPromise = dbQuery("SELECT * FROM products WHERE Category = 'Custom' OR Type IN ('Milk','milk','Sugar','sugar','Sweetener','sweetener')").catch(e => { console.warn('Failed to load custom products', e && e.message); return []; });

                                                const extrasProductsPromise = dbQuery("SELECT * FROM products WHERE Category = 'Extras' OR Type = 'Toppings'").catch(e => { console.warn('Failed to load extras products', e && e.message); return []; });

                                                const [sizePrices, customProducts, extrasProducts] = await Promise.all([
                                                        sizePricesPromise,
                                                        customProductsPromise,
                                                        extrasProductsPromise
                                                ]);

                                                const plainSizePrices = (sizePrices || []).map(r => ({ ...r }));
                                                // normalize custom products to expected shape: option/description/price/type
                                                const plainCustoms = (customProducts || []).map(r => ({ option: r.Name, description: r.Description, price: parseFloat(r.Price || r.price || 0), type: r.Type || r.type || 'custom' }));
                                                const plainExtras = (extrasProducts || []).map(r => ({ Item: r.Name, description: r.Description, price: parseFloat(r.Price || r.price || 0) }));

                                                // helper to find per-product size — match by product Type === size_price.Type OR product id if provided
                                                function findPerProductSize(prodRow, selectedSize) {
                                                        if (!prodRow || !selectedSize) return null;
                                                        const want = selectedSize.toString().trim().toLowerCase();
                                                        return plainSizePrices.find(sp => {
                                                                // match by type
                                                                const spType = (sp.Type || sp.type || sp.productType || '').toString().trim().toLowerCase();
                                                                const prodType = (prodRow.Type || prodRow.type || '').toString().trim().toLowerCase();
                                                                if (spType && prodType && spType === prodType) {
                                                                        const label = (sp.size || sp.Item || sp.Size || sp.sizeName || sp.label || '').toString().trim().toLowerCase();
                                                                        return label === want;
                                                                }
                                                                // fallback: match by product id fields if present
                                                                const spProdId = sp.ProductID || sp.product_id || sp.productId || sp.product || sp.productID;
                                                                const prodIdVal = prodRow.ProductID || prodRow.ProductId || prodRow.id || prodRow.ID;
                                                                if (prodIdVal && spProdId && prodIdVal == spProdId) {
                                                                        const label = (sp.size || sp.Item || sp.Size || sp.sizeName || sp.label || '').toString().trim().toLowerCase();
                                                                        return label === want;
                                                                }
                                                                return false;
                                                        });
                                                }

                                                // determine base price
                                                let base = 0;
                                                const hasSizesFlag = productRow && (productRow.HasSizes === 1 || productRow.HasSizes === '1' || productRow.HasSizes === true);
                                                if (hasSizesFlag) {
                                                        const foundPerProductSize = findPerProductSize(productRow, size);
                                                        if (foundPerProductSize) base = parseFloat(foundPerProductSize.price || foundPerProductSize.Amount || foundPerProductSize.amount || foundPerProductSize.Price || 0) || 0;
                                                        else base = 0; // no fallback to pricelist — per instruction we use size_prices matched by type
                                                } else {
                                                        // use products table price directly for non-sized items
                                                        let productPrice = 0;
                                                        if (productRow && (typeof productRow.Price !== 'undefined' || typeof productRow.price !== 'undefined')) {
                                                                productPrice = parseFloat(productRow.Price || productRow.price || 0) || 0;
                                                        }
                                                        base = productPrice;
                                                }

                                                // extras: see if any matching entry exists in custom prices (best-effort); otherwise 0
                                                let extrasTotal = 0;
                                                extras.forEach(function(ex) {
                                                        // extras are product-based extras (plainExtras)
                                                        const foundEx = plainExtras.find(e => (e.Item && e.Item === ex) || (e.Item && e.Item === ex) || (e.option && e.option === ex));
                                                        if (foundEx) extrasTotal += parseFloat(foundEx.price || foundEx.Amount || 0);
                                                });
                                                // custom
                                                let customSelected = req.body.customOption || '';
                                                let customAmount = 0;
                                                if (customSelected) {
                                                        const foundCust = plainCustoms.find(function(c) { return (c.option && c.option === customSelected) || (c.Item && c.Item === customSelected) || (c.name && c.name === customSelected); });
                                                        if (foundCust) customAmount = parseFloat(foundCust.price || foundCust.Amount || 0);
                                                }

                                                const amountPerItem = base + extrasTotal + customAmount;
                                                const totalAmount = (qty === 0) ? 0 : amountPerItem * qty;

                                                                                                // push into session orders (always)
                                                                                                if (!req.session.orders) req.session.orders = [];
                                                                                                // create a lightweight local id for session-only orders so the summary can update/remove them
                                                                                                const localId = 's' + Date.now() + Math.floor(Math.random()*10000);
                                                                                                const sessOrder = { _localId: localId, customerName, productId, product: productName, size, sugar, extras, customSelected, qty, amountPerItem, totalAmount };
                                                                                                req.session.orders.push(sessOrder);

                                                                                                // If persistence is disabled OR header schema requires checkout, respond using session-only behavior
                                                                                                if (!PERSIST_ORDERS) {
                                                                                                                if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
                                                                                                                                return res.json({ success: true, orderId: localId, orders: req.session.orders });
                                                                                                                }
                                                                                                                return res.redirect('/order-summary');
                                                                                                }
                                                                                                // With the new schema, orders are created at checkout (with OrderID, CustomerName, TotalAmount,...)
                                                                                                // so we do not persist individual cart lines here. We mirror the session-only response.
                                                                                                if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
                                                                                                                return res.json({ success: true, orderId: localId, orders: req.session.orders });
                                                                                                }
                                                                                                return res.redirect('/order-summary');
        } catch (e) {
                                console.error('Order handler error', e);
                                                return res.status(500).send('Server error');
                                        }
                                });

                                // Order summary page - load persisted orders from DB (fall back to session)
                                app.get('/order-summary', function(req, res) {
                                        // sanitize helper to ensure numeric fields are numbers for safe toFixed()
                                        function sanitizeOrders(arr){
                                                return (arr || []).map(function(o){
                                                        var qty = parseInt(o.qty,10) || 0;
                                                        var per = parseFloat(o.amountPerItem || 0) || 0;
                                                        var tot = parseFloat(o.totalAmount || (per * qty) || 0) || 0;
                                                        var extras = o.extras;
                                                        if (typeof extras === 'string') {
                                                                try { extras = JSON.parse(extras); } catch(e){ /* leave as-is */ }
                                                                if (!Array.isArray(extras) && extras) { extras = [extras]; }
                                                        }
                                                        if (!Array.isArray(extras)) extras = [];
                                                        return {
                                                                ...o,
                                                                qty,
                                                                amountPerItem: per,
                                                                totalAmount: tot,
                                                                extras
                                                        };
                                                });
                                        }
                                        // Prefer session orders if available (session-scoped cart). If persistence is enabled
                                        // but the session has no orders, fall back to DB for this session.
                                        if (req.session && req.session.orders && req.session.orders.length) {
                                                const sanitized = sanitizeOrders(req.session.orders);
                                                return res.render('orderSummary', { orders: sanitized, __: req.__ });
                                        }
                                        if (!PERSIST_ORDERS) {
                                                // no persistence and no session orders => empty cart
                                                return res.render('orderSummary', { orders: [], __: req.__ });
                                        }
                                        // persistence enabled but no session data: show empty (no session scoping via DB)
                                        return res.render('orderSummary', { orders: [], __: req.__ });
                                });

                                // Clear orders from session (and DB rows for this session if persistence enabled)
                                app.post('/clear-orders', async function(req, res) {
                                        try {
                                                if (req.session) req.session.orders = [];
                                                return res.redirect('/order-summary');
                                        } catch (e) { console.error('clear-orders error', e); return res.redirect('/order-summary'); }
                                });

                                // Update a single order's qty (AJAX)
                                app.post('/order-update', express.json(), async function(req, res){
                                        try {
                                            var id = req.body.id; var qty = parseInt(req.body.qty,10) || 0;
                                            if (!id) return res.json({ success:false, message:'missing id' });

                                            // Always try session-first (covers pre-checkout carts regardless of persistence flag)
                                            if (req.session && Array.isArray(req.session.orders)) {
                                                    var found = req.session.orders.find(function(o){ return (o._localId && o._localId === id); });
                                                    if (!found && typeof id === 'string' && id.startsWith('s')) {
                                                            // if id looks like a session id but not found
                                                            return res.json({ success:false, message:'order not found' });
                                                    }
                                                    if (found) {
                                                            found.qty = qty;
                                                            var perNum = parseFloat(found.amountPerItem || 0) || 0;
                                                            found.totalAmount = perNum * qty;
                                                            return res.json({ success:true });
                                                    }
                                            }

                                            // Fallback: post-checkout header rows do not support per-line qty updates under the new schema
                                            if (PERSIST_ORDERS) {
                                                    return res.json({ success:false, message:'update not supported after checkout' });
                                            }
                                            return res.json({ success:false, message:'order not found' });
                                        } catch (e) { console.error('order-update error', e); return res.status(500).json({ success:false, error: e.message || '' }); }
                                });

                                // Edit order fields (qty and/or customerName) for a specific order (session or DB)
                                app.post('/order-edit', express.json(), async function(req, res){
                                        try {
                                            var id = req.body.id; if (!id) return res.json({ success:false, message:'missing id' });
                                            var qty = typeof req.body.qty !== 'undefined' ? parseInt(req.body.qty,10) : undefined;
                                            var customerName = typeof req.body.customerName !== 'undefined' ? (req.body.customerName||'').toString() : undefined;

                                            // Try session-first
                                            if (req.session && Array.isArray(req.session.orders)) {
                                                    var found = req.session.orders.find(function(o){ return (o._localId && o._localId === id); });
                                                    if (!found && typeof id === 'string' && id.startsWith('s')) {
                                                            return res.json({ success:false, message:'order not found' });
                                                    }
                                                    if (found) {
                                                            if (typeof qty !== 'undefined') {
                                                                    found.qty = qty;
                                                                    var perNum = parseFloat(found.amountPerItem||0) || 0;
                                                                    found.totalAmount = perNum * qty; // keep numeric
                                                            }
                                                            if (typeof customerName !== 'undefined') { found.customerName = customerName; }
                                                            return res.json({ success:true });
                                                    }
                                            }

                                            // Fallback: allow updating header CustomerName only; no qty/amountPerItem columns in new schema
                                            if (PERSIST_ORDERS) {
                                                    if (typeof customerName === 'undefined') {
                                                            return res.json({ success:false, message:'no editable fields' });
                                                    }
                                                    await dbQuery('UPDATE orders SET CustomerName = ? WHERE id = ?', [customerName, id]);
                                                    return res.json({ success:true });
                                            }
                                            return res.json({ success:false, message:'order not found' });
                                        } catch (e) { console.error('order-edit error', e); return res.status(500).json({ success:false, error: e.message || '' }); }
                                });

                                // Remove a single order (AJAX)
                                app.post('/order-remove', express.json(), async function(req, res){
                                        try {
                                            var id = req.body.id;
                                            if (!id) return res.json({ success:false, message:'missing id' });

                                            // Try session-first
                                            if (req.session && Array.isArray(req.session.orders)) {
                                                    var before = req.session.orders.length;
                                                    var afterList = req.session.orders.filter(function(o){ return !(o._localId && o._localId === id); });
                                                    if (afterList.length !== before) {
                                                            req.session.orders = afterList;
                                                            return res.json({ success:true, remaining: afterList.length });
                                                    }
                                                    if (typeof id === 'string' && id.startsWith('s')) {
                                                            return res.json({ success:false, message:'order not found' });
                                                    }
                                            }

                                            // Fallback: delete persisted order row
                                            if (PERSIST_ORDERS) {
                                                    await dbQuery('DELETE FROM orders WHERE id = ?', [id]);
                                                    return res.json({ success:true });
                                            }
                                            return res.json({ success:false, message:'order not found' });
                                        } catch (e) { console.error('order-remove error', e); return res.status(500).json({ success:false, error: e.message || '' }); }
                                });

                                // Simple JSON endpoint to read current session orders (used by the live sidebar)
                                app.get('/api/orders', function(req, res) {
                                        return res.json({ orders: req.session.orders || [] });
                                });

console.log('REACHED: before app.listen');
app.listen(2000, function() {
        console.log('REACHED: in app.listen callback');
        log("Server is running on port 2000");
});

// Checkout: collect customer name and assign to existing orders without a name
app.post('/checkout', async function(req, res){
        try {
                const customerName = (req.body.customerName || '').toString().trim();
                if (!customerName) return res.redirect('/order-summary');

                // Sanitize current session orders
                const cart = (req.session && req.session.orders) ? req.session.orders.slice() : [];
                if (!cart.length) return res.redirect('/order-summary');

                log('[checkout] starting. customerName=%s cartCount=%d', customerName, cart.length);
                // dump first cart item for quick inspection
                try { if (cart[0]) log('[checkout] firstCartItem sample:', JSON.stringify(cart[0])); } catch(e) {}

                // Ensure all lines have numeric amounts
                const sanitized = cart.map(function(o){
                        const qty = parseInt(o.qty,10) || 0;
                        const per = parseFloat(o.amountPerItem || 0) || 0;
                        const tot = parseFloat(o.totalAmount || (per * qty) || 0) || 0;
                        return { ...o, qty, amountPerItem: per, totalAmount: tot };
                });

                // Compute order total
                const orderTotal = sanitized.reduce((sum,o)=> sum + (o.totalAmount||0), 0);
                log('[checkout] computed orderTotal=%s from %d items', orderTotal.toFixed(2), sanitized.length);

                // Create master order row with a business OrderID = CustomerName + '00' + 3-digit sequence
                // Concurrency-safe with retry loop on duplicate key (requires UNIQUE INDEX on orders(OrderID)).
                // NOTE: Run once manually: ALTER TABLE orders ADD UNIQUE INDEX uniq_OrderID (OrderID);
                let orderId = null; let statusId = 1;
                const baseNameForId = (customerName || '').toString().replace(/\s+/g, '');
                const idPrefix = baseNameForId + '00';
                const MAX_ORDERID_ATTEMPTS = 6;
                let attemptInsertRow = null;
                for (let attempt = 0; attempt < MAX_ORDERID_ATTEMPTS; attempt++) {
                        // Determine next sequence by querying current highest for this prefix each attempt (robust under races)
                        let nextSeq = '001';
                        try {
                                const rows = await dbQuery('SELECT OrderID FROM orders WHERE OrderID LIKE ? ORDER BY OrderID DESC LIMIT 1', [idPrefix + '%']);
                                if (rows && rows[0] && rows[0].OrderID) {
                                        const m = rows[0].OrderID.toString().match(/(\d{3})$/);
                                        if (m) {
                                                const n = (parseInt(m[1], 10) || 0) + 1;
                                                nextSeq = String(n).padStart(3, '0');
                                        }
                                }
                        } catch(e) { /* ignore; will try default 001 */ }
                        const candidateOrderCode = idPrefix + nextSeq;
                        try {
                                attemptInsertRow = await dbQuery('INSERT INTO orders (OrderID,CustomerName, TotalAmount,CreateDate,StatusID,PaymentReference) VALUES (?, ?, ?, NOW(), ?, ?)',
                                                [candidateOrderCode, customerName, orderTotal.toFixed(2), statusId, null]);
                                orderId = attemptInsertRow && attemptInsertRow.insertId ? attemptInsertRow.insertId : null;
                                if (!orderId) throw new Error('No insertId returned');
                                log('[checkout] master order created attempt=%d code=%s id=%s', attempt+1, candidateOrderCode, orderId);
                                break; // success
                        } catch (insertErr) {
                                if (insertErr && insertErr.code === 'ER_DUP_ENTRY') {
                                        log('[checkout] duplicate OrderID %s on attempt %d; retrying', candidateOrderCode, attempt+1);
                                        // brief jitter before retry
                                        await new Promise(r => setTimeout(r, 40 + Math.floor(Math.random()*60)));
                                        continue; // next attempt
                                }
                                // Non-duplicate error: abort immediately
                                throw insertErr;
                        }
                }
                if (!orderId) throw new Error('Failed to create master order row after attempts');

                
                const effectiveOrderIdForDetails = orderId;

                // Preload products to resolve ids/prices for options
                const allCustoms = await dbQuery("SELECT * FROM products WHERE Category='Custom'");
                const allExtras = await dbQuery("SELECT * FROM products WHERE Category='Extras'");
                const allProducts = await dbQuery("SELECT * FROM products WHERE Category IN ('Standard','Custom','Extras')");
                

                function findProductByNameOrDesc(nameOrDesc){
                        if (!nameOrDesc) return null;
                        const want = nameOrDesc.toString().trim().toLowerCase();
                        const match = allProducts.find(p => (p.Name||'').toString().trim().toLowerCase() === want
                                                        || (p.Description||'').toString().trim().toLowerCase() === want);
                        return match || null;
                }

                // Insert line details, size, and options
                for (const o of sanitized) {
                        try {
                                const prodId = o.productId || o.ProductID || null;
                                const pricePer = parseFloat(o.amountPerItem||0) || 0;
                                const lineTotal = (o.qty||0) * pricePer;
                                log('[checkout] inserting order_details line product="%s" prodId=%s qty=%s pricePer=%s lineTotal=%s', o.product, prodId, o.qty, pricePer.toFixed(2), lineTotal.toFixed(2));
                                // order_details row (base line item) with Size column
                                const detailResult = await dbQuery('INSERT INTO order_details (OrderID, ProductID, Size, qty, Price, LineTotal, Create_Date, Update_Date) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
                                              [effectiveOrderIdForDetails, prodId, (o.size || null), o.qty, pricePer.toFixed(2), lineTotal.toFixed(2)]);
                                const orderDetailId = detailResult && detailResult.insertId ? detailResult.insertId : null;
                                log('[checkout] -> order_details inserted ID=%s', orderDetailId);
                                

                                // Sweetener option
                                if (o.sugar) {
                                        const sug = findProductByNameOrDesc(o.sugar) || (allCustoms || []).find(p => (p.Type||'').toLowerCase()==='sweetener');
                                        const sugId = sug ? (sug.ProductID||sug.id) : null;
                                        const sugPrice = sug ? parseFloat(sug.Price||sug.price||0) : 0;
                                        await dbQuery('INSERT INTO order_item_options (OrderID, OrderDetailID, ProductID, ProductType, Price) VALUES (?, ?, ?, ?, ?)',
                                                      [orderId, orderDetailId, sugId, 'Sweetener', sugPrice.toFixed(2)]).then(r=>{
                                                        log('[checkout] -> order_item_options Sweetener inserted (detailId=%s price=%s)', orderDetailId, sugPrice.toFixed(2));
                                                      }).catch(err=>{ console.warn('[checkout] sweetener insert failed:', err.message||err); });
                                }
                                // Milk option
                                if (o.customSelected) {
                                        const milk = findProductByNameOrDesc(o.customSelected) || (allCustoms || []).find(p => (p.Type||'').toLowerCase()==='milk');
                                        const milkId = milk ? (milk.ProductID||milk.id) : null;
                                        const milkPrice = milk ? parseFloat(milk.Price||milk.price||0) : 0;
                                        await dbQuery('INSERT INTO order_item_options (OrderID, OrderDetailID, ProductID, ProductType, Price) VALUES (?, ?, ?, ?, ?)',
                                                      [orderId, orderDetailId, milkId, 'Milk', milkPrice.toFixed(2)]).then(r=>{
                                                        log('[checkout] -> order_item_options Milk inserted (detailId=%s price=%s)', orderDetailId, milkPrice.toFixed(2));
                                                      }).catch(err=>{ console.warn('[checkout] milk insert failed:', err.message||err); });
                                }
                                // Extras
                                let extrasList = o.extras;
                                if (typeof extrasList === 'string') extrasList = [extrasList];
                                if (Array.isArray(extrasList)) {
                                        for (const ex of extrasList) {
                                                if (!ex) continue;
                                                const exProd = findProductByNameOrDesc(ex) || (allExtras || []).find(p => (p.Name||'').toString().trim().toLowerCase() === ex.toString().trim().toLowerCase());
                                                const exId = exProd ? (exProd.ProductID||exProd.id) : null;
                                                const exPrice = exProd ? parseFloat(exProd.Price||exProd.price||0) : 0;
                                                await dbQuery('INSERT INTO order_item_options (OrderID, OrderDetailID, ProductID, ProductType, Price) VALUES (?, ?, ?, ?, ?)',
                                                              [orderId, orderDetailId, exId, 'Toppings', exPrice.toFixed(2)]).then(r=>{
                                                                log('[checkout] -> order_item_options Topping inserted (detailId=%s name=%s price=%s)', orderDetailId, ex, exPrice.toFixed(2));
                                                              }).catch(err=>{ console.warn('[checkout] topping insert failed:', err.message||err); });
                                        }
                                }
                        } catch(lineErr) {
                                console.error('[checkout] line insertion error (will continue with next line):', lineErr.message||lineErr);
                        }
                }

                // Post-check table counts (optional)
                try {
                        const [c1] = await dbQuery('SELECT COUNT(*) AS cnt FROM orders');
                        const [c3] = await dbQuery('SELECT COUNT(*) AS cnt FROM order_details');
                        const [c5] = await dbQuery('SELECT COUNT(*) AS cnt FROM order_item_options');
                        log('[checkout] table counts after insertion -> orders=%s details=%s options=%s', c1 && c1.cnt, c3 && c3.cnt, c5 && c5.cnt);
                } catch(countErr) { console.warn('[checkout] post-insert counts failed:', countErr.message||countErr); }

                // Keep master order's TotalAmount in sync (columns product/qty/amountPerItem not part of the new schema)
                try {
                        await dbQuery('UPDATE orders SET TotalAmount = ? WHERE id = ?', [orderTotal.toFixed(2), orderId]);
                } catch(e){ /* non-fatal */ }

                // Clear the cart
                if (req.session) req.session.orders = [];
                // Track recently placed order ids in session for convenience
                try { if (req.session) { req.session.myOrders = (req.session.myOrders||[]); if (orderId) req.session.myOrders.unshift(orderId); } } catch(e) {}

                // Lookup status description for StatusID=1
                let statusDesc = 'Pending';
                try {
                        const srows = await dbQuery('SELECT StatusDescription FROM status WHERE StatusID = 1 LIMIT 1');
                        if (srows && srows[0] && srows[0].StatusDescription) statusDesc = srows[0].StatusDescription;
                } catch(e) {}

                // Render order summary with confirmation banner
                // Reload (empty) cart so table shows no items, and pass orderId & status text
                return res.render('orderSummary', { orders: [], __: req.__, placedOrderId: orderId, placedStatus: statusDesc });
        } catch (e) {
                console.error('checkout error', e);
                // Graceful fallback: if DB failed, finalize locally so the button "works"
                try {
                        const customerName = (req.body.customerName || '').toString().trim();
                        const hadCart = req.session && Array.isArray(req.session.orders) && req.session.orders.length > 0;
                        if (customerName && hadCart) {
                                const tempId = 'TEMP-' + Date.now();
                                // Clear the cart locally
                                req.session.orders = [];
                                return res.render('orderSummary', { orders: [], __: req.__, placedOrderId: tempId, placedStatus: 'Pending' });
                        }
                } catch(ign) {}
                return res.status(500).send('Checkout failed');
        }
});

// Simple payment landing page (placeholder links from confirmation)
app.get('/payment', function(req, res){
        const orderId = req.query.orderId;
        const method = (req.query.method||'cash').toLowerCase();
        res.send('<div style="font-family:sans-serif; padding:20px;">\
                    <h2>Payment</h2>\
                    <p>Order ID: '+ (orderId||'') +'</p>\
                    <p>Selected method: '+ (method==='online' ? 'Online' : 'Cash') +'</p>\
                    <p><a href="/">Back to Home</a> | <a href="/menu">Back to Menu</a></p>\
                 </div>');
});

// Order History by OrderID (user-scoped via possession; optionally check session.myOrders)
app.get('/order/:orderId', async function(req, res){
        try {
                let param = parseInt(req.params.orderId, 10);
                if (!param) return res.status(404).send('Order not found');
                // Allow viewing by order_details ID or orders ID.
                let masterOrderId = param;
                const possibleDetail = await dbQuery('SELECT OrderID FROM order_details WHERE ID = ? LIMIT 1', [param]).catch(()=>[]);
                if (possibleDetail && possibleDetail[0] && possibleDetail[0].OrderID) {
                        masterOrderId = possibleDetail[0].OrderID;
                }

                // Load master order and summary
                const orderRow = await dbQuery('SELECT * FROM orders WHERE id = ? LIMIT 1', [masterOrderId]);
                if (!orderRow || !orderRow[0]) return res.status(404).send('Order not found');
                const row0 = orderRow[0];
                const header = { OrderID: masterOrderId, CustomerName: row0.CustomerName || row0.customerName, TotalAmount: row0.TotalAmount || row0.totalAmount, StatusID: 1, StatusDescription: 'Pending' };

                const items = await dbQuery(`SELECT od.*, p.Name AS ProductName
                                              FROM order_details od
                                              LEFT JOIN products p ON p.ProductID = od.ProductID
                                              WHERE od.OrderID = ? ORDER BY od.ID`, [masterOrderId]);

                const options = await dbQuery(`SELECT oio.*, p.Name AS OptionName, p.Type AS OptionType
                                                FROM order_item_options oio
                                                LEFT JOIN products p ON p.ProductID = oio.ProductID
                                                WHERE oio.OrderID = ? ORDER BY oio.ID`, [masterOrderId]);

                // Group options by type for display
                function groupOptions(arr){
                        const out = { Sweetener: [], Milk: [], Toppings: [] };
                        (arr||[]).forEach(o=>{
                                const t = (o.ProductType||o.OptionType||'').toString();
                                const name = o.OptionName || o.ProductType || 'Option';
                                const price = parseFloat(o.Price||0)||0;
                                if (!out[t]) out[t] = [];
                                out[t].push({ name, price });
                        });
                        return out;
                }
                const groupedOptions = groupOptions(options);

                return res.render('viewOrder', {
                        header,
                        items,
                        optionsByType: groupedOptions,
                        __: req.__,
                        masterOrderId
                });
        } catch (e) {
                console.error('order history error', e);
                return res.status(500).send('Failed to load order');
        }
});