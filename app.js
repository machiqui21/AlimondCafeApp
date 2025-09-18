var express = require('express');
var app = express();    
app.set('view engine', 'ejs');
app.use(express.static('styles'));
app.get('/', function(req, res) {
    res.render("homepage");
});
app.get('/menu', function(req, res) {
    res.render("menu");
});
app.listen(2000, function() {
    console.log("Server is running on port 2000");
});
