// MySQL connection setup

var mysql = require('mysql');
var db = mysql.createConnection({
    host: 'localhost',
    user: 'root', 
    password: '',
    database: 'alimondcafe' 
});

db.connect(function(err) {
    if (err) throw err;
    console.log('Connected to MySQL database!');
});

module.exports = db;