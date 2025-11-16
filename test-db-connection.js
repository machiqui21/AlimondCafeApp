#!/usr/bin/env node
/**
 * Test script to diagnose MySQL connection issues
 * Run with: node test-db-connection.js
 */

require('dotenv').config();
const mysql = require('mysql');

console.log('=== MySQL Connection Test ===\n');

// Read configuration from .env
const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'alimondcafe'
};

console.log('Testing connection with:');
console.log('  Host:', config.host);
console.log('  Port:', config.port);
console.log('  User:', config.user);
console.log('  Password:', config.password ? '(set)' : '(empty)');
console.log('  Database:', config.database);
console.log();

// Test 1: Connect without database to check basic auth
console.log('Test 1: Basic connection (no database)...');
const basicConn = mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password
});

basicConn.connect(err => {
    if (err) {
        console.error('❌ Basic connection FAILED:');
        console.error('   Error code:', err.code);
        console.error('   Message:', err.message);
        console.error();
        console.log('💡 Troubleshooting tips:');
        console.log('   - Ensure MySQL is running');
        console.log('   - Check your DB_USER and DB_PASSWORD in .env file');
        console.log('   - If using XAMPP/WAMP, password might be empty or "root"');
        console.log('   - Try running: mysql -u root -p (enter password when prompted)');
        process.exit(1);
    }
    
    console.log('✅ Basic connection successful!');
    
    // Test 2: Show databases
    console.log('\nTest 2: Listing databases...');
    basicConn.query('SHOW DATABASES', (err, results) => {
        if (err) {
            console.error('❌ Failed to list databases:', err.message);
            basicConn.end();
            process.exit(1);
        }
        
        const databases = results.map(r => r.Database);
        console.log('✅ Available databases:', databases.join(', '));
        
        // Test 3: Check if target database exists
        console.log('\nTest 3: Checking if database "' + config.database + '" exists...');
        if (databases.includes(config.database)) {
            console.log('✅ Database "' + config.database + '" exists');
            
            // Test 4: Connect to the database
            console.log('\nTest 4: Connecting to database "' + config.database + '"...');
            basicConn.changeUser({database: config.database}, err => {
                if (err) {
                    console.error('❌ Failed to switch to database:', err.message);
                    basicConn.end();
                    process.exit(1);
                }
                
                console.log('✅ Successfully connected to database "' + config.database + '"');
                
                // Test 5: Show tables
                console.log('\nTest 5: Listing tables...');
                basicConn.query('SHOW TABLES', (err, results) => {
                    if (err) {
                        console.error('❌ Failed to list tables:', err.message);
                    } else {
                        const tableKey = 'Tables_in_' + config.database;
                        const tables = results.map(r => r[tableKey]);
                        if (tables.length === 0) {
                            console.log('⚠️  No tables found (database is empty)');
                        } else {
                            console.log('✅ Tables found:', tables.join(', '));
                        }
                    }
                    
                    console.log('\n=== All tests completed successfully! ===');
                    console.log('Your database configuration is correct.');
                    basicConn.end();
                });
            });
        } else {
            console.log('⚠️  Database "' + config.database + '" does NOT exist');
            console.log('\n💡 You need to create the database. Run this command:');
            console.log('   mysql -u ' + config.user + ' -p -e "CREATE DATABASE ' + config.database + ';"');
            console.log('\n   Or update DB_NAME in .env to use an existing database.');
            basicConn.end();
            process.exit(1);
        }
    });
});
