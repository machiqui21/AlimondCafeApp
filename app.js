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

// Ensure orders table exists so we can persist orders
try {
        const createOrdersTable = `
                CREATE TABLE IF NOT EXISTS orders (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        customerName VARCHAR(255),
                        sessionId VARCHAR(128),
                        product VARCHAR(255),
                        size VARCHAR(100),
                        sugar VARCHAR(100),
                        extras TEXT,
                        customSelected VARCHAR(255),
                        qty INT,
                        amountPerItem DECIMAL(10,2),
                        totalAmount DECIMAL(10,2),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        db.query(createOrdersTable, function(err) {
                if (err) {
                        console.error('Could not ensure orders table exists:', err.message || err);
                } else {
                        log('Orders table is ready');
                }
        });
        // NOTE: deferred migration for sessionId will run later after dbQuery is available

        // Also ensure checkout-related tables exist to avoid failures when submitting from order summary
        const createOrderSummaryTable = `
                CREATE TABLE IF NOT EXISTS order_summary (
                        ID INT AUTO_INCREMENT PRIMARY KEY,
                        CustomerName VARCHAR(255) NOT NULL,
                        TotalAmount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                        CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        StatusID INT NOT NULL DEFAULT 1,
                        OrderID INT NULL,
                        PaymentReference VARCHAR(255) NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        const createOrderDetailsTable = `
                CREATE TABLE IF NOT EXISTS order_details (
                        ID INT AUTO_INCREMENT PRIMARY KEY,
                        OrderID INT NOT NULL,
                        ProductID INT NULL,
                        qty INT NOT NULL DEFAULT 0,
                        Price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                        LineTotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                        Create_Date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        Update_Date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX (OrderID),
                        INDEX (ProductID),
                        CONSTRAINT fk_order_details_orders
                            FOREIGN KEY (OrderID) REFERENCES orders(id)
                            ON DELETE CASCADE
                        , CONSTRAINT fk_order_details_product FOREIGN KEY (ProductID) REFERENCES products(ProductID) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        const createOrderItemOptionsTable = `
                CREATE TABLE IF NOT EXISTS order_item_options (
                        ID INT AUTO_INCREMENT PRIMARY KEY,
                        OrderID INT NOT NULL,
                        OrderDetailID INT NULL,
                        ProductID INT NULL,
                        ProductType VARCHAR(64) NULL,
                        Price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                        INDEX (OrderID),
                        INDEX (OrderDetailID),
                        INDEX (ProductID),
                        CONSTRAINT fk_oio_orders FOREIGN KEY (OrderID) REFERENCES orders(id) ON DELETE CASCADE,
                        CONSTRAINT fk_oio_detail FOREIGN KEY (OrderDetailID) REFERENCES order_details(ID) ON DELETE CASCADE
                        , CONSTRAINT fk_oio_product FOREIGN KEY (ProductID) REFERENCES products(ProductID) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        const createOrderItemSizeTable = `
                CREATE TABLE IF NOT EXISTS order_item_size (
                        ID INT AUTO_INCREMENT PRIMARY KEY,
                        OrderID INT NOT NULL,
                        OrderDetailID INT NULL,
                        ProductID INT NULL,
                        Size VARCHAR(100) NULL,
                        Price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                        INDEX (OrderID),
                        INDEX (OrderDetailID),
                        INDEX (ProductID),
                        CONSTRAINT fk_ois_orders FOREIGN KEY (OrderID) REFERENCES orders(id) ON DELETE CASCADE,
                        CONSTRAINT fk_ois_detail FOREIGN KEY (OrderDetailID) REFERENCES order_details(ID) ON DELETE CASCADE
                        , CONSTRAINT fk_ois_product FOREIGN KEY (ProductID) REFERENCES products(ProductID) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        const createStatusTable = `
                CREATE TABLE IF NOT EXISTS status (
                        StatusID INT PRIMARY KEY,
                        StatusDescription VARCHAR(255) NOT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;

        db.query(createOrderSummaryTable, function(err){ if (err) console.error('Ensure order_summary failed:', err.message || err); else log('order_summary table is ready'); });
        db.query(createOrderDetailsTable, function(err){ if (err) console.error('Ensure order_details failed:', err.message || err); else log('order_details table is ready'); });
        db.query(createOrderItemOptionsTable, function(err){ if (err) console.error('Ensure order_item_options failed:', err.message || err); else log('order_item_options table is ready'); });
        db.query(createOrderItemSizeTable, function(err){ if (err) console.error('Ensure order_item_size failed:', err.message || err); else log('order_item_size table is ready'); });
        db.query(createStatusTable, function(err){ if (err) console.error('Ensure status failed:', err.message || err); else {
                log('status table is ready');
                // seed default Pending status if missing
                try {
                        db.query('INSERT IGNORE INTO status (StatusID, StatusDescription) VALUES (1, "Pending")', function(seedErr){ if (seedErr) console.warn('Seed status Pending failed (non-fatal):', seedErr.message || seedErr); });
                } catch(se){ /* ignore */ }
        }});

        // Migrations: add OrderDetailID to option/size tables if missing and ensure all FKs reference orders(id)
        try {
                const migQuery = 'SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?';
                const dbName = (db && db.config && (db.config.database || (db.config.connectionConfig && db.config.connectionConfig.database)))
                        ? (db.config.database || db.config.connectionConfig.database)
                        : 'alimondcafe';
                db.query(migQuery, [dbName, 'order_item_options', 'OrderDetailID'], function(err, rows){
                        if (!err) {
                                const need = !(rows && rows[0] && (rows[0].cnt||rows[0].CNT));
                                if (need) {
                                        db.query('ALTER TABLE order_item_options ADD COLUMN OrderDetailID INT NULL, ADD INDEX (OrderDetailID)', function(alterErr){ if (alterErr) console.warn('Migration add OrderDetailID to order_item_options failed:', alterErr.message||alterErr); });
                                }
                        }
                });
                db.query(migQuery, [dbName, 'order_item_size', 'OrderDetailID'], function(err, rows){
                        if (!err) {
                                const need = !(rows && rows[0] && (rows[0].cnt||rows[0].CNT));
                                if (need) {
                                        db.query('ALTER TABLE order_item_size ADD COLUMN OrderDetailID INT NULL, ADD INDEX (OrderDetailID)', function(alterErr){ if (alterErr) console.warn('Migration add OrderDetailID to order_item_size failed:', alterErr.message||alterErr); });
                                }
                        }
                });

                // Add or switch foreign keys to reference orders(id). If older constraints exist, drop them first.
                function ensureFk(constraintName, alterSql, dropFirstNames) {
                        const checkFk = 'SELECT COUNT(*) AS cnt FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_NAME = ?';
                        db.query(checkFk, [dbName, constraintName], function(e, r){
                                if (e) return; // skip on error silently
                                const has = r && r[0] && (r[0].cnt||r[0].CNT);
                                if (!has) {
                                        function addIt(){ db.query(alterSql, function(e2){ if (e2) console.warn('Add FK '+constraintName+' failed:', e2.message||e2); }); }
                                        if (Array.isArray(dropFirstNames) && dropFirstNames.length) {
                                                let pending = dropFirstNames.length;
                                                dropFirstNames.forEach(function(nm){
                                                        db.query('ALTER TABLE '+ (alterSql.indexOf('order_item_options')!==-1 ? 'order_item_options' : alterSql.indexOf('order_item_size')!==-1 ? 'order_item_size' : 'order_details') +' DROP FOREIGN KEY '+ nm, function(){ if(--pending===0) addIt(); });
                                                });
                                        } else { addIt(); }
                                }
                        });
                }
                // Drop legacy FKs referencing order_summary and re-create pointing to orders(id)
                ensureFk('fk_order_details_orders', 'ALTER TABLE order_details ADD CONSTRAINT fk_order_details_orders FOREIGN KEY (OrderID) REFERENCES orders(id) ON DELETE CASCADE', ['fk_order_details_header']);
                // Product foreign keys are handled by ensureProductForeignKeys() after we inspect products schema to avoid errno 150
                ensureFk('fk_oio_orders', 'ALTER TABLE order_item_options ADD CONSTRAINT fk_oio_orders FOREIGN KEY (OrderID) REFERENCES orders(id) ON DELETE CASCADE', ['fk_oio_header']);
                ensureFk('fk_oio_detail', 'ALTER TABLE order_item_options ADD CONSTRAINT fk_oio_detail FOREIGN KEY (OrderDetailID) REFERENCES order_details(ID) ON DELETE CASCADE');
                ensureFk('fk_ois_orders', 'ALTER TABLE order_item_size ADD CONSTRAINT fk_ois_orders FOREIGN KEY (OrderID) REFERENCES orders(id) ON DELETE CASCADE', ['fk_ois_header']);
                ensureFk('fk_ois_detail', 'ALTER TABLE order_item_size ADD CONSTRAINT fk_ois_detail FOREIGN KEY (OrderDetailID) REFERENCES order_details(ID) ON DELETE CASCADE');

                // Ensure order_details.OrderID is indexed and not null
                try { db.query('ALTER TABLE order_details MODIFY COLUMN OrderID INT NOT NULL'); } catch(_e) {}
        } catch(e) { /* non-fatal */ }
} catch (e) {
        console.warn('Orders table creation failed:', e.message || e);
}

// Warmup DB pool as early as possible to surface handshake issues before first request
try { if (db && typeof db.warmup === 'function') { db.warmup().then(function(ok){ if (!ok) console.warn('DB warmup could not complete; continuing'); }); } } catch(e){}

app.get('/', function(req, res) {
        // Get highlighted products first (where highlights.ProductID = products.ProductID)
        const highlightsQuery = `
                SELECT p.*, h.Description as HighlightDescription 
                FROM products p 
                JOIN highlights h ON h.ProductID = p.ProductID 
                WHERE p.Category = 'Standard'
                ORDER BY h.ID`;
        
        // Get all other standard products not in highlights
        const otherProductsQuery = `
                SELECT p.* 
                FROM products p 
                WHERE p.Category = 'Standard' 
                AND p.ProductID NOT IN (SELECT ProductID FROM highlights)
                ORDER BY p.Name`;

        // Add per-query timeout to avoid long hangs on a slow handshake
        db.query({ sql: highlightsQuery, timeout: 60_000 }, function(err, highlightedProducts) {
                if (err) {
                        console.error('Highlighted products query error:', err);
                        return res.status(500).send('Database error');
                }
                
                db.query({ sql: otherProductsQuery, timeout: 60_000 }, function(err, otherProducts) {
                        if (err) {
                                console.error('Other products query error:', err);
                                return res.status(500).send('Database error');
                        }
                        
                        // Combine highlighted products first, then others
                        const allProducts = [...highlightedProducts, ...otherProducts];
                        // Load About content (Title, Description, Image) if available
                        // Be lenient about About table schema (no assumption about an 'id' column)
                        const aboutQuery = "SELECT Title, Description, Image FROM About LIMIT 1";
                        db.query({ sql: aboutQuery, timeout: 60_000 }, function(err, aboutRows){
                                if (err) {
                                        console.warn('About query error (non-fatal):', err && err.message || err);
                                }
                                const about = (aboutRows && aboutRows[0]) ? { ...aboutRows[0] } : null;
                                log('Homepage AboutData:', about);
                                res.render('homepage', { 
                                        ProductData: allProducts,
                                        HighlightedProducts: highlightedProducts,
                                        OtherProducts: otherProducts,
                                        AboutData: about,
                                        __: req.__ 
                                });
                        });
                });
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

// Ensure 'orders' is the parent table (drop any accidental FKs from orders -> order_details)
(async function ensureOrdersIsParent(){
        try {
                const dbName = (db && db.config && (db.config.database || (db.config.connectionConfig && db.config.connectionConfig.database)))
                        ? (db.config.database || db.config.connectionConfig.database)
                        : 'alimondcafe';
                // Gather bad constraints from both REFERENTIAL_CONSTRAINTS and KEY_COLUMN_USAGE
                const rcRows = await dbQuery(
                        "SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? AND TABLE_NAME='orders' AND REFERENCED_TABLE_NAME='order_details'",
                        [dbName]
                ).catch(()=>[]);
                const kcuRows = await dbQuery(
                        "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND TABLE_NAME='orders' AND REFERENCED_TABLE_NAME='order_details'",
                        [dbName]
                ).catch(()=>[]);
                const names = new Set();
                (rcRows||[]).forEach(r=>{ if (r.CONSTRAINT_NAME || r.constraint_name) names.add(r.CONSTRAINT_NAME||r.constraint_name); });
                (kcuRows||[]).forEach(r=>{ if (r.CONSTRAINT_NAME || r.constraint_name) names.add(r.CONSTRAINT_NAME||r.constraint_name); });

                // Fallback: parse SHOW CREATE TABLE for any FK referencing order_details
                try {
                        const sct = await dbQuery('SHOW CREATE TABLE orders');
                        const createSql = sct && sct[0] && (sct[0]['Create Table'] || sct[0]['Create Table'.toLowerCase()]) ? (sct[0]['Create Table'] || sct[0]['Create Table'.toLowerCase()]) : null;
                        if (createSql) {
                                const regex = /CONSTRAINT `([^`]+)` FOREIGN KEY \([^\)]+\) REFERENCES `order_details`/g;
                                let m; while ((m = regex.exec(createSql)) !== null) { if (m[1]) names.add(m[1]); }
                        }
                } catch(e){ /* ignore */ }

                if (names.size) {
                        for (const cname of names) {
                                try {
                                        await dbQuery('ALTER TABLE orders DROP FOREIGN KEY `'+cname+'`');
                                        log('[migrate] Dropped wrong FK on orders: '+cname);
                                } catch(e){ console.warn('[migrate] Failed to drop wrong FK '+cname+' on orders:', e.message||e); }
                        }
                } else {
                        // As a last resort, attempt common auto names
                        const guesses = ['orders_ibfk_1','orders_ibfk_2','orders_ibfk_3'];
                        for (const g of guesses) {
                                try { await dbQuery('ALTER TABLE orders DROP FOREIGN KEY `'+g+'`'); log('[migrate] Dropped guessed wrong FK on orders: '+g); } catch(e) { /* ignore */ }
                        }
                }
        } catch(e) {
                console.warn('[migrate] ensureOrdersIsParent error:', e && e.message || e);
        }
})();

// Post-create robust migration to fix FK errors to products table (errno 150)
(async function ensureProductForeignKeys(){
        try {
                // Determine current database name
                const dbName = (db && db.config && (db.config.database || (db.config.connectionConfig && db.config.connectionConfig.database)))
                        ? (db.config.database || db.config.connectionConfig.database)
                        : 'alimondcafe';

                // Ensure products table exists and is InnoDB
                const tRows = await dbQuery("SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME='products'", [dbName]);
                const engine = tRows && tRows[0] && tRows[0].ENGINE ? tRows[0].ENGINE : null;
                if (engine && engine.toLowerCase() !== 'innodb') {
                        try { await dbQuery('ALTER TABLE products ENGINE=InnoDB'); log('[migrate] Converted products to InnoDB'); } catch(e) { console.warn('[migrate] Convert products to InnoDB failed:', e.message||e); }
                }

                // Inspect product id columns
                const cRows = await dbQuery("SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='products'", [dbName]);
                const cols = (cRows||[]).reduce((acc,r)=>{ acc[r.COLUMN_NAME]=r; return acc; }, {});
                // Choose referenced column preference: ProductID > ID > id > existing PRI
                let refCol = null; let refColType = null;
                if (cols['ProductID']) { refCol = 'ProductID'; refColType = cols['ProductID'].COLUMN_TYPE; }
                else if (cols['ID']) { refCol = 'ID'; refColType = cols['ID'].COLUMN_TYPE; }
                else if (cols['id']) { refCol = 'id'; refColType = cols['id'].COLUMN_TYPE; }
                else {
                        // find a primary key
                        const pri = (cRows||[]).find(r=> (r.COLUMN_KEY||'').toUpperCase()==='PRI');
                        if (pri) { refCol = pri.COLUMN_NAME; refColType = pri.COLUMN_TYPE; }
                }

                // If nothing suitable, add a new ProductID PK
                if (!refCol) {
                        try {
                                await dbQuery('ALTER TABLE products ADD COLUMN ProductID INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY');
                                refCol = 'ProductID'; refColType = 'int(10) unsigned';
                                log('[migrate] Added products.ProductID as AUTO_INCREMENT PRIMARY KEY');
                        } catch(e) {
                                console.warn('[migrate] Could not add ProductID to products:', e.message||e);
                                return; // cannot proceed with FKs
                        }
                }

                // Ensure referenced column is indexed (if not primary)
                try {
                        const kRows = await dbQuery("SHOW INDEX FROM products WHERE Column_name = ?", [refCol]);
                        if (!kRows || !kRows.length) {
                                await dbQuery('ALTER TABLE products ADD INDEX idx_products_'+refCol+' (`'+refCol+'`)');
                                log('[migrate] Added index on products.'+refCol);
                        }
                } catch(e) { console.warn('[migrate] Ensure index on products.'+refCol+' failed:', e.message||e); }

                // Determine UNSIGNED-ness of referenced type
                const isUnsigned = (refColType||'').toLowerCase().indexOf('unsigned') !== -1;
                const localType = 'INT' + (isUnsigned ? ' UNSIGNED' : '');

                // Make local ProductID columns match signedness
                const alters = [
                        'ALTER TABLE order_details MODIFY COLUMN ProductID '+localType+' NULL',
                        'ALTER TABLE order_item_options MODIFY COLUMN ProductID '+localType+' NULL',
                        'ALTER TABLE order_item_size MODIFY COLUMN ProductID '+localType+' NULL'
                ];
                for (const sql of alters) { try { await dbQuery(sql); } catch(e) { /* ignore */ } }

                // Ensure child tables are InnoDB in case they were created earlier with MyISAM
                async function ensureInnoDB(table){
                        try {
                                const tr = await dbQuery("SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?", [dbName, table]);
                                const eng = tr && tr[0] && tr[0].ENGINE ? tr[0].ENGINE : null;
                                if (eng && eng.toLowerCase() !== 'innodb') { await dbQuery('ALTER TABLE '+table+' ENGINE=InnoDB'); log('[migrate] Converted '+table+' to InnoDB'); }
                        } catch(e) { console.warn('[migrate] Ensure InnoDB for '+table+' failed:', e.message||e); }
                }
                await ensureInnoDB('order_details');
                await ensureInnoDB('order_item_options');
                await ensureInnoDB('order_item_size');

                // Drop existing product FKs if present (names used in our app)
                const dropIfExists = async (table, cname) => {
                        try { await dbQuery('ALTER TABLE '+table+' DROP FOREIGN KEY '+cname); } catch(e) { /* ignore */ }
                };
                // Quietly check if a mismatched FK exists referencing wrong column/table
                const fkList = await dbQuery("SELECT CONSTRAINT_NAME, TABLE_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? AND REFERENCED_TABLE_NAME='products'", [dbName]).catch(()=>[]);
                const presentNames = new Set((fkList||[]).map(r=>r.CONSTRAINT_NAME));
                if (presentNames.has('fk_order_details_product')) await dropIfExists('order_details','fk_order_details_product');
                if (presentNames.has('fk_oio_product')) await dropIfExists('order_item_options','fk_oio_product');
                if (presentNames.has('fk_ois_product')) await dropIfExists('order_item_size','fk_ois_product');

                // Clean existing dangling references (set to NULL where product not found) before adding FKs
                try { await dbQuery('UPDATE order_details od LEFT JOIN products p ON p.`'+refCol+'` = od.ProductID SET od.ProductID = NULL WHERE od.ProductID IS NOT NULL AND p.`'+refCol+'` IS NULL'); } catch(e){ /* ignore */ }
                try { await dbQuery('UPDATE order_item_options o LEFT JOIN products p ON p.`'+refCol+'` = o.ProductID SET o.ProductID = NULL WHERE o.ProductID IS NOT NULL AND p.`'+refCol+'` IS NULL'); } catch(e){ /* ignore */ }
                try { await dbQuery('UPDATE order_item_size s LEFT JOIN products p ON p.`'+refCol+'` = s.ProductID SET s.ProductID = NULL WHERE s.ProductID IS NOT NULL AND p.`'+refCol+'` IS NULL'); } catch(e){ /* ignore */ }

                // Recreate FKs pointing to products(refCol)
                // Add FKs only if ProductID column exists in child tables
                async function safeAddFk(table, cname){
                        try {
                                const colCheck = await dbQuery("SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME='ProductID'", [dbName, table]);
                                const hasCol = colCheck && colCheck[0] && (colCheck[0].cnt||colCheck[0].CNT||0);
                                if (!hasCol) { log('[migrate] Skip '+cname+'; '+table+'.ProductID does not exist'); return; }
                                await dbQuery('ALTER TABLE '+table+' ADD CONSTRAINT '+cname+' FOREIGN KEY (ProductID) REFERENCES products(`'+refCol+'`) ON DELETE SET NULL');
                                log('[migrate] Added '+cname+' -> products('+refCol+')');
                        } catch(e){ console.warn('[migrate] Add '+cname+' failed:', e.message||e); }
                }
                await safeAddFk('order_details','fk_order_details_product');
                await safeAddFk('order_item_options','fk_oio_product');
                await safeAddFk('order_item_size','fk_ois_product');
        } catch(e) {
                console.warn('[migrate] ensureProductForeignKeys error:', e && e.message || e);
        }
})();

// Run a safe migration: ensure orders.sessionId column exists (session-scoping)
(async function ensureSessionIdColumn(){
        try {
                const dbName = (db && db.config && (db.config.database || (db.config.connectionConfig && db.config.connectionConfig.database)))
                        ? (db.config.database || db.config.connectionConfig.database)
                        : 'alimondcafe';
                const checkSql = "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'sessionId'";
                const rows = await dbQuery(checkSql, [dbName]);
                const cnt = rows && rows[0] && (rows[0].cnt || rows[0].CNT || rows[0]['COUNT(*)']) ? (rows[0].cnt || rows[0].CNT || rows[0]['COUNT(*)']) : 0;
                if (!cnt) {
                        await dbQuery("ALTER TABLE orders ADD COLUMN sessionId VARCHAR(128)");
                        log('Added orders.sessionId column via migration');
                } else {
                        log('orders.sessionId column already present');
                }
        } catch (e) {
                // log but don't crash
                console.warn('sessionId migration check failed:', e && e.message || e);
        }
})();

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

                                                                                                // If persistence is disabled, respond immediately (session-only behavior)
                                                                                                if (!PERSIST_ORDERS) {
                                                                                                                if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
                                                                                                                                return res.json({ success: true, orderId: localId, orders: req.session.orders });
                                                                                                                }
                                                                                                                return res.redirect('/order-summary');
                                                                                                }

                                                                                                // persist to DB when enabled
                                                                                                const insertSql = 'INSERT INTO orders (customerName, sessionId, product, size, sugar, extras, customSelected, qty, amountPerItem, totalAmount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
                                                                                                const extrasSerialized = JSON.stringify(extras || []);
                                                                                                const params = [customerName, req.sessionID, productName, size, sugar, extrasSerialized, customSelected, qty, amountPerItem.toFixed(2), totalAmount.toFixed(2)];
                                                                                                try {
                                                                                                                let result;
                                                                                                                try {
                                                                                                                        result = await dbQuery(insertSql, params);
                                                                                                                } catch (insErr) {
                                                                                                                        // Fallback: some DBs may not have sessionId column (older installs). If insert fails
                                                                                                                        // because of an unknown column, retry without sessionId to maintain compatibility.
                                                                                                                        var msg = (insErr && insErr.message) ? insErr.message.toString().toLowerCase() : '';
                                                                                                                        if (msg.indexOf('unknown column') !== -1 || msg.indexOf('er_bad_field_error') !== -1 || msg.indexOf('sessionid') !== -1) {
                                                                                                                                try {
                                                                                                                                        const insertSql2 = 'INSERT INTO orders (customerName, product, size, sugar, extras, customSelected, qty, amountPerItem, totalAmount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
                                                                                                                                        const params2 = [customerName, productName, size, sugar, extrasSerialized, customSelected, qty, amountPerItem.toFixed(2), totalAmount.toFixed(2)];
                                                                                                                                        result = await dbQuery(insertSql2, params2);
                                                                                                                                } catch (insErr2) {
                                                                                                                                        throw insErr2; // rethrow if fallback also fails
                                                                                                                                }
                                                                                                                        } else {
                                                                                                                                throw insErr; // unknown error, rethrow
                                                                                                                        }
                                                                                                                }
                                                                                                                if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
                                                                                                                                const insertedId = result && result.insertId ? result.insertId : null;
                                                                                                                                return res.json({ success: true, orderId: insertedId || localId, orders: req.session.orders });
                                                                                                                }
                                                                                                                return res.redirect('/order-summary');
                                                                                                } catch (insErr) {
                                                                                                                console.error('Failed to persist order to DB:', insErr.message || insErr);
                                                                                                                if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
                                                                                                                                return res.status(500).json({ success: false, error: 'db', message: insErr.message || '' });
                                                                                                                }
                                                                                                                return res.redirect('/order-summary');
                                                                                                }
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
                                        // persistence enabled and no session data: load from DB by sessionId
                                        const sql = "SELECT * FROM orders WHERE sessionId = ? ORDER BY created_at DESC";
                                        db.query(sql, [req.sessionID], function(err, rows) {
                                                if (err) {
                                                        console.error('Failed to load orders from DB for session', err && err.message || err);
                                                        return res.render('orderSummary', { orders: [], __: req.__ });
                                                }
                                                // Parse extras JSON back into arrays for display
                                                const plain = (rows || []).map(function(r) {
                                                        let extrasArr = [];
                                                        try { extrasArr = r.extras ? JSON.parse(r.extras) : []; } catch (e) { extrasArr = []; }
                                                        return {
                                                                id: r.id,
                                                                customerName: r.customerName,
                                                                product: r.product,
                                                                size: r.size,
                                                                sugar: r.sugar,
                                                                extras: extrasArr,
                                                                customSelected: r.customSelected,
                                                                qty: r.qty,
                                                                amountPerItem: r.amountPerItem,
                                                                totalAmount: r.totalAmount,
                                                                created_at: r.created_at
                                                        };
                                                });
                                                const sanitized = sanitizeOrders(plain);
                                                return res.render('orderSummary', { orders: sanitized, __: req.__ });
                                        });
                                });

                                // Clear orders from session (and DB rows for this session if persistence enabled)
                                app.post('/clear-orders', async function(req, res) {
                                        try {
                                                if (req.session) req.session.orders = [];
                                                if (PERSIST_ORDERS) {
                                                        await dbQuery('DELETE FROM orders WHERE sessionId = ?', [req.sessionID]);
                                                }
                                                return res.redirect('/order-summary');
                                        } catch (e) { console.error('clear-orders error', e); return res.redirect('/order-summary'); }
                                });

                                // Update a single order's qty (AJAX)
                                app.post('/order-update', express.json(), async function(req, res){
                                        try {
                                                var id = req.body.id; var qty = parseInt(req.body.qty,10) || 0;
                                                if (!id) return res.json({ success:false, message:'missing id' });
                                                if (!PERSIST_ORDERS) {
                                                        // session-only mode: find local order and update
                                                        if (!req.session || !req.session.orders) return res.json({ success:false, message:'no session orders' });
                                                        var found = req.session.orders.find(function(o){ return (o._localId && o._localId === id); });
                                                        if (!found) return res.json({ success:false, message:'order not found' });
                                                        found.qty = qty;
                                                        // keep numeric in session; format only at render time
                                                        var perNum = parseFloat(found.amountPerItem || 0) || 0;
                                                        found.totalAmount = perNum * qty;
                                                        return res.json({ success:true });
                                                }
                                                // persistence mode: update DB row for this session
                                                const rows = await dbQuery('SELECT * FROM orders WHERE id = ? AND sessionId = ? LIMIT 1', [id, req.sessionID]);
                                                if (!rows || !rows[0]) return res.json({ success:false, message:'order not found' });
                                                const row = rows[0];
                                                const amountPerItem = parseFloat(row.amountPerItem || 0) || 0;
                                                const totalAmount = (qty * amountPerItem).toFixed(2);
                                                await dbQuery('UPDATE orders SET qty = ?, totalAmount = ? WHERE id = ? AND sessionId = ?', [qty, totalAmount, id, req.sessionID]);
                                                return res.json({ success:true });
                                        } catch (e) { console.error('order-update error', e); return res.status(500).json({ success:false, error: e.message || '' }); }
                                });

                                // Edit order fields (qty and/or customerName) for a specific order (session or DB)
                                app.post('/order-edit', express.json(), async function(req, res){
                                        try {
                                                var id = req.body.id; if (!id) return res.json({ success:false, message:'missing id' });
                                                var qty = typeof req.body.qty !== 'undefined' ? parseInt(req.body.qty,10) : undefined;
                                                var customerName = typeof req.body.customerName !== 'undefined' ? (req.body.customerName||'').toString() : undefined;

                                                if (!PERSIST_ORDERS) {
                                                        // session-only: find by _localId
                                                        if (!req.session || !req.session.orders) return res.json({ success:false, message:'no session orders' });
                                                        var found = req.session.orders.find(function(o){ return (o._localId && o._localId === id); });
                                                        if (!found) return res.json({ success:false, message:'order not found' });
                                                        if (typeof qty !== 'undefined') {
                                                                found.qty = qty;
                                                                var perNum = parseFloat(found.amountPerItem||0) || 0;
                                                                found.totalAmount = perNum * qty; // keep numeric
                                                        }
                                                        if (typeof customerName !== 'undefined') { found.customerName = customerName; }
                                                        return res.json({ success:true });
                                                }

                                                // persistence mode: update DB row scoped to this session
                                                const rows = await dbQuery('SELECT * FROM orders WHERE id = ? AND sessionId = ? LIMIT 1', [id, req.sessionID]);
                                                if (!rows || !rows[0]) return res.json({ success:false, message:'order not found' });
                                                const row = rows[0];
                                                var updates = [];
                                                var params = [];
                                                if (typeof qty !== 'undefined') { updates.push('qty = ?'); params.push(qty); params.push((parseFloat(row.amountPerItem||0)*qty).toFixed(2)); updates.push('totalAmount = ?'); }
                                                if (typeof customerName !== 'undefined') { updates.push('customerName = ?'); params.push(customerName); }
                                                if (updates.length === 0) return res.json({ success:true });
                                                // build query: note params order depends on pushes above; ensure id and sessionId appended
                                                var setClause = updates.join(', ');
                                                // append id and sessionId at end
                                                params.push(id); params.push(req.sessionID);
                                                var sql = 'UPDATE orders SET ' + setClause + ' WHERE id = ? AND sessionId = ?';
                                                await dbQuery(sql, params);
                                                return res.json({ success:true });
                                        } catch (e) { console.error('order-edit error', e); return res.status(500).json({ success:false, error: e.message || '' }); }
                                });

                                // Remove a single order (AJAX)
                                app.post('/order-remove', express.json(), async function(req, res){
                                        try {
                                                var id = req.body.id;
                                                if (!id) return res.json({ success:false, message:'missing id' });
                                                if (!PERSIST_ORDERS) {
                                                        if (!req.session || !req.session.orders) return res.json({ success:false, message:'no session orders' });
                                                        // remove local order by _localId
                                                        var before = req.session.orders.length;
                                                        req.session.orders = req.session.orders.filter(function(o){ return !(o._localId && o._localId === id); });
                                                        let remainingLocal = req.session.orders.length;
                                                        return res.json({ success:true, remaining: remainingLocal });
                                                }
                                                await dbQuery('DELETE FROM orders WHERE id = ? AND sessionId = ?', [id, req.sessionID]);
                                                const rows = await dbQuery('SELECT COUNT(*) as cnt FROM orders WHERE sessionId = ?', [req.sessionID]);
                                                const remainingCount = (rows && rows[0] && rows[0].cnt) ? parseInt(rows[0].cnt,10) : 0;
                                                return res.json({ success:true, remaining: remainingCount });
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

                log('[checkout] starting. customerName=%s cartCount=%d sessionId=%s', customerName, cart.length, req.sessionID);
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

                // Create master order row (authoritative OrderID)
                let orderId = null; let statusId = 1;
                const orderBaseResult = await dbQuery('INSERT INTO orders (customerName, sessionId, product, size, sugar, extras, customSelected, qty, amountPerItem, totalAmount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [customerName, req.sessionID, '', '', '', '[]', '', 0, 0, orderTotal.toFixed(2)]);
                orderId = orderBaseResult && orderBaseResult.insertId ? orderBaseResult.insertId : null;
                if (!orderId) throw new Error('Failed to create master order row');
                log('[checkout] master order created orderId=%s', orderId);

                // Create summary row referencing the master order
                const summaryResult = await dbQuery('INSERT INTO order_summary (CustomerName, TotalAmount, CreatedAt, StatusID, OrderID, PaymentReference) VALUES (?, ?, NOW(), ?, ?, ?)',
                        [customerName, orderTotal.toFixed(2), statusId, orderId, null]);
                const summaryId = summaryResult && summaryResult.insertId ? summaryResult.insertId : null;
                log('[checkout] order_summary created id=%s for orderId=%s', summaryId, orderId);
                const effectiveOrderIdForDetails = orderId; // now always orders.id

                // Preload products to resolve ids/prices for options
                const allCustoms = await dbQuery("SELECT * FROM products WHERE Category='Custom'");
                const allExtras = await dbQuery("SELECT * FROM products WHERE Category='Extras'");
                const allProducts = await dbQuery("SELECT * FROM products WHERE Category IN ('Standard','Custom','Extras')");
                // Preload size prices (for order_item_size rows)
                const allSizePrices = await dbQuery("SELECT * FROM size_prices").catch(async () => {
                        try { return await dbQuery("SELECT * FROM sizes_prices"); } catch(e) { return []; }
                });

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
                                // order_details row (base line item)
                                const detailResult = await dbQuery('INSERT INTO order_details (OrderID, ProductID, qty, Price, LineTotal, Create_Date, Update_Date) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
                                              [effectiveOrderIdForDetails, prodId, o.qty, pricePer.toFixed(2), lineTotal.toFixed(2)]);
                                const orderDetailId = detailResult && detailResult.insertId ? detailResult.insertId : null;
                                log('[checkout] -> order_details inserted ID=%s', orderDetailId);

                                // Size (if present) -> order_item_size
                                if (o.size) {
                                        // resolve size price from preloaded data
                                        const want = o.size.toString().trim().toLowerCase();
                                        let sizePriceRow = null;
                                        if (Array.isArray(allSizePrices)) {
                                                sizePriceRow = allSizePrices.find(r => {
                                                        // match by product id when available
                                                        const rProd = r.ProductID || r.product_id || r.productId || r.product || null;
                                                        if (prodId && rProd && String(rProd) == String(prodId)) {
                                                                const lbl = (r.size || r.Item || r.Size || r.sizeName || r.label || '').toString().trim().toLowerCase();
                                                                return lbl === want;
                                                        }
                                                        // otherwise match by type
                                                        const spType = (r.Type || r.type || r.productType || '').toString().trim().toLowerCase();
                                                        const prodRow = allProducts.find(p => (p.ProductID||p.id||null) && String(p.ProductID||p.id) === String(prodId));
                                                        const prodType = prodRow ? (prodRow.Type||prodRow.type||'').toString().trim().toLowerCase() : '';
                                                        if (spType && prodType && spType === prodType) {
                                                                const lbl = (r.size || r.Item || r.Size || r.sizeName || r.label || '').toString().trim().toLowerCase();
                                                                return lbl === want;
                                                        }
                                                        return false;
                                                }) || null;
                                        }
                                        const sizePrice = sizePriceRow ? (parseFloat(sizePriceRow.price || sizePriceRow.Amount || sizePriceRow.Price || 0) || 0) : 0;
                                        await dbQuery('INSERT INTO order_item_size (OrderID, OrderDetailID, ProductID, Size, Price) VALUES (?, ?, ?, ?, ?)', [orderId, orderDetailId, prodId, o.size, sizePrice.toFixed(2)]).then(r=>{
                                                log('[checkout] -> order_item_size inserted (detailId=%s size=%s price=%s)', orderDetailId, o.size, sizePrice.toFixed(2));
                                        }).catch(err=>{ console.warn('[checkout] order_item_size insert failed:', err.message||err); });
                                }

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

                // Post-check summary counts for debugging (not critical path)
                try {
                        const [c1] = await dbQuery('SELECT COUNT(*) AS cnt FROM orders');
                        const [c2] = await dbQuery('SELECT COUNT(*) AS cnt FROM order_summary');
                        const [c3] = await dbQuery('SELECT COUNT(*) AS cnt FROM order_details');
                        const [c4] = await dbQuery('SELECT COUNT(*) AS cnt FROM order_item_size');
                        const [c5] = await dbQuery('SELECT COUNT(*) AS cnt FROM order_item_options');
                        log('[checkout] table counts after insertion -> orders=%s summary=%s details=%s size=%s options=%s', c1 && c1.cnt, c2 && c2.cnt, c3 && c3.cnt, c4 && c4.cnt, c5 && c5.cnt);
                } catch(countErr) { console.warn('[checkout] post-insert counts failed:', countErr.message||countErr); }

                // Update master order row with aggregated representation (optional summary product list)
                try {
                        const productNames = sanitized.map(i => i.product).filter(Boolean);
                        await dbQuery('UPDATE orders SET product = ?, qty = ?, amountPerItem = ?, totalAmount = ? WHERE id = ?', [productNames.join(', '), sanitized.length, 0, orderTotal.toFixed(2), orderId]);
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
                const headerRows = await dbQuery('SELECT os.*, s.StatusDescription FROM order_summary os LEFT JOIN status s ON s.StatusID = os.StatusID WHERE os.OrderID = ? LIMIT 1', [masterOrderId]);
                const header = headerRows && headerRows[0] ? headerRows[0] : { OrderID: masterOrderId, CustomerName: orderRow[0].customerName, TotalAmount: orderRow[0].totalAmount, StatusID: 1, StatusDescription: 'Pending' };

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