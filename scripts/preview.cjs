const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { metadata } = require('./release-policy.cjs');
module.exports = function preview(root) {
  root = path.resolve(root);
  return http.createServer((request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      let key = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      let file = path.resolve(root, key);
      if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
      if (fs.statSync(file).isDirectory()) { key = path.posix.join(key, 'index.html'); file = path.join(file, 'index.html'); }
      const stat = fs.statSync(file);
      const headers = metadata(key);
      response.setHeader('Content-Type', headers.contentType);
      response.setHeader('Cache-Control', headers.cacheControl);
      response.setHeader('Content-Length', stat.size);
      if (request.method === 'HEAD') response.end();
      else fs.createReadStream(file).pipe(response);
    } catch { response.writeHead(404).end('Not found'); }
  });
};
