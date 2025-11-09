// Simple connectivity check for MySQL using the shared pool
require('dotenv').config();
const mysql = require('mysql');
const pool = require('../dbConfig');

function tipMessages(host, port) {
    console.error('\nTroubleshooting tips for ECONNREFUSED:');
    console.error(' 1. Ensure MySQL service is running (Windows: services.msc -> start MySQL / MySQL80).');
    console.error(' 2. If using XAMPP/WAMP, start MySQL; check the port (often 3307 in WAMP).');
    console.error(' 3. Verify credentials: DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME in a .env file.');
    console.error(' 4. Test manually: mysql -h ' + host + ' -P ' + port + ' -u ' + (process.env.DB_USER||'root') + ' -p');
    console.error(' 5. Check if another service is using the port: netstat -ano | findstr :' + port);
}

const host = (pool.config && pool.config.connectionConfig && pool.config.connectionConfig.host) || process.env.DB_HOST || 'localhost';
const port = (pool.config && pool.config.connectionConfig && pool.config.connectionConfig.port) || parseInt(process.env.DB_PORT||'3306',10) || 3306;
console.log('[db-check] Attempting to get a connection to', host + ':' + port);

pool.getConnection(function(err, conn){
    if (err) {
        console.error('[db-check] FAILED:', err.code || '', err.message || err);
        if (err.code === 'ECONNREFUSED' && (port === 3306 || String(port) === '3306')) {
            // Try a quick fallback to 3307 (common on WAMP)
            const tempPool = mysql.createPool({
                host: host,
                port: 3307,
                user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
                password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
                database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'alimondcafe',
                connectTimeout: 5000
            });
            tempPool.getConnection(function(err2, c2){
                if (!err2 && c2) {
                    console.log('[db-check] SUCCESS on fallback port 3307. Your MySQL likely runs on 3307.');
                    console.log('Action: Create a .env file and set DB_PORT=3307');
                    try { c2.release(); } catch(e){}
                    return tempPool.end(function(){ process.exit(0); });
                }
                console.error('[db-check] Fallback to 3307 also failed:', err2 && (err2.code + ' ' + err2.message) || err2);
                tipMessages(host, port);
                return process.exit(1);
            });
            return; // don't continue in this branch
        }
        tipMessages(host, port);
        return process.exit(1);
    }
    console.log('[db-check] SUCCESS: Connected. threadId=', conn.threadId);
    conn.ping(function(pingErr){
        if (pingErr) console.error('[db-check] Ping failed:', pingErr.message || pingErr);
        try { conn.release(); } catch(e){}
        pool.end(function(){ process.exit(pingErr ? 2 : 0); });
    });
});
