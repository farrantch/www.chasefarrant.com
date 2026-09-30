const fs = require('node:fs');
const path = require('node:path');
const { listFiles } = require('./release-policy.cjs');
function checkSite(root) {
  const missing = [];
  for (const name of listFiles(root).filter(key => key.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    for (const tag of html.matchAll(/<(?:a|link|img|script|source)\b[^>]*>/gi)) {
      for (const match of tag[0].matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
        const value = match[1].replace(/&amp;/g, '&');
        const url = new URL(value, `https://release.invalid/${name}`);
        if (url.origin !== 'https://release.invalid' || value.startsWith('#')) continue;
        let target = path.join(root, decodeURIComponent(url.pathname));
        if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
        if (!fs.existsSync(target)) missing.push(`${name}: ${value}`);
      }
    }
  }
  if (missing.length) throw new Error('Missing local site files:\n' + missing.join('\n'));
  console.log('Generated site links and assets passed.');
}
module.exports = checkSite;
if (require.main === module) checkSite(path.resolve(__dirname, '../site/_site'));
