// Import only the game package outputs from the documented Docker build.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
if (!process.argv[2]) throw new Error('Usage: node vm/programs/games/import.cjs BUILD_OUTPUT');
const output = path.resolve(process.argv[2]);
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const sources = require('./sources.json');
const manifest = path.join(root, 'vm/assets.json');
const assets = JSON.parse(fs.readFileSync(manifest)).filter(asset =>
  !asset.name.startsWith('games/') && !sources.some(source => source.archive === asset.name));
for (const source of sources) {
  const data = fs.readFileSync(path.join(root, 'vm/assets', source.archive));
  if (digest(data) !== source.sha256) throw new Error(`Source checksum mismatch: ${source.archive}`);
  assets.push({ name: source.archive, url: source.url, sha256: source.sha256 });
}
function copyPackages(directory, relative = 'opt') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const source = path.join(directory, entry.name);
    const guestPath = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) { copyPackages(source, guestPath); continue; }
    if (!entry.isFile()) throw new Error(`Expected a regular package file: ${source}`);
    const name = `games/${guestPath}`;
    const target = path.join(root, 'vm/assets', name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const data = fs.readFileSync(source);
    fs.writeFileSync(target, data);
    assets.push({ name, source: 'vm/programs/games/Dockerfile', guestPath,
      mode: 0o100000 | (fs.statSync(source).mode & 0o777), sha256: digest(data) });
  }
}
copyPackages(path.join(output, 'rootfs/opt'));
for (const name of ['VITETRIS-LICENSE.txt', 'NBSDGAMES-LICENSE.txt', '2048-LICENSE.txt']) {
  fs.copyFileSync(path.join(output, name), path.join(root, 'vm/licenses', name));
}
fs.copyFileSync(path.join(output, 'build-packages.txt'), path.join(__dirname, 'build-packages.txt'));
fs.writeFileSync(manifest, JSON.stringify(assets, null, 2) + '\n');
console.log('Imported game packages, licenses, dependency versions, and asset checksums.');
