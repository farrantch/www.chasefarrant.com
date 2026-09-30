const fs = require('node:fs');
const path = require('node:path');
const immutable = key => /^vm\/[a-f0-9]{16}\//.test(key) || /^(gen|fonts)\//.test(key);
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml', '.ico': 'image/vnd.microsoft.icon', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
  '.gz': 'application/gzip', '.xz': 'application/x-xz'
};
function metadata(key) {
  return {
    contentType: types[path.extname(key)] || 'application/octet-stream',
    cacheControl: immutable(key) ? 'public, max-age=31536000, immutable' : 'no-cache, max-age=0, must-revalidate'
  };
}
function listFiles(root, directory = '') {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const key = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(root, key);
    if (!entry.isFile()) throw new Error(`Unexpected release entry: ${key}`);
    return [key];
  }).sort();
}
module.exports = { metadata, immutable, listFiles };
