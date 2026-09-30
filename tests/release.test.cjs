const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createManifest, verifyManifest } = require('../scripts/release-manifest.cjs');
const { publish } = require('../scripts/deploy.cjs');
const { metadata } = require('../scripts/release-policy.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-release-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, contents] of Object.entries({
    'index.html': '<html>New homepage</html>', 'about/index.html': '<html>About</html>',
    'vm/0123456789abcdef/vm-terminal.js': 'export const ready = true;',
    'vm/0123456789abcdef/v86.wasm': 'test wasm', 'vm/manifest.json': '{}',
    'ChaseFarrant-Resume.pdf': '%PDF-test'
  })) {
    const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, contents);
  }
  const manifest = createManifest(root, 'a'.repeat(40));
  return { root, manifest, bucket: 'public-site', archiveBucket: 'private-artifacts', distribution: 'DISTRIBUTION' };
}
test('release manifests detect changed, unlisted, and escaping files before deployment', async t => {
  const config = fixture(t);
  assert.equal(verifyManifest(config.root).release, config.manifest.release);
  assert.equal(createManifest(config.root, 'a'.repeat(40)).release, config.manifest.release);
  fs.writeFileSync(path.join(config.root, 'index.html'), 'unexpected edit');
  let called = false;
  await assert.rejects(publish(config, async () => { called = true; }), /checksum mismatch/);
  assert.equal(called, false, 'a modified build cannot make AWS calls');
  createManifest(config.root);
  fs.writeFileSync(path.join(config.root, 'forgotten.txt'), 'unlisted');
  assert.throws(() => verifyManifest(config.root), /unlisted/);
  const manifest = createManifest(config.root);
  manifest.files[0].path = '../outside';
  fs.writeFileSync(path.join(config.root, 'release.json'), JSON.stringify(manifest));
  assert.throws(() => verifyManifest(config.root), /Invalid release path/);
});
test('publishing waits for all assets, commits the homepage last, and retains earlier objects', async t => {
  const config = fixture(t); const calls = []; const completed = [];
  const run = async args => {
    calls.push(args);
    if (args[0] === 's3' && args[1] === 'cp') {
      if (args[3].endsWith('.html')) assert.equal(completed.filter(key => !key.endsWith('.html')).length, 4);
      if (args[3] === 's3://public-site/index.html') assert(completed.includes('s3://public-site/about/index.html'));
      await new Promise(resolve => setTimeout(resolve, 2)); completed.push(args[3]);
    }
    return args[1] === 'create-invalidation' ? JSON.stringify({ Invalidation: { Id: 'INVALIDATION' } }) : '{}';
  };
  await publish(config, run);
  assert.equal(calls[1][1], 'sync', 'archive is written before publishing');
  assert.equal(completed.at(-1), 's3://public-site/release.json');
  assert.equal(completed.at(-2), 's3://public-site/index.html');
  assert(!calls.some(args => args.includes('--delete') || args.includes('delete-object')));
  assert.deepEqual(calls.at(-1), ['cloudfront', 'wait', 'invalidation-completed', '--distribution-id', 'DISTRIBUTION', '--id', 'INVALIDATION']);
  for (const args of calls.filter(args => args[1] === 'cp')) {
    const key = args[3].slice('s3://public-site/'.length);
    assert.equal(args[args.indexOf('--content-type') + 1], metadata(key).contentType);
    assert.equal(args[args.indexOf('--cache-control') + 1], metadata(key).cacheControl);
  }
});
test('an asset upload failure never publishes pages or invalidates the live site', async t => {
  const config = fixture(t); const calls = [];
  await assert.rejects(publish(config, async args => {
    calls.push(args);
    if (args[1] === 'cp' && args[3].endsWith('.wasm')) throw new Error('Upload failed');
    return '{}';
  }), /Upload failed/);
  assert(!calls.some(args => args[1] === 'cp' && (args[3].endsWith('.html') || args[3].endsWith('/release.json'))));
  assert(!calls.some(args => args[0] === 'cloudfront'));
});
test('the first release backs up the legacy site and an archive failure stops publishing', async t => {
  const config = fixture(t); const calls = [];
  await assert.rejects(publish(config, async args => {
    calls.push(args);
    if (args[1] === 'head-object') throw new Error('404 Not Found');
    if (args[1] === 'sync') throw new Error('Archive unavailable');
  }), /Archive unavailable/);
  assert(calls[1][3].includes('/releases/legacy-'));
  assert(!calls.some(args => args[1] === 'cp'));
});

test('restoring an archived release verifies it and republishes without replacing its archive', async t => {
  const config = fixture(t); const calls = [];
  const restored = await publish({ ...config, restore: true }, async args => {
    calls.push(args);
    return args[1] === 'create-invalidation' ? JSON.stringify({ Invalidation: { Id: 'ROLLBACK' } }) : '{}';
  });
  assert.equal(restored.release, config.manifest.release);
  assert(!calls.some(args => args[1] === 'sync'), 'an existing archive remains intact');
  assert.equal(calls.filter(args => args[1] === 'cp').length, config.manifest.files.length + 1);
  assert(calls.at(-1).includes('ROLLBACK'));
});
