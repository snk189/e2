const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/demand',
  method: 'OPTIONS',
  headers: {
    'Origin': 'http://localhost:5173',
    'Access-Control-Request-Method': 'GET',
    'Access-Control-Request-Headers': 'bypass-tunnel-reminder, ngrok-skip-browser-warning'
  }
};

const req = http.request(options, (res) => {
  console.log('STATUS:', res.statusCode);
  console.log('HEADERS:', JSON.stringify(res.headers, null, 2));
});

req.on('error', (e) => {
  console.error('Problem with request:', e.message);
});
req.end();
