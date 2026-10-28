// Day Ledger server: serves the site and stores events in events.json.
// No dependencies. Run with:  node server.js
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';   // set HOST=0.0.0.0 to allow other devices on your network
const DIR = __dirname;
const DATA = path.join(DIR, 'events.json');
const MAX_BODY = 1024 * 1024; // 1 MB

const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/script.js': ['script.js', 'text/javascript; charset=utf-8']
};

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/api/events') {
    if (req.method === 'GET') {
      fs.readFile(DATA, 'utf8', (err, txt) => {
        if (err) return send(res, 200, 'application/json', 'null'); // no file yet
        send(res, 200, 'application/json', txt || 'null');
      });
      return;
    }
    if (req.method === 'PUT') {
      let body = '', size = 0, aborted = false;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY) { aborted = true; send(res, 413, 'text/plain', 'Too large'); req.destroy(); return; }
        body += chunk;
      });
      req.on('end', () => {
        if (aborted) return;
        let parsed;
        try { parsed = JSON.parse(body); } catch (e) { return send(res, 400, 'text/plain', 'Invalid JSON'); }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return send(res, 400, 'text/plain', 'Expected an object');
        const tmp = DATA + '.tmp';
        fs.writeFile(tmp, JSON.stringify(parsed, null, 2), (err) => {
          if (err) return send(res, 500, 'text/plain', 'Write failed');
          fs.rename(tmp, DATA, (err2) => {
            if (err2) return send(res, 500, 'text/plain', 'Write failed');
            send(res, 200, 'application/json', '{"ok":true}');
          });
        });
      });
      return;
    }
    return send(res, 405, 'text/plain', 'Method not allowed');
  }

  const entry = req.method === 'GET' && STATIC[url];
  if (!entry) return send(res, 404, 'text/plain', 'Not found');
  fs.readFile(path.join(DIR, entry[0]), (err, data) => {
    if (err) return send(res, 500, 'text/plain', 'Read failed');
    send(res, 200, entry[1], data);
  });
}).listen(PORT, HOST, () => {
  console.log('Day Ledger running at http://' + (HOST === '0.0.0.0' ? 'localhost' : HOST) + ':' + PORT);
  console.log('Events are saved in ' + DATA);
});
