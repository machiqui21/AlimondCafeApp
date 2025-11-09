const http = require('http');
http.get('http://localhost:2000/menu', res => {
  console.log('STATUS', res.statusCode);
  console.log('HEADERS', res.headers);
  let body = '';
  res.setEncoding('utf8');
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('BODY_START:\n', body.substring(0, 2000));
  });
}).on('error', err => {
  console.error('REQUEST ERROR', err && err.message);
  process.exit(1);
});
