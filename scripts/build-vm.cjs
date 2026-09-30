const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { gzipSync } = require('node:zlib');
const { archive, readOverlay } = require('./cpio.cjs');
const portfolio = require('../site/_lib/portfolio.cjs');
const root = path.resolve(__dirname, '..');
const assets = require('../vm/assets.json');
const digest = data => crypto.createHash('sha256').update(data).digest('hex');

function buildVM(output = path.join(root, 'site/_site')) {
  const files = [...readOverlay(path.join(root, 'vm/overlay')), ...portfolio().files];
  const payload = new Map();
  for (const asset of assets) {
    const data = fs.readFileSync(path.join(root, 'vm/assets', asset.name));
    if (digest(data) !== asset.sha256) throw new Error(`VM asset checksum mismatch: ${asset.name}`);
    if (asset.guestPath) files.push({ path: asset.guestPath, data, mode: asset.mode ?? 0o100644 });
    else payload.set(asset.name, data);
  }
  payload.set('portfolio.cpio.gz', gzipSync(archive(files), { level: 9 }));
  const vendor = {
    'libv86.mjs': 'v86/build/libv86.mjs',
    'v86.wasm': 'v86/build/v86.wasm',
    'v86-fallback.wasm': 'v86/build/v86-fallback.wasm',
    'xterm.mjs': '@xterm/xterm/lib/xterm.mjs',
    'xterm.css': '@xterm/xterm/css/xterm.css',
    'addon-fit.mjs': '@xterm/addon-fit/lib/addon-fit.mjs',
    'addon-web-links.mjs': '@xterm/addon-web-links/lib/addon-web-links.mjs',
    'V86-LICENSE.txt': 'v86/LICENSE',
    'XTERM-LICENSE.txt': '@xterm/xterm/LICENSE'
  };
  for (const [name, source] of Object.entries(vendor)) payload.set(name, fs.readFileSync(path.join(root, 'node_modules', source)));
  // v86 0.5.462 revokes its scheduler worker URL before WebKit loads it.
  // Keep that URL until the scheduler is disposed. These exact matches also
  // force a review of the workaround when the pinned emulator is upgraded.
  let emulator = payload.get('libv86.mjs').toString();
  for (const [before, after] of [
    ['URL.revokeObjectURL(b)};G.prototype.yield=', 'this.worker_blob_url=b};G.prototype.yield='],
    ['this.worker&&this.worker.terminate();this.worker=null',
      'this.worker&&this.worker.terminate();if(this.worker_blob_url)URL.revokeObjectURL(this.worker_blob_url);this.worker_blob_url=null;this.worker=null']
  ]) {
    if (emulator.split(before).length !== 2) throw new Error('Review the v86 worker URL lifetime patch for this version');
    emulator = emulator.replace(before, after);
  }
  payload.set('libv86.mjs', Buffer.from(emulator));
  for (const name of ['initial-view.js', 'vm-terminal.js', 'boot-sequence.mjs', 'login-buffer.mjs', 'vm-bridge.mjs', 'touch-scroll.mjs']) {
    payload.set(name, fs.readFileSync(path.join(root, 'site/js', name)));
  }
  payload.set('terminal.css', fs.readFileSync(path.join(root, 'site/css/terminal.css')));
  for (const name of fs.readdirSync(path.join(root, 'vm/licenses')).sort()) payload.set(name, fs.readFileSync(path.join(root, 'vm/licenses', name)));
  for (const program of ['nano', 'curl', 'games']) {
    payload.set(`${program}-Dockerfile`, fs.readFileSync(path.join(root, `vm/programs/${program}/Dockerfile`)));
    payload.set(`${program}-build-packages.txt`, fs.readFileSync(path.join(root, `vm/programs/${program}/build-packages.txt`)));
  }
  payload.set('games-sources.json', fs.readFileSync(path.join(root, 'vm/programs/games/sources.json')));
  payload.set('SOURCES.txt', fs.readFileSync(path.join(root, 'vm/SOURCES.txt')));
  const version = digest(Buffer.concat([...payload.values()])).slice(0, 16);
  const directory = path.join(output, 'vm', version);
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, data] of payload) fs.writeFileSync(path.join(directory, name), data);
  const config = { base: `/vm/${version}/`, version, memoryMiB: 128, bootTimeoutMs: 90000 };
  fs.writeFileSync(path.join(output, 'vm/manifest.json'), JSON.stringify(config, null, 2));
  return config;
}
module.exports = buildVM;
if (require.main === module) console.log(JSON.stringify(buildVM(), null, 2));
