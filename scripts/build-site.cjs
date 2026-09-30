const fs = require('node:fs');
const path = require('node:path');
const { createManifest } = require('./release-manifest.cjs');
const checkSite = require('./check-site.cjs');
(async () => {
  const site = path.resolve(__dirname, '../site');
  const output = path.join(site, '_site');
  fs.rmSync(output, { recursive: true, force: true });
  process.chdir(site);
  const { default: Eleventy } = await import('@11ty/eleventy');
  await new Eleventy('.', '_site').write();
  checkSite(output);
  const release = createManifest(output);
  console.log(`Release ready: ${release.release} (${release.files.length} files)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
