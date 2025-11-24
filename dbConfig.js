// MySQL connection setup (use a pool to avoid 'Cannot enqueue Query after fatal error')
require('dotenv').config();
var mysql = require('mysql');

// Resolve configuration from environment with sensible defaults
function env(name, fallback) {
    var v = process.env[name];
    if (typeof v === 'undefined' || v === null || v === '') return fallback;
    return v;
}

// Support both DB_* and MYSQL_* prefixes
var DB_HOST = env('DB_HOST', env('MYSQL_HOST', 'localhost'));
var DB_PORT = parseInt(env('DB_PORT', env('MYSQL_PORT', '3306')), 10) || 3306;
var DB_USER = env('DB_USER', env('MYSQL_USER', 'root'));
var DB_PASSWORD = env('DB_PASSWORD', env('MYSQL_PASSWORD', ''));
var DB_NAME = env('DB_NAME', env('MYSQL_DATABASE', 'alimondcafe'));

// Create a connection pool instead of a single connection
var pool = mysql.createPool({
    connectionLimit: 10,
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    // Robust timeouts to avoid initial handshake failures on slow/hibernated MySQL
    connectTimeout: 60_000,      // ms to wait for initial connection/handshake
    acquireTimeout: 60_000,      // ms to wait when getting a connection from pool
    // Helpful defaults
    charset: 'utf8mb4_unicode_ci',
    supportBigNumbers: true,
    // prevent long idles from being dropped without us noticing (ignored by mysqljs but harmless)
    waitForConnections: true,
    queueLimit: 0
});

// Helpful diagnostics; attach error listeners on each acquired connection
pool.on('connection', function (connection) {
    console.log('MySQL pool: new connection established, threadId=', connection.threadId, 'host=', DB_HOST, 'port=', DB_PORT, 'db=', DB_NAME);
    connection.on('error', function (err) {
        console.error('MySQL pooled connection error:', err && err.code ? err.code : '', err && err.message ? err.message : err);
        // The pool will discard fatal connections; queries will use a healthy connection next time
    });
});

pool.on('error', function (err) {
    // Pool-level errors (rare); log for visibility
    console.error('MySQL pool error:', err && err.code ? err.code : '', err && err.message ? err.message : err);
    if (err && (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST')) {
        console.error('Tip: Ensure your MySQL server is running and reachable.');
        console.error('  - Current target -> host: ' + DB_HOST + ', port: ' + DB_PORT + ', user: ' + DB_USER + ', db: ' + DB_NAME);
        console.error('  - On Windows: open Services (services.msc) and start the MySQL service (e.g., MySQL, MySQL80), or start it via XAMPP/WAMP.');
        console.error('  - If your MySQL runs on a different port (e.g., 3307 in WAMP), set DB_PORT=3307 in a .env file.');
    }
});

// Optional keep-alive ping to keep the pool warm and detect drops early.
// Interval can be tuned via KEEPALIVE_MS (default 60000). Set KEEPALIVE_MS=0 to disable.
try {
    var KEEPALIVE_MS = parseInt(env('KEEPALIVE_MS', '60000'), 10) || 0;
    if (KEEPALIVE_MS > 0) {
        setInterval(function () {
            pool.query('SELECT 1', function (err) {
                if (err && err.code) {
                    console.warn('MySQL keep-alive failed:', err.code, err.message || err);
                }
            });
        }, KEEPALIVE_MS).unref(); // allow process to exit naturally
    }
} catch (e) { /* non-fatal */ }

// Proactive warmup to establish a connection at startup and surface handshake issues early
pool.warmup = function warmup(attempts) {
    attempts = typeof attempts === 'number' ? attempts : 3;
    return new Promise(function(resolve) {
        (function tryOnce(left){
            pool.getConnection(function(err, conn){
                if (!err && conn) {
                    // ping once, then release
                    return conn.ping(function(){ try { conn.release(); } catch(e){} return resolve(true); });
                }
                if (left > 1) {
                    setTimeout(function(){ tryOnce(left - 1); }, 1000);
                } else {
                    // last attempt failed; resolve false but let app continue (routes will still use pool)
                    console.warn('MySQL pool warmup failed:', err && err.message ? err.message : err);
                    if (err && err.code === 'ECONNREFUSED') {
                        console.warn('Connection refused. Check that your MySQL service is running on ' + DB_HOST + ':' + DB_PORT + '.');
                        console.warn('If you use WAMP/XAMPP, the port is often 3307. You can set DB_PORT=3307 in a .env file at the project root.');
                    }
                    resolve(false);
                }
            });
        })(attempts);
    });
};

// Graceful shutdown helper so the application can call this on exit to minimize aborted connections.
function shutdownPool(label){
    try {
        console.log('[db] shutting down pool' + (label ? ' ('+label+')' : ''));
        pool.end(function(err){
            if (err) console.warn('[db] pool.end error:', err.message || err);
            else console.log('[db] pool closed');
        });
    } catch(e){ console.warn('[db] pool shutdown threw:', e && e.message || e); }
}

// Export a simple health check (returns Promise<boolean>)
function healthCheck(){
    return new Promise(function(resolve){
        pool.query('SELECT 1 AS ok', function(err, rows){
            if (err) return resolve(false);
            resolve(Array.isArray(rows));
        });
    });
}

pool.shutdown = shutdownPool;
pool.healthCheck = healthCheck;

module.exports = pool;