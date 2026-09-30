const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { listFiles, metadata } = require('./release-policy.cjs');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function createManifest(root, revision = process.env.CODEBUILD_RESOLVED_SOURCE_VERSION || process.env.GITHUB_SHA || 'local') {
  const files = listFiles(root).filter(key => key !== 'release.json').map(key => {
    const bytes = fs.readFileSync(path.join(root, key));
    return { path: key, bytes: bytes.length, sha256: sha256(bytes), ...metadata(key) };
  });
  const contentHash = sha256(JSON.stringify(files));
  const prefix = /^[a-f0-9]{40}$/.test(revision) ? revision.slice(0, 12) : 'local';
  const manifest = { version: 1, release: `${prefix}-${contentHash.slice(0, 16)}`, revision, files };
  fs.writeFileSync(path.join(root, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
function verifyManifest(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release.json')));
  if (manifest.version !== 1 || !/^[a-z0-9-]+$/.test(manifest.release)) throw new Error('Invalid release manifest');
  const names = new Set();
  for (const file of manifest.files) {
    const key = file.path;
    if (!key || key.startsWith('/') || key.includes('\\') || key.split('/').some(part => !part || part === '.' || part === '..') || key === 'release.json' || names.has(key)) throw new Error(`Invalid release path: ${key}`);
    names.add(key);
    const bytes = fs.readFileSync(path.join(root, key));
    if (sha256(bytes) !== file.sha256 || bytes.length !== file.bytes) throw new Error(`Release checksum mismatch: ${key}`);
    const expected = metadata(key);
    if (file.contentType !== expected.contentType || file.cacheControl !== expected.cacheControl) throw new Error(`Unexpected release headers: ${key}`);
  }
  if (JSON.stringify([...names].sort()) !== JSON.stringify(listFiles(root).filter(key => key !== 'release.json'))) throw new Error('Release includes unlisted files');
  return manifest;
}
module.exports = { createManifest, verifyManifest };
