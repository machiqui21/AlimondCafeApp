// controlled logger: enable verbose logs when VERBOSE=1 or in development
const VERBOSE = (process.env.VERBOSE === '1') || (process.env.NODE_ENV === 'development');
function log() { if (VERBOSE) console.log.apply(console, arguments); }
const PERSIST_ORDERS = (process.env.PERSIST_ORDERS === '1'); // when true, orders are persisted to DB; otherwise kept in session only

log("App started");

// Global handlers to surface uncaught errors so we can debug startup crashes
process.on('uncaughtException', function (err) {
        console.error('UNCAUGHT EXCEPTION:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', function (reason, p) {
        console.error('UNHANDLED REJECTION at:', p, 'reason:', reason && reason.stack ? reason.stack : reason);
});
process.on('exit', function (code) {
        try { console.log('PROCESS exit event. code=' + code); } catch (e) { }
});
process.on('SIGINT', function () {
        console.log('SIGINT received - shutting down gracefully...');
        process.exit(0);
});
process.on('SIGTERM', function () {
        console.log('SIGTERM received - shutting down gracefully...');
        process.exit(0);
});

var express = require('express');
var app = express();
var i18n = require('i18n');
var QRCode = require('qrcode');
let bcrypt;
try { bcrypt = require('bcrypt'); }
catch (e) {
        console.warn('bcrypt native module not found, falling back to bcryptjs');
        bcrypt = require('bcryptjs');
}
app.set('view engine', 'ejs');
// Ensure templates always reflect latest edits during development
app.set('view cache', false);
app.disable('etag');
app.use(express.static('styles'));
// parse URL-encoded bodies (for form submissions)
app.use(express.urlencoded({ extended: false }));
// parse JSON bodies (for AJAX requests)
app.use(express.json());
// simple in-memory session to hold current order between requests
var session = require('express-session');
app.use(session({ secret: 'alimond-secret', resave: false, saveUninitialized: true }));
var db = require('./dbConfig');
console.log('Required dbConfig module');
const util = require('util');
const dbQuery = util.promisify(db.query).bind(db);
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

// Warmup DB pool as early as possible to surface handshake issues before first request
try {
        if (db && typeof db.warmup === 'function') {
                db.warmup().then(function (ok) {
                        if (!ok) {
                                console.warn('DB warmup could not complete; continuing');
                                // Fall through to initialize anyway; operations are idempotent
                        } else {
                                // After warmup succeeds, perform startup database operations
                                initializeDatabase();
                                return;
                        }
                        // If warmup failed or returned false, still attempt initialization
                        initializeDatabase();
                }).catch(function () {
                        // On any warmup error, still attempt initialization
                        initializeDatabase();
                });
        } else {
                // No warmup available; initialize immediately
                initializeDatabase();
        }
} catch (e) { try { initializeDatabase(); } catch (_) { } }

function initializeDatabase() {
        try { if (initializeDatabase._ran) return; } catch (e) { }
        try { initializeDatabase._ran = true; } catch (e) { }
        // Ensure users table exists for registration/login (idempotent)
        try {
                const ensureUsersSql = `
                        CREATE TABLE IF NOT EXISTS users (
                                UserID INT NOT NULL AUTO_INCREMENT,
                                FirstName VARCHAR(100) NOT NULL,
                                LastName VARCHAR(100) NOT NULL,
                                Username VARCHAR(100) NOT NULL UNIQUE,
                                Email VARCHAR(255) DEFAULT NULL,
                                MobilePhone VARCHAR(20) DEFAULT NULL,
                                PasswordHash VARCHAR(255) NOT NULL,
                                CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                PRIMARY KEY (UserID)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
                db.query(ensureUsersSql, function (err) { if (err) console.warn('Ensure users table failed:', err && err.message || err); });
        } catch (e) { console.warn('Users table ensure error:', e && e.message || e); }

        // Ensure admin_users table exists (idempotent)
        try {
                const ensureAdminsSql = `
                        CREATE TABLE IF NOT EXISTS admin_users (
                                AdminID INT NOT NULL AUTO_INCREMENT,
                                Username VARCHAR(100) NOT NULL UNIQUE,
                                Email VARCHAR(255) DEFAULT NULL,
                                PasswordHash VARCHAR(255) DEFAULT NULL,
                                Password VARCHAR(255) DEFAULT NULL,
                                CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                PRIMARY KEY (AdminID)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
                db.query(ensureAdminsSql, function (err) {
                        if (err) console.warn('Ensure admin_users table failed:', err && err.message || err);
                });
        } catch (e) { console.warn('Admin table ensure error:', e && e.message || e); }

        // At startup: try to copy image files referenced by absolute paths in the products.Picture column
        // into the local ./images folder so templates can serve them by filename.
        try {
                const imagesDir = path.join(__dirname, 'images');
                if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
                db.query("SELECT Picture FROM products", function (err, rows) {
                        if (err) {
                                console.warn('Could not read products for image sync:', err.message || err);
                                return;
                        }
                        rows.forEach(function (r) {
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
                db.query("SELECT Image FROM About LIMIT 1", function (err, aboutRows) {
                        if (err) {
                                console.warn('Could not read About for image sync:', err.message || err);
                                return;
                        }
                        if (aboutRows && aboutRows[0] && aboutRows[0].Image) {
                                var picRaw = aboutRows[0].Image.toString().trim();
                                if (!/^https?:\/\//i.test(picRaw)) {
                                        var filename = path.basename(picRaw);
                                        var dest = path.join(imagesDir, filename);
                                        try {
                                                if (!fs.existsSync(dest) && fs.existsSync(picRaw)) {
                                                        fs.copyFileSync(picRaw, dest);
                                                        log('Copied About image', picRaw, '->', dest);
                                                }
                                        } catch (copyErr) {
                                                console.warn('Failed to copy About image', picRaw, copyErr.message || copyErr);
                                        }
                                }
                        }
                });
        } catch (e) { console.warn('Image sync error:', e && e.message || e); }
}

app.get('/', function (req, res) {
        // Query highlighted products if the highlights table exists; otherwise continue without failing the page
        const highlightsQuery = `
                SELECT p.*, h.Description as HighlightDescription 
                FROM products p 
                JOIN highlights h ON h.ProductID = p.ProductID 
                WHERE p.Category = 'Standard' AND h.IsActive = 1
                ORDER BY h.DisplayOrder`;

        db.query({ sql: highlightsQuery, timeout: 60_000 }, function (err, highlightedProducts) {
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

                db.query({ sql: otherProductsQuery, timeout: 60_000 }, function (err, otherProducts) {
                        if (err) {
                                console.error('Other products query error:', err && err.message || err);
                                // If this failed due to highlights table missing in the NOT IN subquery (race), retry without NOT IN
                                if (!highlightError) {
                                        const fallbackSql = `SELECT p.* FROM products p WHERE p.Category = 'Standard' ORDER BY p.Name`;
                                        return db.query({ sql: fallbackSql, timeout: 60_000 }, function (fbErr, fbRows) {
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

                function renderHomepage(highlightedProducts, otherProducts) {
                        // Combine highlighted products first, then others
                        const allProducts = [...(highlightedProducts || []), ...(otherProducts || [])];
                        // Load About content (Title, Content, Image) if available
                        const aboutQuery = "SELECT Title, Content, Image FROM About LIMIT 1";
                        db.query({ sql: aboutQuery, timeout: 60_000 }, function (err, aboutRows) {
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
                                        user: req.session.user || null,
                                        adminUser: req.session.adminUser || null,
                                        __: req.__
                                });
                        });
                }
        });
});

app.get('/login', function (req, res) {
        res.render('login.ejs', { error: null, user: req.session.user || null, adminUser: req.session.adminUser || null, currentPath: req.path, __: req.__ });
});

// Registration page (separate window)
app.get('/register', function (req, res) {
        console.log('GET /register - rendering registration page');
        // Get pre-fill data from query parameters (from checkout)
        const preFillName = req.query.name || '';
        const preFillEmail = req.query.email || '';
        const preFillPhone = req.query.phone || '';
        res.render('register.ejs', {
                error: null,
                user: req.session.user || null,
                adminUser: req.session.adminUser || null,
                currentPath: req.path,
                __: req.__,
                preFillName: preFillName,
                preFillEmail: preFillEmail,
                preFillPhone: preFillPhone
        });
});

// Username existence check (JSON)
app.get('/api/users/exists', async function (req, res) {
        try {
                const username = (req.query.username || '').toString().trim();
                if (!username) return res.json({ exists: false });
                const rows = await dbQuery('SELECT UserID FROM users WHERE Username = ? LIMIT 1', [username]).catch(() => []);
                const exists = !!(rows && rows[0]);
                return res.json({ exists });
        } catch (e) {
                return res.json({ exists: false });
        }
});

// User registration (hash password and store in users table)
app.post('/register', async function (req, res) {
        try {
                console.log('Registration attempt:', req.body);
                const firstName = (req.body.firstName || '').toString().trim();
                const lastName = (req.body.lastName || '').toString().trim();
                const username = (req.body.username || '').toString().trim();
                const email = (req.body.email || '').toString().trim() || null;
                const mobilePhone = (req.body.mobilePhone || '').toString().trim();
                const password = (req.body.password || '').toString();
                console.log('Parsed values:', { firstName, lastName, username, email, mobilePhone: mobilePhone || 'empty', passwordLength: password.length });

                // Validation
                if (!firstName || !lastName || !username || !password) {
                        return res.render('register.ejs', { error: 'First Name, Last Name, Username, and Password are required', currentPath: '/register', __: req.__ });
                }
                if (password.length < 6) {
                        return res.render('register.ejs', { error: 'Password must be at least 6 characters', currentPath: '/register', __: req.__ });
                }

                // Validate mobile phone format if provided (basic validation)
                if (mobilePhone) {
                        const phoneRegex = /^[0-9]{10,15}$/;
                        if (!phoneRegex.test(mobilePhone.replace(/[\s\-\(\)]/g, ''))) {
                                return res.render('register.ejs', { error: 'Please enter a valid mobile phone number (10-15 digits)', currentPath: '/register', __: req.__ });
                        }
                }

                // Check if username already exists
                const existing = await dbQuery('SELECT UserID FROM users WHERE Username = ? LIMIT 1', [username]).catch(() => []);
                if (existing && existing[0]) {
                        return res.render('register.ejs', { error: 'Username already taken', currentPath: '/register', __: req.__ });
                }

                const saltRounds = 10;
                const hash = await bcrypt.hash(password, saltRounds);
                console.log('Attempting database insert...');
                const result = await dbQuery(
                        'INSERT INTO users (FirstName, LastName, Username, Email, MobilePhone, PasswordHash) VALUES (?,?,?,?,?,?)',
                        [firstName, lastName, username, email, mobilePhone || null, hash]
                );
                console.log('Database insert successful, insertId:', result.insertId);

                // Load the saved row to display details (no password)
                let saved = null;
                try {
                        if (result && result.insertId) {
                                const rows = await dbQuery('SELECT UserID, FirstName, LastName, Username, Email, MobilePhone, CreatedAt FROM users WHERE UserID = ? LIMIT 1', [result.insertId]);
                                saved = rows && rows[0] ? rows[0] : null;
                        }
                } catch (_) { }

                // Auto-login the user after successful registration
                const userForSession = saved || { UserID: result.insertId, FirstName: firstName, LastName: lastName, Username: username, Email: email, MobilePhone: mobilePhone };
                if (!req.session) req.session = {};
                req.session.user = userForSession;
                console.log('User auto-logged in after registration:', userForSession.Username);

                // Explicitly save the session before rendering
                req.session.save(function (err) {
                        if (err) {
                                console.error('Session save error after registration:', err);
                        }
                        return res.render('registerSuccess.ejs', {
                                user: userForSession,
                                currentPath: '/register',
                                __: req.__
                        });
                });
        } catch (e) {
                console.error('Register error:', e);
                console.error('Error details:', e.message, e.code, e.sqlMessage);
                return res.render('register.ejs', { error: 'Registration failed: ' + (e.message || 'Unknown error'), currentPath: '/register', __: req.__ });
        }
});

// Admin/User login handler with bcrypt support
app.post('/auth', async function (req, res) {
        try {
                const username = (req.body.username || '').toString().trim();
                const password = (req.body.password || '').toString();
                if (!username || !password) {
                        return res.render('login.ejs', { error: 'Username and password are required', currentPath: '/login', __: req.__ });
                }

                function looksHashed(pw) { return typeof pw === 'string' && pw.startsWith('$2'); }

                // 1) Try admin_users first (backward compatible: plain or hashed)
                let adminRow = null;
                try {
                        const rows = await dbQuery('SELECT * FROM admin_users WHERE Username = ? LIMIT 1', [username]);
                        adminRow = (rows && rows[0]) ? rows[0] : null;
                } catch (_) { }

                if (adminRow) {
                        const stored = adminRow.PasswordHash || adminRow.Password || adminRow.password || '';
                        let ok = false;
                        if (looksHashed(stored)) ok = await bcrypt.compare(password, stored);
                        else ok = (stored === password);

                        if (ok) {
                                req.session.adminUser = {
                                        AdminID: adminRow.AdminID,
                                        Username: adminRow.Username,
                                        Email: adminRow.Email || null
                                };
                                return res.redirect('/admin/dashboard');
                        }
                }

                // 2) Try regular users table with bcrypt
                let userRow = null;
                try {
                        const rows = await dbQuery('SELECT * FROM users WHERE Username = ? LIMIT 1', [username]);
                        userRow = (rows && rows[0]) ? rows[0] : null;
                } catch (_) { }

                if (userRow) {
                        const stored = userRow.PasswordHash || userRow.Password || '';
                        const ok = looksHashed(stored) ? await bcrypt.compare(password, stored) : (stored === password);
                        if (ok) {
                                req.session.user = {
                                        UserID: userRow.UserID,
                                        Username: userRow.Username,
                                        Email: userRow.Email || null,
                                        FirstName: userRow.FirstName || null,
                                        LastName: userRow.LastName || null,
                                        MobilePhone: userRow.MobilePhone || null
                                };
                                // Regular users go to menu/home
                                return res.redirect('/');
                        }
                }

                return res.render('login.ejs', { error: 'Invalid username or password', currentPath: '/login', __: req.__ });
        } catch (e) {
                console.error('Login error:', e);
                return res.render('login.ejs', { error: 'Login failed', currentPath: '/login', __: req.__ });
        }
});

// Logout
app.get('/logout', function (req, res) {
        req.session.destroy();
        res.redirect('/login');
});

// Middleware to check if user is logged in
function requireUser(req, res, next) {
        if (req.session && req.session.user) {
                return next();
        }
        res.redirect('/login');
}

// Middleware to check if admin is logged in
function requireAdmin(req, res, next) {
        if (req.session && req.session.adminUser) {
                return next();
        }
        res.redirect('/login');
}

// User Orders - View order history for logged-in user
app.get('/my-orders', requireUser, async function (req, res) {
        try {
                const userId = req.session.user.UserID;

                // Get all orders for this user
                const orders = await dbQuery(`
            SELECT o.*, s.StatusName 
            FROM orders o 
            LEFT JOIN status s ON o.StatusID = s.StatusID 
            WHERE o.UserID = ?
            ORDER BY o.CreatedAt DESC
        `, [userId]);

                // For each order, get the items and options
                for (let order of orders) {
                        const items = await dbQuery(`
                SELECT od.*, p.Name AS ProductName
                FROM order_details od
                LEFT JOIN products p ON p.ProductID = od.ProductID
                WHERE od.OrderID = ?
                ORDER BY od.OrderDetailID
            `, [order.OrderID]);

                        // For each item, get its options
                        for (let item of items) {
                                const options = await dbQuery(`
                    SELECT * FROM order_item_options
                    WHERE OrderDetailID = ?
                `, [item.OrderDetailID]);
                                item.options = options;
                        }

                        order.items = items;
                }

                res.render('userOrders', {
                        orders: orders || [],
                        user: req.session.user,
                        adminUser: null,
                        __: req.__
                });
        } catch (e) {
                console.error('User orders error:', e);
                res.status(500).send('Failed to load orders');
        }
})

// Admin Dashboard
app.get('/admin/dashboard', requireAdmin, async function (req, res) {
        try {
                const page = parseInt(req.query.page, 10) || 1;
                const limit = 20;
                const offset = (page - 1) * limit;
                const statusFilter = req.query.status || '';
                const sortBy = req.query.sortBy || 'orderid_desc';

                // Build WHERE clause to exclude Completed and Cancelled
                let whereClause = "WHERE o.StatusID NOT IN (SELECT StatusID FROM status WHERE StatusName IN ('Completed', 'Cancelled'))";
                const params = [];

                // Add status filter if provided
                if (statusFilter) {
                        whereClause += " AND s.StatusName = ?";
                        params.push(statusFilter);
                }

                // Determine ORDER BY clause based on sortBy parameter
                let orderByClause = 'ORDER BY o.OrderID DESC'; // default
                switch (sortBy) {
                        case 'orderid_asc':
                                orderByClause = 'ORDER BY o.OrderID ASC';
                                break;
                        case 'orderid_desc':
                                orderByClause = 'ORDER BY o.OrderID DESC';
                                break;
                        case 'status_asc':
                                orderByClause = 'ORDER BY s.StatusName ASC, o.OrderID DESC';
                                break;
                        case 'status_desc':
                                orderByClause = 'ORDER BY s.StatusName DESC, o.OrderID DESC';
                                break;
                        default:
                                orderByClause = 'ORDER BY o.OrderID DESC';
                }

                // Get total count for pagination
                const countQuery = `
            SELECT COUNT(*) as total 
            FROM orders o 
            LEFT JOIN status s ON o.StatusID = s.StatusID 
            ${whereClause}
        `;
                const countResult = await dbQuery(countQuery, params);
                const totalOrders = countResult[0].total;
                const totalPages = Math.ceil(totalOrders / limit);

                // Get orders with pagination and sorting
                const ordersQuery = `
            SELECT o.*, s.StatusName 
            FROM orders o 
            LEFT JOIN status s ON o.StatusID = s.StatusID 
            ${whereClause}
            ${orderByClause}
            LIMIT ? OFFSET ?
        `;
                const orders = await dbQuery(ordersQuery, [...params, limit, offset]);

                // Get all statuses for filter dropdown (excluding Completed and Cancelled)
                const statuses = await dbQuery(`
            SELECT * FROM status 
            WHERE StatusName NOT IN ('Completed', 'Cancelled')
            ORDER BY StatusID
        `);

                res.render('admin/dashboard', {
                        adminUser: req.session.adminUser,
                        orders: orders || [],
                        statuses: statuses || [],
                        currentPage: page,
                        totalPages: totalPages,
                        statusFilter: statusFilter,
                        sortBy: sortBy,
                        __: req.__
                });
        } catch (e) {
                console.error('Dashboard error:', e);
                res.status(500).send('Failed to load dashboard');
        }
});

// Admin Completed Orders History
app.get('/admin/completed', requireAdmin, async function (req, res) {
        try {
                const page = parseInt(req.query.page, 10) || 1;
                const limit = 20;
                const offset = (page - 1) * limit;
                const statusFilter = req.query.status || '';
                const sortBy = req.query.sortBy || 'orderid_desc';

                // Build WHERE clause to only include Completed and Cancelled
                let whereClause = "WHERE o.StatusID IN (SELECT StatusID FROM status WHERE StatusName IN ('Completed', 'Cancelled'))";
                const params = [];

                // Add status filter if provided
                if (statusFilter) {
                        whereClause += " AND s.StatusName = ?";
                        params.push(statusFilter);
                }

                // Determine ORDER BY clause based on sortBy parameter
                let orderByClause = 'ORDER BY o.OrderID DESC'; // default
                switch (sortBy) {
                        case 'orderid_asc':
                                orderByClause = 'ORDER BY o.OrderID ASC';
                                break;
                        case 'orderid_desc':
                                orderByClause = 'ORDER BY o.OrderID DESC';
                                break;
                        case 'date_asc':
                                orderByClause = 'ORDER BY o.CreatedAt ASC';
                                break;
                        case 'date_desc':
                                orderByClause = 'ORDER BY o.CreatedAt DESC';
                                break;
                        default:
                                orderByClause = 'ORDER BY o.OrderID DESC';
                }

                // Get total count for pagination
                const countQuery = `
            SELECT COUNT(*) as total 
            FROM orders o 
            LEFT JOIN status s ON o.StatusID = s.StatusID 
            ${whereClause}
        `;
                const countResult = await dbQuery(countQuery, params);
                const totalOrders = countResult[0].total;
                const totalPages = Math.ceil(totalOrders / limit);

                // Get orders with pagination and sorting
                const ordersQuery = `
            SELECT o.*, s.StatusName 
            FROM orders o 
            LEFT JOIN status s ON o.StatusID = s.StatusID 
            ${whereClause}
            ${orderByClause}
            LIMIT ? OFFSET ?
        `;
                const orders = await dbQuery(ordersQuery, [...params, limit, offset]);

                res.render('admin/completedOrders', {
                        adminUser: req.session.adminUser,
                        orders: orders || [],
                        currentPage: page,
                        totalPages: totalPages,
                        statusFilter: statusFilter,
                        sortBy: sortBy,
                        __: req.__
                });
        } catch (e) {
                console.error('Completed orders error:', e);
                res.status(500).send('Failed to load completed orders');
        }
});

// Admin Order Settings Page
app.get('/admin/order-settings', requireAdmin, async function (req, res) {
        try {
                // Check if archive tables exist
                const checkTableQuery = `
            SELECT COUNT(*) as count 
            FROM information_schema.tables 
            WHERE table_schema = DATABASE() 
            AND table_name = 'orders_archive'
        `;
                const tableExists = await dbQuery(checkTableQuery);
                const archiveTablesExist = tableExists[0]?.count > 0;

                // Get statistics
                const totalOrdersResult = await dbQuery('SELECT COUNT(*) as count FROM orders');
                const completedOrdersResult = await dbQuery(`
            SELECT COUNT(*) as count FROM orders 
            WHERE StatusID IN (SELECT StatusID FROM status WHERE StatusName IN ('Completed', 'Cancelled'))
        `);

                let archivedCount = 0;
                if (archiveTablesExist) {
                        const archivedOrdersResult = await dbQuery('SELECT COUNT(*) as count FROM orders_archive');
                        archivedCount = archivedOrdersResult[0]?.count || 0;
                }

                const oldestOrderResult = await dbQuery('SELECT MIN(CreatedAt) as oldest FROM orders');

                const oldestDate = oldestOrderResult[0]?.oldest ? new Date(oldestOrderResult[0].oldest) : new Date();
                const daysSinceOldest = Math.floor((new Date() - oldestDate) / (1000 * 60 * 60 * 24));

                const stats = {
                        totalOrders: totalOrdersResult[0]?.count || 0,
                        completedOrders: completedOrdersResult[0]?.count || 0,
                        archivedOrders: archivedCount,
                        oldestOrderDays: daysSinceOldest,
                        archiveTablesExist: archiveTablesExist
                };

                res.render('admin/orderSettings', {
                        adminUser: req.session.adminUser,
                        stats: stats,
                        __: req.__
                });
        } catch (e) {
                console.error('Order settings error:', e);
                res.status(500).send('Failed to load order settings: ' + e.message);
        }
});

// Archive old orders
app.post('/admin/archive-orders', requireAdmin, async function (req, res) {
        try {
                const { monthsOld } = req.body;

                if (!monthsOld || monthsOld < 1) {
                        return res.json({ success: false, message: 'Invalid months value' });
                }

                // Calculate cutoff date
                const cutoffDate = new Date();
                cutoffDate.setMonth(cutoffDate.getMonth() - monthsOld);

                // Start transaction
                await dbQuery('START TRANSACTION');

                // Get orders to archive
                const ordersToArchive = await dbQuery(`
            SELECT o.OrderID 
            FROM orders o
            INNER JOIN status s ON o.StatusID = s.StatusID
            WHERE s.StatusName IN ('Completed', 'Cancelled')
            AND o.CreatedAt < ?
        `, [cutoffDate]);

                if (ordersToArchive.length === 0) {
                        await dbQuery('ROLLBACK');
                        return res.json({
                                success: true,
                                message: `No orders found older than ${monthsOld} months`,
                                archivedCount: 0
                        });
                }

                // Copy orders to archive
                await dbQuery(`
            INSERT INTO orders_archive 
            SELECT o.*, NOW() as ArchivedAt 
            FROM orders o
            INNER JOIN status s ON o.StatusID = s.StatusID
            WHERE s.StatusName IN ('Completed', 'Cancelled')
            AND o.CreatedAt < ?
        `, [cutoffDate]);

                // Copy order details to archive
                await dbQuery(`
            INSERT INTO order_details_archive 
            SELECT od.*, NOW() as ArchivedAt 
            FROM order_details od
            INNER JOIN orders o ON od.OrderID = o.OrderID
            INNER JOIN status s ON o.StatusID = s.StatusID
            WHERE s.StatusName IN ('Completed', 'Cancelled')
            AND o.CreatedAt < ?
        `, [cutoffDate]);

                // Copy order item options to archive
                await dbQuery(`
            INSERT INTO order_item_options_archive 
            SELECT oio.*, NOW() as ArchivedAt 
            FROM order_item_options oio
            INNER JOIN order_details od ON oio.OrderDetailID = od.OrderDetailID
            INNER JOIN orders o ON od.OrderID = o.OrderID
            INNER JOIN status s ON o.StatusID = s.StatusID
            WHERE s.StatusName IN ('Completed', 'Cancelled')
            AND o.CreatedAt < ?
        `, [cutoffDate]);

                // Delete from main tables
                await dbQuery(`
            DELETE oio FROM order_item_options oio
            INNER JOIN order_details od ON oio.OrderDetailID = od.OrderDetailID
            INNER JOIN orders o ON od.OrderID = o.OrderID
            INNER JOIN status s ON o.StatusID = s.StatusID
            WHERE s.StatusName IN ('Completed', 'Cancelled')
            AND o.CreatedAt < ?
        `, [cutoffDate]);

                await dbQuery(`
            DELETE od FROM order_details od
            INNER JOIN orders o ON od.OrderID = o.OrderID
            INNER JOIN status s ON o.StatusID = s.StatusID
            WHERE s.StatusName IN ('Completed', 'Cancelled')
            AND o.CreatedAt < ?
        `, [cutoffDate]);

                await dbQuery(`
            DELETE o FROM orders o
            INNER JOIN status s ON o.StatusID = s.StatusID
            WHERE s.StatusName IN ('Completed', 'Cancelled')
            AND o.CreatedAt < ?
        `, [cutoffDate]);

                await dbQuery('COMMIT');

                res.json({
                        success: true,
                        message: `Successfully archived orders older than ${monthsOld} months`,
                        archivedCount: ordersToArchive.length
                });

        } catch (e) {
                await dbQuery('ROLLBACK');
                console.error('Archive error:', e);
                res.json({ success: false, message: 'Failed to archive orders: ' + e.message });
        }
});

// Permanently delete old archived orders
app.post('/admin/delete-archived-orders', requireAdmin, async function (req, res) {
        try {
                const { yearsOld } = req.body;

                if (!yearsOld || yearsOld < 7) {
                        return res.json({ success: false, message: 'Minimum 7 years required for permanent deletion' });
                }

                // Calculate cutoff date
                const cutoffDate = new Date();
                cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsOld);

                // Get count before deletion
                const countResult = await dbQuery(`
            SELECT COUNT(*) as count FROM orders_archive 
            WHERE ArchivedAt < ?
        `, [cutoffDate]);

                const deleteCount = countResult[0]?.count || 0;

                if (deleteCount === 0) {
                        return res.json({
                                success: true,
                                message: `No archived orders found older than ${yearsOld} years`,
                                deletedCount: 0
                        });
                }

                // Delete old archived data
                await dbQuery(`
            DELETE FROM order_item_options_archive 
            WHERE OrderDetailID IN (
                SELECT OrderDetailID FROM order_details_archive 
                WHERE OrderID IN (
                    SELECT OrderID FROM orders_archive WHERE ArchivedAt < ?
                )
            )
        `, [cutoffDate]);

                await dbQuery(`
            DELETE FROM order_details_archive 
            WHERE OrderID IN (
                SELECT OrderID FROM orders_archive WHERE ArchivedAt < ?
            )
        `, [cutoffDate]);

                await dbQuery(`
            DELETE FROM orders_archive 
            WHERE ArchivedAt < ?
        `, [cutoffDate]);

                res.json({
                        success: true,
                        message: `Permanently deleted archived orders older than ${yearsOld} years`,
                        deletedCount: deleteCount
                });

        } catch (e) {
                console.error('Permanent delete error:', e);
                res.json({ success: false, message: 'Failed to delete archived orders: ' + e.message });
        }
});

// View archived orders
app.get('/admin/archived-orders', requireAdmin, async function (req, res) {
        try {
                const page = parseInt(req.query.page, 10) || 1;
                const limit = 20;
                const offset = (page - 1) * limit;
                const statusFilter = req.query.status || '';
                const sortBy = req.query.sortBy || 'archived_desc';

                // Build WHERE clause
                let whereClause = 'WHERE 1=1';
                const params = [];

                if (statusFilter) {
                        whereClause += ' AND s.StatusName = ?';
                        params.push(statusFilter);
                }

                // Determine ORDER BY clause
                let orderByClause = 'ORDER BY o.ArchivedAt DESC';
                switch (sortBy) {
                        case 'archived_asc':
                                orderByClause = 'ORDER BY o.ArchivedAt ASC';
                                break;
                        case 'archived_desc':
                                orderByClause = 'ORDER BY o.ArchivedAt DESC';
                                break;
                        case 'orderid_asc':
                                orderByClause = 'ORDER BY o.OrderID ASC';
                                break;
                        case 'orderid_desc':
                                orderByClause = 'ORDER BY o.OrderID DESC';
                                break;
                }

                // Get total count
                const countQuery = `
            SELECT COUNT(*) as total 
            FROM orders_archive o 
            LEFT JOIN status s ON o.StatusID = s.StatusID 
            ${whereClause}
        `;
                const countResult = await dbQuery(countQuery, params);
                const totalOrders = countResult[0].total;
                const totalPages = Math.ceil(totalOrders / limit);

                // Get archived orders
                const ordersQuery = `
            SELECT o.*, s.StatusName 
            FROM orders_archive o 
            LEFT JOIN status s ON o.StatusID = s.StatusID 
            ${whereClause}
            ${orderByClause}
            LIMIT ? OFFSET ?
        `;
                const orders = await dbQuery(ordersQuery, [...params, limit, offset]);

                res.render('admin/archivedOrders', {
                        adminUser: req.session.adminUser,
                        orders: orders || [],
                        currentPage: page,
                        totalPages: totalPages,
                        statusFilter: statusFilter,
                        sortBy: sortBy,
                        __: req.__
                });
        } catch (e) {
                console.error('Archived orders error:', e);
                res.status(500).send('Failed to load archived orders');
        }
});

// Admin View Order Details
app.get('/admin/order/:orderId', requireAdmin, async function (req, res) {
        try {
                const orderId = parseInt(req.params.orderId, 10);

                // Get order details with user information
                const orderRow = await dbQuery(`
            SELECT o.*, s.StatusName, u.Email AS UserEmail, u.MobilePhone AS UserPhone 
            FROM orders o 
            LEFT JOIN status s ON o.StatusID = s.StatusID 
            LEFT JOIN users u ON o.UserID = u.UserID
            WHERE o.OrderID = ? 
            LIMIT 1
        `, [orderId]);
                if (!orderRow || !orderRow[0]) return res.status(404).send('Order not found');

                const order = orderRow[0];

                // Use user's email/phone if customer fields are empty
                if (!order.CustomerEmail && order.UserEmail) {
                        order.CustomerEmail = order.UserEmail;
                }
                if (!order.CustomerPhone && order.UserPhone) {
                        order.CustomerPhone = order.UserPhone;
                }

                // Get order items
                const items = await dbQuery(`
            SELECT od.*, p.Name AS ProductName
            FROM order_details od
            LEFT JOIN products p ON p.ProductID = od.ProductID
            WHERE od.OrderID = ?
            ORDER BY od.OrderDetailID
        `, [orderId]);

                // Get order options
                const options = await dbQuery(`
            SELECT oio.* 
            FROM order_item_options oio
            WHERE oio.OrderDetailID IN (SELECT OrderDetailID FROM order_details WHERE OrderID = ?)
            ORDER BY oio.OrderDetailID, oio.OptionID
        `, [orderId]);

                // Group options by OrderDetailID so each item gets its own options
                const optionsByDetailId = {};
                (options || []).forEach(opt => {
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

                // Attach options to their respective items
                items.forEach(item => {
                        item.options = optionsByDetailId[item.OrderDetailID] || [];
                });

                // Get all statuses for dropdown
                const statuses = await dbQuery('SELECT * FROM status ORDER BY StatusID');

                res.render('admin/orderDetail', {
                        adminUser: req.session.adminUser,
                        order: order,
                        items: items || [],
                        options: options || [],
                        statuses: statuses || [],
                        created: req.query.created === '1',
                        __: req.__
                });
        } catch (e) {
                console.error('Admin order view error:', e);
                res.status(500).send('Failed to load order');
        }
});

// Admin Update Order Status
app.post('/admin/order/:orderId/status', requireAdmin, async function (req, res) {
        try {
                const orderId = parseInt(req.params.orderId, 10);
                const statusId = parseInt(req.body.statusId, 10);
                const redirect = req.body.redirect || null;

                await dbQuery('UPDATE orders SET StatusID = ? WHERE OrderID = ?', [statusId, orderId]);

                // Redirect to specified page or back to order detail
                if (redirect) {
                        res.redirect(redirect);
                } else {
                        res.redirect('/admin/order/' + orderId);
                }
        } catch (e) {
                console.error('Update status error:', e);
                res.status(500).send('Failed to update status');
        }
});

// Admin Mark Order as Paid
app.post('/admin/order/:orderId/mark-paid', requireAdmin, async function (req, res) {
        try {
                const orderId = parseInt(req.params.orderId, 10);
                const paymentMethod = req.body.paymentMethod;

                if (!paymentMethod) {
                        return res.status(400).send('Payment method is required');
                }

                // Update order with payment method and change status to Confirmed (2)
                await dbQuery('UPDATE orders SET PaymentMethod = ?, StatusID = 2 WHERE OrderID = ?', [paymentMethod, orderId]);

                res.redirect('/admin/order/' + orderId);
        } catch (e) {
                console.error('Mark paid error:', e);
                res.status(500).send('Failed to mark order as paid');
        }
});

// Send Email Receipt
app.post('/admin/order/:orderId/send-receipt', requireAdmin, async function (req, res) {
        try {
                const orderId = parseInt(req.params.orderId, 10);
                const email = req.body.email;

                if (!email || !email.includes('@')) {
                        return res.status(400).json({ success: false, message: 'Valid email address is required' });
                }

                // Get order details
                const orderRow = await dbQuery('SELECT o.*, s.StatusName FROM orders o LEFT JOIN status s ON o.StatusID = s.StatusID WHERE o.OrderID = ? LIMIT 1', [orderId]);
                if (!orderRow || !orderRow[0]) {
                        return res.status(404).json({ success: false, message: 'Order not found' });
                }

                const order = orderRow[0];

                // Get order items
                const items = await dbQuery(`
            SELECT od.*, p.Name AS ProductName
            FROM order_details od
            LEFT JOIN products p ON p.ProductID = od.ProductID
            WHERE od.OrderID = ?
        `, [orderId]);

                // Get order options
                const options = await dbQuery(`
            SELECT oio.* 
            FROM order_item_options oio
            WHERE oio.OrderDetailID IN (SELECT OrderDetailID FROM order_details WHERE OrderID = ?)
        `, [orderId]);

                // Build email content
                let emailContent = `
Order Receipt - Alimond's Café
================================

Order ID: #${order.OrderID}
Date: ${new Date(order.CreatedAt).toLocaleString()}
Customer: ${order.CustomerName || 'N/A'}
Payment Method: ${order.PaymentMethod || 'Pending'}
Status: ${order.StatusName || 'Pending'}

Order Items:
------------
`;

                items.forEach((item, idx) => {
                        emailContent += `${idx + 1}. ${item.ProductName || 'Product #' + item.ProductID}\n`;
                        if (item.Size) emailContent += `   Size: ${item.Size}\n`;
                        emailContent += `   Quantity: ${item.Quantity}\n`;
                        emailContent += `   Unit Price: ₱${parseFloat(item.UnitPrice || 0).toFixed(2)}\n`;
                        emailContent += `   Subtotal: ₱${parseFloat(item.Subtotal || 0).toFixed(2)}\n`;
                });

                if (options && options.length > 0) {
                        emailContent += `\nCustomizations:\n`;
                        options.forEach(opt => {
                                emailContent += `- ${opt.OptionName}: ${opt.OptionValue} (+₱${parseFloat(opt.ExtraPrice || 0).toFixed(2)})\n`;
                        });
                }

                if (order.Notes) {
                        emailContent += `\nNotes: ${order.Notes}\n`;
                }

                emailContent += `\nTotal Amount: ₱${parseFloat(order.TotalAmount || 0).toFixed(2)}\n`;
                emailContent += `\nThank you for your order!\n`;

                // TODO: In production, use nodemailer to send actual email
                // For now, just log the email content
                console.log('Email Receipt to:', email);
                console.log(emailContent);

                // Simulate successful email sending
                res.json({
                        success: true,
                        message: 'Receipt sent successfully',
                        // In development, show the content
                        preview: emailContent
                });

        } catch (e) {
                console.error('Send receipt error:', e);
                res.status(500).json({ success: false, message: 'Failed to send receipt: ' + e.message });
        }
});

// ============================================
// ADMIN PRODUCT MANAGEMENT ROUTES
// ============================================

// Save Product (Add or Update)
app.post('/admin/products/save', requireAdmin, async function (req, res) {
        try {
                console.log('Save product request body:', JSON.stringify(req.body, null, 2));

                const { productId, name, category, type, description, picture, price, hasSizes, hasExtras, hasCustom, isAvailable, sizeNames, sizePrices } = req.body;

                const hasSizesValue = hasSizes ? 1 : 0;
                const hasExtrasValue = hasExtras ? 1 : 0;
                const hasCustomValue = hasCustom ? 1 : 0;
                const isAvailableValue = isAvailable ? 1 : 0;
                const priceValue = hasSizesValue ? null : (price || null);

                console.log('Parsed values:', {
                        hasSizesValue,
                        hasExtrasValue,
                        hasCustomValue,
                        isAvailableValue,
                        priceValue
                });

                if (productId) {
                        // Update existing product
                        await dbQuery(`
                UPDATE products 
                SET Name = ?, Category = ?, Type = ?, Description = ?, Picture = ?, 
                    Price = ?, HasSizes = ?, HasExtras = ?, HasCustom = ?, IsAvailable = ?
                WHERE ProductID = ?
            `, [name, category, type, description, picture, priceValue, hasSizesValue, hasExtrasValue, hasCustomValue, isAvailableValue, productId]);

                        // Delete existing size prices and re-add
                        if (hasSizesValue) {
                                await dbQuery('DELETE FROM size_prices WHERE ProductID = ?', [productId]);

                                if (sizeNames && sizePrices) {
                                        const sizeNamesArray = Array.isArray(sizeNames) ? sizeNames : [sizeNames];
                                        const sizePricesArray = Array.isArray(sizePrices) ? sizePrices : [sizePrices];

                                        for (let i = 0; i < sizeNamesArray.length; i++) {
                                                if (sizeNamesArray[i] && sizePricesArray[i]) {
                                                        await dbQuery('INSERT INTO size_prices (ProductID, Size, Price) VALUES (?, ?, ?)',
                                                                [productId, sizeNamesArray[i], sizePricesArray[i]]);
                                                }
                                        }
                                }
                        } else {
                                // If HasSizes changed to false, delete any existing size prices
                                await dbQuery('DELETE FROM size_prices WHERE ProductID = ?', [productId]);
                        }

                        res.json({ success: true, message: 'Product updated successfully', productId });
                } else {
                        // Insert new product
                        const result = await dbQuery(`
                INSERT INTO products (Name, Category, Type, Description, Picture, Price, HasSizes, HasExtras, HasCustom, IsAvailable)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [name, category, type, description, picture, priceValue, hasSizesValue, hasExtrasValue, hasCustomValue, isAvailableValue]);

                        const newProductId = result.insertId;

                        // Add size prices if applicable
                        if (hasSizesValue && sizeNames && sizePrices) {
                                const sizeNamesArray = Array.isArray(sizeNames) ? sizeNames : [sizeNames];
                                const sizePricesArray = Array.isArray(sizePrices) ? sizePrices : [sizePrices];

                                for (let i = 0; i < sizeNamesArray.length; i++) {
                                        if (sizeNamesArray[i] && sizePricesArray[i]) {
                                                await dbQuery('INSERT INTO size_prices (ProductID, Size, Price) VALUES (?, ?, ?)',
                                                        [newProductId, sizeNamesArray[i], sizePricesArray[i]]);
                                        }
                                }
                        }

                        res.json({ success: true, message: 'Product created successfully', productId: newProductId });
                }
        } catch (e) {
                console.error('Save product error:', e);
                res.status(500).json({ success: false, message: 'Failed to save product: ' + e.message });
        }
});

// Toggle Product Availability
app.post('/admin/products/toggle-availability', requireAdmin, async function (req, res) {
        try {
                const { productId, isAvailable } = req.body;
                const isAvailableValue = isAvailable ? 1 : 0;

                await dbQuery('UPDATE products SET IsAvailable = ? WHERE ProductID = ?', [isAvailableValue, productId]);

                res.json({ success: true });
        } catch (e) {
                console.error('Toggle availability error:', e);
                res.status(500).json({ success: false, message: e.message });
        }
});

// Delete Product
app.post('/admin/products/delete', requireAdmin, async function (req, res) {
        try {
                const { productId } = req.body;

                // Delete size prices first (due to foreign key)
                await dbQuery('DELETE FROM size_prices WHERE ProductID = ?', [productId]);

                // Delete product
                await dbQuery('DELETE FROM products WHERE ProductID = ?', [productId]);

                res.json({ success: true });
        } catch (e) {
                console.error('Delete product error:', e);
                res.status(500).json({ success: false, message: e.message });
        }
});

// Admin Process Order (from menu tab)
app.post('/admin/process-order', requireAdmin, async function (req, res) {
        try {
                const { orderData, paymentMethod, amountReceived, changeAmount } = req.body;

                // Parse order data
                const order = JSON.parse(orderData);
                const { productId, productName, customerName, quantity, size, extras, milk, sweetener, notes, totalAmount } = order;

                // Get product details for extras pricing
                const product = await dbQuery('SELECT * FROM products WHERE ProductID = ?', [productId]);
                if (!product || product.length === 0) {
                        return res.status(404).send('Product not found');
                }

                const productData = product[0];
                let unitPrice = 0;

                // Determine base price
                if (productData.HasSizes && size) {
                        const sizePrice = await dbQuery('SELECT Price FROM size_prices WHERE ProductID = ? AND Size = ?', [productId, size]);
                        if (sizePrice && sizePrice.length > 0) {
                                unitPrice = parseFloat(sizePrice[0].Price);
                        }
                } else {
                        unitPrice = parseFloat(productData.Price || 0);
                }

                // Get extras prices
                let extrasPrice = 0;
                let milkPrice = 0;
                let sweetenerPrice = 0;

                if (extras) {
                        const extraData = await dbQuery('SELECT * FROM products WHERE Category = "Extras" AND (Name = ? OR Type = "Toppings") LIMIT 1', [extras]);
                        if (extraData && extraData.length > 0) {
                                extrasPrice = parseFloat(extraData[0].Price || 0);
                        }
                }

                if (milk) {
                        const milkData = await dbQuery('SELECT * FROM products WHERE Category = "Custom" AND Type = "Milk" AND Name = ? LIMIT 1', [milk]);
                        if (milkData && milkData.length > 0) {
                                milkPrice = parseFloat(milkData[0].Price || 0);
                        }
                }

                if (sweetener) {
                        const sweetenerData = await dbQuery('SELECT * FROM products WHERE Category = "Custom" AND Type = "Sweetener" LIMIT 1');
                        if (sweetenerData && sweetenerData.length > 0) {
                                sweetenerPrice = parseFloat(sweetenerData[0].Price || 0);
                        }
                }

                const qty = parseInt(quantity) || 1;
                const itemPrice = unitPrice + extrasPrice + milkPrice + sweetenerPrice;
                const subtotal = itemPrice * qty;

                // Build notes with change information if applicable
                let orderNotes = notes || '';
                if (paymentMethod === 'Cash' && changeAmount && parseFloat(changeAmount) > 0) {
                        const change = parseFloat(changeAmount);
                        const received = parseFloat(amountReceived);
                        orderNotes = (orderNotes ? orderNotes + ' | ' : '') + `Amount Received: ₱${received.toFixed(2)}, Change: ₱${change.toFixed(2)}`;
                }

                // Determine status based on payment method
                // GCash and Online: Pending (1) until payment confirmed
                // Cash: Paid/Confirmed (2) immediately
                // No payment method: Pending (1)
                let statusId = 1; // Default to Pending
                if (paymentMethod === 'Cash') {
                        statusId = 2; // Cash is immediately Confirmed
                } else if (paymentMethod === 'GCash' || paymentMethod === 'Online') {
                        statusId = 1; // GCash and Online remain Pending until confirmed
                }

                const orderResult = await dbQuery(`
            INSERT INTO orders (CustomerName, TotalAmount, StatusID, PaymentMethod, Notes, CreatedAt)
            VALUES (?, ?, ?, ?, ?, NOW())
        `, [customerName, subtotal, statusId, paymentMethod || null, orderNotes || null]);

                const orderId = orderResult.insertId;

                // Add order detail
                const orderDetailResult = await dbQuery(`
            INSERT INTO order_details (OrderID, ProductID, ProductName, Quantity, UnitPrice, Subtotal, Size, Notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [orderId, productId, productName, qty, itemPrice, subtotal, size || null, notes || null]);

                const orderDetailId = orderDetailResult.insertId;

                // Add order item options (extras, milk, sweetener)
                if (extras && extrasPrice > 0) {
                        await dbQuery(`
                INSERT INTO order_item_options (OrderDetailID, OptionName, OptionValue, ExtraPrice)
                VALUES (?, 'Topping', ?, ?)
            `, [orderDetailId, extras, extrasPrice]);
                }

                if (milk && milkPrice > 0) {
                        await dbQuery(`
                INSERT INTO order_item_options (OrderDetailID, OptionName, OptionValue, ExtraPrice)
                VALUES (?, 'Milk', ?, ?)
            `, [orderDetailId, milk, milkPrice]);
                }

                if (sweetener && sweetenerPrice > 0) {
                        await dbQuery(`
                INSERT INTO order_item_options (OrderDetailID, OptionName, OptionValue, ExtraPrice)
                VALUES (?, 'Sweetener', ?, ?)
            `, [orderDetailId, sweetener, sweetenerPrice]);
                }

                res.redirect('/admin/order/' + orderId + '?created=1');
        } catch (e) {
                console.error('Process order error:', e);
                res.status(500).send('Failed to process order: ' + e.message);
        }
});

// Admin Order Queue (Paid orders)
app.get('/admin/queue', requireAdmin, async function (req, res) {
        try {
                // Get orders that are paid and in active preparation stages
                // Exclude: Pending (1), Completed (5), Cancelled (6)
                // Include: Paid (2), Preparing (3), Ready (4)
                const queueOrders = await dbQuery(`
            SELECT o.*, s.StatusName 
            FROM orders o 
            LEFT JOIN status s ON o.StatusID = s.StatusID 
            WHERE o.PaymentMethod IS NOT NULL 
            AND o.StatusID IN (2, 3, 4)
            AND o.StatusID NOT IN (1, 5, 6)
            ORDER BY o.CreatedAt ASC
        `);

                res.render('admin/queue', {
                        adminUser: req.session.adminUser,
                        orders: queueOrders || [],
                        __: req.__
                });
        } catch (e) {
                console.error('Queue error:', e);
                res.status(500).send('Failed to load queue');
        }
});

app.get('/menu', function (req, res) {
        log("GET /menu called");
        const selectedProductId = req.query.productId ? parseInt(req.query.productId, 10) : null;

        // Check if admin user is logged in
        const isAdmin = req.session.adminUser ? true : false;

        // Admin gets all products, regular users only get Standard products
        const productQuery = isAdmin ? "SELECT * FROM products" : "SELECT * FROM products WHERE Category = 'Standard'";
        const sizeTableCandidates = ["size_prices"];
        const productPrice = isAdmin ? "SELECT * FROM products WHERE HasSizes = 0" : "SELECT * FROM products WHERE Category = 'Standard' AND HasSizes = 0";

        db.query(productQuery, function (err, products) {
                if (err) {
                        console.error('Product query error:', err);
                        return res.status(500).send('Database error');
                }
                log('Products:', products);
                db.query(productPrice, function (err, productPrices) {
                        if (err) {
                                console.error('Product price query error:', err);
                                return res.status(500).send('Database error');
                        }
                        log('Product Prices:', productPrices);

                        function tryLoadSizes(index, cb) {
                                if (index >= sizeTableCandidates.length) return cb(null, []);
                                const q = `SELECT * FROM ${sizeTableCandidates[index]}`;
                                db.query(q, function (err, sizePrices) {
                                        if (err) {
                                                console.warn('Size price query failed for', sizeTableCandidates[index], err && err.message);
                                                return tryLoadSizes(index + 1, cb);
                                        }
                                        // If we got rows (even empty array is acceptable), return them.
                                        return cb(null, sizePrices || []);
                                });
                        }

                        tryLoadSizes(0, function (err, sizePrices) {
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

                                db.query(customProductsQuery, function (err, customProductsRows) {
                                        if (err) {
                                                console.warn('Failed to load custom products:', err && err.message);
                                                customProductsRows = [];
                                        }
                                        const plainCustomPricelist = (customProductsRows || []).map(p => ({ option: p.Name, description: p.Description, price: parseFloat(p.Price || p.price || 0), type: p.Type || p.type || 'custom' }));

                                        // Load extras products separately
                                        db.query(extrasProductQuery, function (err, extrasProductsRows) {
                                                if (err) {
                                                        console.warn('Failed to load extras products:', err && err.message);
                                                        extrasProductsRows = [];
                                                }
                                                const extraFromProducts = (extrasProductsRows || []).map(function (p) {
                                                        return { Item: p.Name, description: p.Description, price: parseFloat(p.Price || p.price || 0) };
                                                });

                                                const ExtraPriceData = extraFromProducts || [];

                                                log('Custom Pricelist:', plainCustomPricelist);
                                                log('Size Prices:', plainSizePricelist);
                                                log('ExtraPriceData (derived):', ExtraPriceData);
                                                log('productPrices:', productPrices);

                                                // viewTemplate already determined above
                                                const viewTemplate = isAdmin ? 'admin/adminMenu' : 'menu';

                                                // For admin view, check which products have existing orders and get distinct types
                                                if (isAdmin) {
                                                        const checkOrdersQuery = `
                                                        SELECT DISTINCT ProductID 
                                                        FROM order_details 
                                                        WHERE ProductID IS NOT NULL
                                                `;
                                                        const getTypesQuery = `
                                                        SELECT DISTINCT Type 
                                                        FROM products 
                                                        WHERE Type IS NOT NULL AND Type != '' 
                                                        ORDER BY Type
                                                `;

                                                        db.query(checkOrdersQuery, function (err, orderProductRows) {
                                                                if (err) {
                                                                        console.warn('Failed to check products with orders:', err);
                                                                        orderProductRows = [];
                                                                }

                                                                // Create a Set of ProductIDs that have orders
                                                                const productsWithOrders = new Set(
                                                                        (orderProductRows || []).map(row => row.ProductID)
                                                                );

                                                                // Get distinct product types
                                                                db.query(getTypesQuery, function (err, typeRows) {
                                                                        if (err) {
                                                                                console.warn('Failed to get product types:', err);
                                                                                typeRows = [];
                                                                        }

                                                                        const productTypes = (typeRows || []).map(row => row.Type);

                                                                        res.render(viewTemplate, {
                                                                                ProductData: plainProducts,
                                                                                PriceData: [],
                                                                                SizePriceData: plainSizePricelist,
                                                                                ExtraPriceData: ExtraPriceData,
                                                                                CustomPriceData: plainCustomPricelist,
                                                                                orders: req.session.orders || [],
                                                                                selectedProductId: selectedProductId,
                                                                                user: req.session.user || null,
                                                                                adminUser: req.session.adminUser || null,
                                                                                productsWithOrders: Array.from(productsWithOrders),
                                                                                productTypes: productTypes,
                                                                                __: req.__
                                                                        });
                                                                });
                                                        });
                                                } else {
                                                        res.render(viewTemplate, {
                                                                ProductData: plainProducts,
                                                                PriceData: [],
                                                                SizePriceData: plainSizePricelist,
                                                                ExtraPriceData: ExtraPriceData,
                                                                CustomPriceData: plainCustomPricelist,
                                                                orders: req.session.orders || [],
                                                                selectedProductId: selectedProductId,
                                                                user: req.session.user || null,
                                                                adminUser: req.session.adminUser || null,
                                                                productsWithOrders: [],
                                                                __: req.__
                                                        });
                                                }
                                        });
                                });
                        });
                });
        });

        // Submenu by product type (e.g., Tea Latte, Brewed Coffee)
        app.get('/menu/type/:type', function (req, res) {
                log("GET /menu/type/:type called", req.params.type);
                const typeParam = decodeURIComponent(req.params.type || '').trim();
                if (!typeParam) return res.redirect('/menu');

                const sizeTableCandidates = ["size_prices"];
                const productQuery = "SELECT * FROM products WHERE Category = 'Standard' AND Type = ?";

                db.query(productQuery, [typeParam], function (err, products) {
                        if (err) {
                                console.error('Product-by-type query error:', err);
                                return res.status(500).send('Database error');
                        }

                        function tryLoadSizes(index, cb) {
                                if (index >= sizeTableCandidates.length) return cb(null, []);
                                const q = `SELECT * FROM ${sizeTableCandidates[index]}`;
                                db.query(q, function (err, sizePrices) {
                                        if (err) {
                                                console.warn('Size price query failed for', sizeTableCandidates[index], err && err.message);
                                                return tryLoadSizes(index + 1, cb);
                                        }
                                        return cb(null, sizePrices || []);
                                });
                        }

                        tryLoadSizes(0, function (err, sizePrices) {
                                if (err) {
                                        console.error('Failed to load size prices:', err);
                                        return res.status(500).send('Database error');
                                }
                                const plainProducts = (products || []).map(row => ({ ...row }));
                                const plainSizePricelist = (sizePrices || []).map(row => ({ ...row }));

                                const customProductsQuery = "SELECT * FROM products WHERE Category = 'Custom'";
                                const extrasProductQuery = "SELECT * FROM products WHERE Category = 'Extras'";

                                db.query(customProductsQuery, function (err, customProductsRows) {
                                        if (err) { console.warn('Failed to load custom products:', err && err.message); }
                                        const plainCustomPricelist = (customProductsRows || []).map(p => ({
                                                option: p.Name, description: p.Description,
                                                price: parseFloat(p.Price || p.price || 0), type: p.Type || p.type || 'custom'
                                        }));

                                        db.query(extrasProductQuery, function (err, extrasProductsRows) {
                                                if (err) { console.warn('Failed to load extras products:', err && err.message); }
                                                const extraFromProducts = (extrasProductsRows || []).map(function (p) {
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

app.post('/order', async function (req, res) {
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
                const plainCustoms = (customProducts || []).map(r => ({
                        option: r.Name, description: r.Description, price: parseFloat(r.Price || r.price || 0),
                        type: r.Type || r.type || 'custom'
                }));
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
                        if (foundPerProductSize) base = parseFloat(foundPerProductSize.price || foundPerProductSize.Amount || foundPerProductSize.amount ||
                                foundPerProductSize.Price || 0) || 0;
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
                extras.forEach(function (ex) {
                        // extras are product-based extras (plainExtras)
                        const foundEx = plainExtras.find(e => (e.Item && e.Item === ex) || (e.Item && e.Item === ex) || (e.option && e.option === ex));
                        if (foundEx) extrasTotal += parseFloat(foundEx.price || foundEx.Amount || 0);
                });
                // custom
                let customSelected = req.body.customOption || '';
                let customAmount = 0;
                if (customSelected) {
                        const foundCust = plainCustoms.find(function (c) {
                                return (c.option && c.option === customSelected) || (c.Item && c.Item === customSelected)
                                        || (c.name && c.name === customSelected);
                        });
                        if (foundCust) customAmount = parseFloat(foundCust.price || foundCust.Amount || 0);
                }

                const amountPerItem = base + extrasTotal + customAmount;
                const totalAmount = (qty === 0) ? 0 : amountPerItem * qty;

                // push into session orders (always)
                if (!req.session.orders) req.session.orders = [];
                // create a lightweight local id for session-only orders so the summary can update/remove them
                const localId = 's' + Date.now() + Math.floor(Math.random() * 10000);
                const sessOrder = {
                        _localId: localId, customerName, productId, product: productName, size, sugar, extras, customSelected, qty, amountPerItem,
                        totalAmount
                };
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
app.get('/order-summary', function (req, res) {
        // sanitize helper to ensure numeric fields are numbers for safe toFixed()
        function sanitizeOrders(arr) {
                return (arr || []).map(function (o) {
                        var qty = parseInt(o.qty, 10) || 0;
                        var per = parseFloat(o.amountPerItem || 0) || 0;
                        var tot = parseFloat(o.totalAmount || (per * qty) || 0) || 0;
                        var extras = o.extras;
                        if (typeof extras === 'string') {
                                try { extras = JSON.parse(extras); } catch (e) { /* leave as-is */ }
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
                return res.render('orderSummary', { orders: sanitized, user: req.session.user || null, adminUser: req.session.adminUser || null, __: req.__ });
        }
        if (!PERSIST_ORDERS) {
                // no persistence and no session orders => empty cart
                return res.render('orderSummary', { orders: [], user: req.session.user || null, adminUser: req.session.adminUser || null, __: req.__ });
        }
        // persistence enabled but no session data: show empty (no session scoping via DB)
        return res.render('orderSummary', { orders: [], user: req.session.user || null, adminUser: req.session.adminUser || null, __: req.__ });
});


// Update a single order's qty (AJAX)
app.post('/order-update', express.json(), async function (req, res) {
        try {
                var id = req.body.id; var qty = parseInt(req.body.qty, 10) || 0;
                if (!id) return res.json({ success: false, message: 'missing id' });

                // Always try session-first (covers pre-checkout carts regardless of persistence flag)
                if (req.session && Array.isArray(req.session.orders)) {
                        var found = req.session.orders.find(function (o) { return (o._localId && o._localId === id); });
                        if (!found && typeof id === 'string' && id.startsWith('s')) {
                                // if id looks like a session id but not found
                                return res.json({ success: false, message: 'order not found' });
                        }
                        if (found) {
                                found.qty = qty;
                                var perNum = parseFloat(found.amountPerItem || 0) || 0;
                                found.totalAmount = perNum * qty;
                                return res.json({ success: true });
                        }
                }

                // Fallback: post-checkout header rows do not support per-line qty updates under the new schema
                if (PERSIST_ORDERS) {
                        return res.json({ success: false, message: 'update not supported after checkout' });
                }
                return res.json({ success: false, message: 'order not found' });
        } catch (e) { console.error('order-update error', e); return res.status(500).json({ success: false, error: e.message || '' }); }
});

// Edit order fields (qty and/or customerName) for a specific order (session or DB)
app.post('/order-edit', express.json(), async function (req, res) {
        try {
                var id = req.body.id; if (!id) return res.json({ success: false, message: 'missing id' });
                var qty = typeof req.body.qty !== 'undefined' ? parseInt(req.body.qty, 10) : undefined;
                var customerName = typeof req.body.customerName !== 'undefined' ? (req.body.customerName || '').toString() : undefined;

                // Try session-first
                if (req.session && Array.isArray(req.session.orders)) {
                        var found = req.session.orders.find(function (o) { return (o._localId && o._localId === id); });
                        if (!found && typeof id === 'string' && id.startsWith('s')) {
                                return res.json({ success: false, message: 'order not found' });
                        }
                        if (found) {
                                if (typeof qty !== 'undefined') {
                                        found.qty = qty;
                                        var perNum = parseFloat(found.amountPerItem || 0) || 0;
                                        found.totalAmount = perNum * qty; // keep numeric
                                }
                                if (typeof customerName !== 'undefined') { found.customerName = customerName; }
                                return res.json({ success: true });
                        }
                }

                // Fallback: allow updating header CustomerName only; no qty/amountPerItem columns in new schema
                if (PERSIST_ORDERS) {
                        if (typeof customerName === 'undefined') {
                                return res.json({ success: false, message: 'no editable fields' });
                        }
                        await dbQuery('UPDATE orders SET CustomerName = ? WHERE id = ?', [customerName, id]);
                        return res.json({ success: true });
                }
                return res.json({ success: false, message: 'order not found' });
        } catch (e) { console.error('order-edit error', e); return res.status(500).json({ success: false, error: e.message || '' }); }
});

// Remove a single order (AJAX)
app.post('/order-remove', express.json(), async function (req, res) {
        try {
                var id = req.body.id;
                if (!id) return res.json({ success: false, message: 'missing id' });

                // Try session-first
                if (req.session && Array.isArray(req.session.orders)) {
                        var before = req.session.orders.length;
                        var afterList = req.session.orders.filter(function (o) { return !(o._localId && o._localId === id); });
                        if (afterList.length !== before) {
                                req.session.orders = afterList;
                                return res.json({ success: true, remaining: afterList.length });
                        }
                        if (typeof id === 'string' && id.startsWith('s')) {
                                return res.json({ success: false, message: 'order not found' });
                        }
                }

                // Fallback: delete persisted order row
                if (PERSIST_ORDERS) {
                        await dbQuery('DELETE FROM orders WHERE id = ?', [id]);
                        return res.json({ success: true });
                }
                return res.json({ success: false, message: 'order not found' });
        } catch (e) { console.error('order-remove error', e); return res.status(500).json({ success: false, error: e.message || '' }); }
});


console.log('REACHED: before app.listen');
app.listen(2000, function () {
        console.log('REACHED: in app.listen callback');
        log("Server is running on port 2000");
});

// Checkout: collect customer name and assign to existing orders without a name
app.post('/checkout', async function (req, res) {
        try {
                const customerName = (req.body.customerName || '').toString().trim();
                const customerEmail = (req.body.customerEmail || '').toString().trim();
                const customerPhone = (req.body.customerPhone || '').toString().trim();
                const paymentMethod = (req.body.paymentMethod || '').toString().trim();

                if (!customerName) return res.redirect('/order-summary');

                // Sanitize current session orders
                const cart = (req.session && req.session.orders) ? req.session.orders.slice() : [];
                if (!cart.length) return res.redirect('/order-summary');

                log('[checkout] starting. customerName=%s email=%s phone=%s paymentMethod=%s cartCount=%d', customerName, customerEmail ||
                        '(none)', customerPhone || '(none)', paymentMethod, cart.length);
                // dump first cart item for quick inspection
                try { if (cart[0]) log('[checkout] firstCartItem sample:', JSON.stringify(cart[0])); } catch (e) { }

                // Ensure all lines have numeric amounts
                const sanitized = cart.map(function (o) {
                        const qty = parseInt(o.qty, 10) || 0;
                        const per = parseFloat(o.amountPerItem || 0) || 0;
                        const tot = parseFloat(o.totalAmount || (per * qty) || 0) || 0;
                        return { ...o, qty, amountPerItem: per, totalAmount: tot };
                });

                // Compute order total
                const orderTotal = sanitized.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
                log('[checkout] computed orderTotal=%s from %d items', orderTotal.toFixed(2), sanitized.length);

                // All orders start with Pending status (1)
                // Admin can mark as paid later after payment confirmation
                let statusId = 1; // Always Pending initially
                log('[checkout] Payment Method: %s, StatusID: %d (Pending)', paymentMethod, statusId);

                // Get UserID from session if user is logged in
                const userId = (req.session && req.session.user && req.session.user.UserID) ? req.session.user.UserID : null;
                log('[checkout] UserID from session: %s', userId || 'not logged in');

                // If user is logged in but didn't provide email/phone, use their account info
                let finalEmail = customerEmail;
                let finalPhone = customerPhone;
                if (userId && req.session.user) {
                        if (!finalEmail && req.session.user.Email) {
                                finalEmail = req.session.user.Email;
                        }
                        if (!finalPhone && req.session.user.MobilePhone) {
                                finalPhone = req.session.user.MobilePhone;
                        }
                }

                // Create master order row with a business OrderID = CustomerName + '00' + 3-digit sequence
                // Concurrency-safe with retry loop on duplicate key (requires UNIQUE INDEX on orders(OrderID)).
                // NOTE: Run once manually: ALTER TABLE orders ADD UNIQUE INDEX uniq_OrderID (OrderID);
                let orderId = null;
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
                        } catch (e) { /* ignore; will try default 001 */ }
                        const candidateOrderCode = idPrefix + nextSeq;
                        try {
                                attemptInsertRow = await dbQuery('INSERT INTO orders (UserID, CustomerName, CustomerEmail, CustomerPhone, TotalAmount, StatusID, PaymentMethod) VALUES (?, ?, ?, ?, ?, ?, ?)',
                                        [userId, customerName, finalEmail || null, finalPhone || null, orderTotal.toFixed(2), statusId, paymentMethod || null]);
                                orderId = attemptInsertRow && attemptInsertRow.insertId ? attemptInsertRow.insertId : null;
                                if (!orderId) throw new Error('No insertId returned');
                                log('[checkout] master order created attempt=%d id=%s status=%d payment=%s userId=%s email=%s phone=%s', attempt + 1, orderId, statusId, paymentMethod || 'none', userId
                                        || 'null', finalEmail || 'null', finalPhone || 'null');
                                break; // success
                        } catch (insertErr) {
                                if (insertErr && insertErr.code === 'ER_DUP_ENTRY') {
                                        log('[checkout] duplicate OrderID %s on attempt %d; retrying', candidateOrderCode, attempt + 1);
                                        // brief jitter before retry
                                        await new Promise(r => setTimeout(r, 40 + Math.floor(Math.random() * 60)));
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


                function findProductByNameOrDesc(nameOrDesc) {
                        if (!nameOrDesc) return null;
                        const want = nameOrDesc.toString().trim().toLowerCase();
                        const match = allProducts.find(p => (p.Name || '').toString().trim().toLowerCase() === want
                                || (p.Description || '').toString().trim().toLowerCase() === want);
                        return match || null;
                }

                // Insert line details, size, and options
                for (const o of sanitized) {
                        try {
                                const prodId = o.productId || o.ProductID || null;
                                const productName = o.product || o.ProductName || '';
                                const pricePer = parseFloat(o.amountPerItem || 0) || 0;
                                const lineTotal = (o.qty || 0) * pricePer;
                                log('[checkout] inserting order_details line product="%s" prodId=%s qty=%s pricePer=%s lineTotal=%s', o.product, prodId, o.qty, pricePer.toFixed(2), lineTotal.toFixed(2));
                                // order_details row (base line item) with Size column - matching schema column names
                                const detailResult = await dbQuery('INSERT INTO order_details (OrderID, ProductID, ProductName, Quantity, UnitPrice, Subtotal, Size) VALUES (?, ?, ?, ?, ?, ?, ?)',
                                        [effectiveOrderIdForDetails, prodId, productName, o.qty, pricePer.toFixed(2), lineTotal.toFixed(2), (o.size || null)]);
                                const orderDetailId = detailResult && detailResult.insertId ? detailResult.insertId : null;
                                log('[checkout] -> order_details inserted ID=%s', orderDetailId);


                                // Sweetener option
                                if (o.sugar) {
                                        const sug = findProductByNameOrDesc(o.sugar) || (allCustoms || []).find(p => (p.Type || '').toLowerCase() === 'sweetener');
                                        const sugName = sug ? (sug.Name || '') : '';
                                        const sugPrice = sug ? parseFloat(sug.Price || sug.price || 0) : 0;
                                        await dbQuery('INSERT INTO order_item_options (OrderDetailID, OptionName, OptionValue, ExtraPrice) VALUES (?, ?, ?, ?)',
                                                [orderDetailId, 'Sweetener', sugName, sugPrice.toFixed(2)]).then(r => {
                                                        log('[checkout] -> order_item_options Sweetener inserted (detailId=%s value=%s price=%s)', orderDetailId, sugName, sugPrice.toFixed(2));
                                                }).catch(err => { console.warn('[checkout] sweetener insert failed:', err.message || err); });
                                }
                                // Milk option
                                if (o.customSelected) {
                                        const milk = findProductByNameOrDesc(o.customSelected) || (allCustoms || []).find(p => (p.Type || '').toLowerCase() === 'milk');
                                        const milkName = milk ? (milk.Name || '') : '';
                                        const milkPrice = milk ? parseFloat(milk.Price || milk.price || 0) : 0;
                                        await dbQuery('INSERT INTO order_item_options (OrderDetailID, OptionName, OptionValue, ExtraPrice) VALUES (?, ?, ?, ?)',
                                                [orderDetailId, 'Milk', milkName, milkPrice.toFixed(2)]).then(r => {
                                                        log('[checkout] -> order_item_options Milk inserted (detailId=%s value=%s price=%s)', orderDetailId, milkName,
                                                                milkPrice.toFixed(2));
                                                }).catch(err => { console.warn('[checkout] milk insert failed:', err.message || err); });
                                }
                                // Extras
                                let extrasList = o.extras;
                                if (typeof extrasList === 'string') extrasList = [extrasList];
                                if (Array.isArray(extrasList)) {
                                        for (const ex of extrasList) {
                                                if (!ex) continue;
                                                const exProd = findProductByNameOrDesc(ex) || (allExtras || []).find(p => (p.Name || '').toString().trim().toLowerCase()
                                                        === ex.toString().trim().toLowerCase());
                                                const exName = exProd ? (exProd.Name || '') : ex;
                                                const exPrice = exProd ? parseFloat(exProd.Price || exProd.price || 0) : 0;
                                                await dbQuery('INSERT INTO order_item_options (OrderDetailID, OptionName, OptionValue, ExtraPrice) VALUES (?, ?, ?, ?)',
                                                        [orderDetailId, 'Topping', exName, exPrice.toFixed(2)]).then(r => {
                                                                log('[checkout] -> order_item_options Topping inserted (detailId=%s value=%s price=%s)', orderDetailId,
                                                                        exName, exPrice.toFixed(2));
                                                        }).catch(err => { console.warn('[checkout] topping insert failed:', err.message || err); });
                                        }
                                }
                        } catch (lineErr) {
                                console.error('[checkout] line insertion error (will continue with next line):', lineErr.message || lineErr);
                        }
                }

                // Post-check table counts (optional)
                try {
                        const [c1] = await dbQuery('SELECT COUNT(*) AS cnt FROM orders');
                        const [c3] = await dbQuery('SELECT COUNT(*) AS cnt FROM order_details');
                        const [c5] = await dbQuery('SELECT COUNT(*) AS cnt FROM order_item_options');
                        log('[checkout] table counts after insertion -> orders=%s details=%s options=%s', c1 && c1.cnt, c3 && c3.cnt, c5 && c5.cnt);
                } catch (countErr) { console.warn('[checkout] post-insert counts failed:', countErr.message || countErr); }

                // Keep master order's TotalAmount in sync
                // (TotalAmount already set in INSERT, no need to update)

                // Clear the cart
                if (req.session) req.session.orders = [];
                // Track recently placed order ids in session for convenience
                try { if (req.session) { req.session.myOrders = (req.session.myOrders || []); if (orderId) req.session.myOrders.unshift(orderId); } } catch (e) { }

                // Lookup status description for the actual statusId
                let statusDesc = 'Pending'; // Default - all new orders are Pending
                try {
                        const srows = await dbQuery('SELECT StatusName FROM status WHERE StatusID = ? LIMIT 1', [statusId]);
                        if (srows && srows[0] && srows[0].StatusName) statusDesc = srows[0].StatusName;
                } catch (e) {
                        // Fallback to Pending if query fails
                        statusDesc = 'Pending';
                }
                let qrCodeData = null;
                if (paymentMethod === 'GCash' && statusDesc === 'Pending') {
                        const accountNumber = '09265363860'; // GCash account number
                        qrCodeData = `Order #${orderId}\nAmount: ₱${orderTotal.toFixed(2)}\nAccount: ${accountNumber}`;
                        console.log('Generated QR Code Data:', qrCodeData);
                        console.log('Payment Method:', paymentMethod);
                        console.log('Status:', statusDesc);
                }

                // Render order summary with confirmation banner
                // Reload (empty) cart so table shows no items, and pass orderId, status, and payment method
                return res.render('orderSummary', {
                        orders: [],
                        __: req.__,
                        placedOrderId: orderId,
                        placedStatus: statusDesc,
                        placedPaymentMethod: paymentMethod || null,
                        orderTotal: orderTotal.toFixed(2),
                        customerName: customerName,
                        customerEmail: customerEmail,
                        customerPhone: customerPhone,
                        isLoggedIn: !!userId,
                        qrCodeData
                });
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
                } catch (ign) { }
                return res.status(500).send('Checkout failed');
        }
});

// View order details
app.get('/orderSummary', async function (req, res) {
        try {
                const orderId = parseInt(req.params.orderId, 10);

                // Get order details
                const orderRow = await dbQuery('SELECT o.*, s.StatusName FROM orders o LEFT JOIN status s ON o.StatusID = s.StatusID WHERE o.OrderID = ? LIMIT 1',
                        [orderId]);
                if (!orderRow || !orderRow[0]) return res.status(404).send('Order not found');

                const order = orderRow[0];

                // Get order items
                const items = await dbQuery(`
            SELECT od.*, p.Name AS ProductName
            FROM order_details od
            LEFT JOIN products p ON p.ProductID = od.ProductID
            WHERE od.OrderID = ?
            ORDER BY od.OrderDetailID
        `, [orderId]);

                // Get order options
                const options = await dbQuery(`
            SELECT oio.* 
            FROM order_item_options oio
            WHERE oio.OrderDetailID IN (SELECT OrderDetailID FROM order_details WHERE OrderID = ?)
            ORDER BY oio.OptionID
        `, [orderId]);

                // Get all statuses for dropdown
                const statuses = await dbQuery('SELECT * FROM status ORDER BY StatusID');

                res.render('admin/orderDetail', {
                        adminUser: req.session.adminUser,
                        order: order,
                        items: items || [],
                        options: options || [],
                        statuses: statuses || [],
                        created: false,
                        __: req.__
                });
        } catch (e) {
                console.error('Admin order view error:', e);
                res.status(500).send('Failed to load order');
        }
});

// Payment route - handles both cash and online payment
app.get('/payment', async function (req, res) {
        try {
                const orderId = req.query.orderId;
                const method = (req.query.method || 'cash').toLowerCase();

                if (!orderId) {
                        return res.status(400).send('Order ID is required');
                }

                const orderIdNum = parseInt(orderId, 10);
                if (!orderIdNum) {
                        return res.status(400).send('Invalid Order ID');
                }

                // Update payment method in database
                await dbQuery('UPDATE orders SET PaymentMethod = ? WHERE OrderID = ?', [method === 'online' ? 'Online' : 'Cash', orderIdNum]);

                // Redirect to order details page
                return res.redirect('/order/' + orderIdNum);
        } catch (e) {
                console.error('payment error', e);
                return res.status(500).send('Payment processing failed');
        }
});

// Order History by OrderID (user-scoped via possession; optionally check session.myOrders)
// Reorder route - recreates a previous order in the cart
app.post('/reorder/:orderId', async function (req, res) {
        try {
                const orderId = parseInt(req.params.orderId, 10);
                if (!orderId) return res.status(404).send('Order not found');

                // Get order details
                const orderRow = await dbQuery('SELECT * FROM orders WHERE OrderID = ? LIMIT 1', [orderId]);
                if (!orderRow || !orderRow[0]) return res.status(404).send('Order not found');

                // Security check: Verify order ownership
                const order = orderRow[0];
                const isLoggedIn = req.session && req.session.user && req.session.user.UserID;
                const orderUserId = order.UserID;

                if (isLoggedIn) {
                        // If user is logged in, they can only reorder their own orders
                        if (orderUserId && orderUserId !== req.session.user.UserID) {
                                return res.status(403).send('Access denied: You can only reorder your own orders');
                        }
                } else {
                        // If user is not logged in, check if this order is in their session
                        const sessionOrders = req.session && req.session.myOrders ? req.session.myOrders : [];
                        const canReorder = sessionOrders.includes(orderId);

                        if (!canReorder) {
                                return res.status(403).send('Access denied: You can only reorder orders you created in this session');
                        }
                }

                // Get order items
                const items = await dbQuery(`
                        SELECT od.*, p.Name AS ProductName
                        FROM order_details od
                        LEFT JOIN products p ON p.ProductID = od.ProductID
                        WHERE od.OrderID = ?
                        ORDER BY od.OrderDetailID
                `, [orderId]);

                if (!items || items.length === 0) {
                        return res.status(400).send('No items found in this order');
                }

                // Get order options for each item
                const options = await dbQuery(`
                        SELECT oio.* 
                        FROM order_item_options oio
                        WHERE oio.OrderDetailID IN (SELECT OrderDetailID FROM order_details WHERE OrderID = ?)
                        ORDER BY oio.OrderDetailID, oio.OptionID
                `, [orderId]);

                // Group options by OrderDetailID
                const optionsByDetailId = {};
                (options || []).forEach(opt => {
                        const detailId = opt.OrderDetailID;
                        if (!optionsByDetailId[detailId]) {
                                optionsByDetailId[detailId] = [];
                        }
                        optionsByDetailId[detailId].push(opt);
                });

                // Clear existing cart
                if (!req.session) req.session = {};
                req.session.orders = [];

                // Recreate cart items from order
                items.forEach(item => {
                        const itemOptions = optionsByDetailId[item.OrderDetailID] || [];

                        // Extract extras, sugar, and custom options
                        const extras = [];
                        let sugar = '';
                        let customSelected = '';

                        itemOptions.forEach(opt => {
                                const optType = (opt.OptionName || '').toLowerCase();
                                if (optType === 'topping' || optType === 'toppings') {
                                        extras.push(opt.OptionValue || '');
                                } else if (optType === 'sweetener' || optType === 'sugar') {
                                        sugar = opt.OptionValue || '';
                                } else if (optType === 'milk') {
                                        customSelected = opt.OptionValue || '';
                                }
                        });

                        const localId = 's' + Date.now() + Math.floor(Math.random() * 10000);
                        const cartItem = {
                                _localId: localId,
                                customerName: orderRow[0].CustomerName || '',
                                productId: item.ProductID,
                                product: item.ProductName || '',
                                size: item.Size || '',
                                sugar: sugar,
                                extras: extras,
                                customSelected: customSelected,
                                qty: item.Quantity || 1,
                                amountPerItem: parseFloat(item.UnitPrice || 0),
                                totalAmount: parseFloat(item.Subtotal || 0)
                        };

                        req.session.orders.push(cartItem);
                });

                console.log('[REORDER] Order', orderId, 'recreated in cart with', items.length, 'items');

                // Redirect to order summary
                return res.redirect('/order-summary');

        } catch (e) {
                console.error('[REORDER] Error:', e);
                return res.status(500).send('Failed to reorder');
        }
});

app.get('/order/:orderId', async function (req, res) {
        try {
                let param = parseInt(req.params.orderId, 10);
                if (!param) return res.status(404).send('Order not found');

                // First, try to find it as an OrderID
                let masterOrderId = param;
                const orderCheck = await dbQuery('SELECT OrderID FROM orders WHERE OrderID = ? LIMIT 1', [param]).catch(() => []);

                // If not found as OrderID, try as OrderDetailID
                if (!orderCheck || !orderCheck[0]) {
                        const possibleDetail = await dbQuery('SELECT OrderID FROM order_details WHERE OrderDetailID = ? LIMIT 1', [param]).catch(() => []);
                        if (possibleDetail && possibleDetail[0] && possibleDetail[0].OrderID) {
                                masterOrderId = possibleDetail[0].OrderID;
                        }
                }

                // Load master order and summary
                const orderRow = await dbQuery('SELECT o.*, s.StatusName FROM orders o LEFT JOIN status s ON o.StatusID = s.StatusID WHERE o.OrderID = ? LIMIT 1',
                        [masterOrderId]);
                if (!orderRow || !orderRow[0]) return res.status(404).send('Order not found');

                // Security check: Verify order ownership
                const order = orderRow[0];
                const isLoggedIn = req.session && req.session.user && req.session.user.UserID;
                const orderUserId = order.UserID;

                if (isLoggedIn) {
                        // If user is logged in, they can only view their own orders
                        if (orderUserId && orderUserId !== req.session.user.UserID) {
                                return res.status(403).send('Access denied: You can only view your own orders');
                        }
                } else {
                        // If user is not logged in, check if this order is in their session
                        const sessionOrders = req.session && req.session.myOrders ? req.session.myOrders : [];
                        const canViewOrder = sessionOrders.includes(masterOrderId);

                        if (!canViewOrder) {
                                return res.status(403).send('Access denied: You can only view orders you created in this session');
                        }
                }

                const row0 = orderRow[0];
                console.log('DEBUG: row0.OrderID =', row0.OrderID, 'masterOrderId =', masterOrderId, 'row0 =', row0);
                const header = {
                        OrderID: row0.OrderID || masterOrderId,
                        CustomerName: row0.CustomerName || row0.customerName,
                        TotalAmount: row0.TotalAmount || row0.totalAmount,
                        StatusID: row0.StatusID || 1,
                        StatusDescription: row0.StatusName || 'Pending',
                        PaymentMethod: row0.PaymentMethod || null,
                        CreatedAt: row0.CreatedAt || row0.created_at
                };
                console.log('DEBUG: header.OrderID =', header.OrderID);

                const items = await dbQuery(`SELECT od.*, p.Name AS ProductName
                                              FROM order_details od
                                              LEFT JOIN products p ON p.ProductID = od.ProductID
                                              WHERE od.OrderID = ? ORDER BY od.OrderDetailID`, [masterOrderId]);

                const options = await dbQuery(`SELECT oio.* 
                                                FROM order_item_options oio
                                                WHERE oio.OrderDetailID IN (SELECT OrderDetailID FROM order_details WHERE OrderID = ?)
                                                ORDER BY oio.OrderDetailID, oio.OptionID`, [masterOrderId]);

                // Group options by OrderDetailID (so each product gets its own options)
                const optionsByDetailId = {};
                (options || []).forEach(opt => {
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

                // Attach options to their respective items
                items.forEach(item => {
                        item.options = optionsByDetailId[item.OrderDetailID] || [];
                });

                // Also keep the old grouped format for backward compatibility (optional)
                function groupOptions(arr) {
                        const out = { Sweetener: [], Milk: [], Topping: [] };
                        (arr || []).forEach(o => {
                                const t = o.OptionName || 'Other';
                                const name = o.OptionValue || '';
                                const price = parseFloat(o.ExtraPrice || 0) || 0;
                                if (!out[t]) out[t] = [];
                                out[t].push({ name, price });
                        });
                        return out;
                }
                const groupedOptions = groupOptions(options);

                // Generate QR code if payment method is GCash or Online and status is Pending
                let qrCodeDataUrl = null;
                if ((header.PaymentMethod === 'GCash' || header.PaymentMethod === 'Online') && header.StatusDescription === 'Pending') {
                        const accountNumber = '09265363860'; // GCash account number
                        const qrData = `Order ID: ${header.OrderID}\nAmount: ₱${parseFloat(header.TotalAmount).toFixed(2)}\nAccount: ${accountNumber}`;
                        try {
                                qrCodeDataUrl = await QRCode.toDataURL(qrData);
                                console.log('[USER ORDER] QR Code generated successfully, length:', qrCodeDataUrl.length);
                        } catch (error) {
                                console.error('[USER ORDER] Error generating QR code:', error);
                        }
                }

                return res.render('viewOrder', {
                        header,
                        items,
                        optionsByType: groupedOptions,
                        qrCodeDataUrl,
                        __: req.__ || function (key) { return key; },
                        masterOrderId
                });
        } catch (e) {
                console.error('order history error', e);
                return res.status(500).send('Failed to load order');
        }
});
