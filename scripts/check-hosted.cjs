const assert = require('node:assert/strict');
async function checkHosted(base, release) {
  const origin = new URL(base);
  const response = await fetch(new URL('/release.json', origin), { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, 'Release manifest must be public');
  const manifest = await response.json();
  if (release) assert.equal(manifest.release, release, 'Hosted release must match the tested artifact');
  let cursor = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (cursor < manifest.files.length) {
      const file = manifest.files[cursor++];
      const result = await fetch(new URL('/' + file.path, origin), { method: 'HEAD', signal: AbortSignal.timeout(30000) });
      assert.equal(result.status, 200, file.path);
      assert.equal(result.headers.get('content-type')?.split(';')[0], file.contentType.split(';')[0], `${file.path}: content type`);
      const cache = result.headers.get('cache-control') || '';
      assert(cache.includes(file.cacheControl.includes('immutable') ? 'immutable' : 'no-cache'), `${file.path}: cache policy (${cache})`);
    }
  }));
  console.log(`Hosted release ${manifest.release}: URLs, content types, and cache headers passed.`);
}
module.exports = checkHosted;
if (require.main === module) checkHosted(process.argv[2], process.argv[3]).catch(error => { console.error(error); process.exitCode = 1; });
