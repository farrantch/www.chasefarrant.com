const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { metadata } = require('./release-policy.cjs');
const { createManifest, verifyManifest } = require('./release-manifest.cjs');
const executeFile = promisify(execFile);
async function aws(args) {
  const result = await executeFile('aws', [...args, '--no-cli-pager'], { maxBuffer: 8 * 1024 * 1024 });
  return result.stdout;
}
function phases(manifest) {
  const assets = manifest.files.filter(file => !file.path.endsWith('.html'));
  const pages = manifest.files.filter(file => file.path.endsWith('.html') && file.path !== 'index.html');
  const home = manifest.files.find(file => file.path === 'index.html');
  if (!home) throw new Error('Release has no homepage');
  return [assets, pages, [home], [{ path: 'release.json', ...metadata('release.json') }]];
}
async function uploadGroup(files, upload) {
  let cursor = 0;
  const errors = [];
  await Promise.all(Array.from({ length: Math.min(4, files.length) }, async () => {
    while (!errors.length && cursor < files.length) {
      const file = files[cursor++];
      try { await upload(file); } catch (error) { errors.push(error); }
    }
  }));
  if (errors.length) throw errors[0];
}
async function publish({ root, bucket, archiveBucket, distribution, restore = false }, run = aws) {
  if (!bucket || !archiveBucket || !distribution || bucket === archiveBucket) throw new Error('Separate site and archive buckets and a distribution are required');
  const manifest = verifyManifest(root);
  const archive = `s3://${archiveBucket}/releases/${manifest.release}/site/`;
  // Archive the current legacy site once, before the first manifest-based release.
  try {
    await run(['s3api', 'head-object', '--bucket', bucket, '--key', 'release.json']);
  } catch (error) {
    if (!/\b(404|NoSuchKey|Not Found)\b/.test(error.stderr || error.message)) throw error;
    await run(['s3', 'sync', `s3://${bucket}/`, `s3://${archiveBucket}/releases/legacy-${manifest.release}/site/`, '--copy-props', 'metadata-directive', '--only-show-errors']);
  }
  if (!restore) await run(['s3', 'sync', root + '/', archive, '--only-show-errors']);
  for (const group of phases(manifest)) {
    await uploadGroup(group, file => run(['s3', 'cp', path.join(root, file.path), `s3://${bucket}/${file.path}`,
      '--content-type', file.contentType, '--cache-control', file.cacheControl, '--only-show-errors']));
  }
  const result = JSON.parse(await run(['cloudfront', 'create-invalidation', '--distribution-id', distribution, '--paths', '/*', '--output', 'json']));
  await run(['cloudfront', 'wait', 'invalidation-completed', '--distribution-id', distribution, '--id', result.Invalidation.Id]);
  return manifest;
}
async function main() {
  const options = {};
  for (let i = 2; i < process.argv.length; i++) {
    const name = process.argv[i];
    if (name === '--execute') options.execute = true;
    else if (['--stack', '--bucket', '--archive-bucket', '--distribution', '--from-release', '--root'].includes(name)) {
      const value = process.argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
      options[name.slice(2)] = value;
    } else throw new Error(`Unknown option: ${name}`);
  }
  let siteUrl;
  if (options.stack) {
    const outputs = JSON.parse(await aws(['cloudformation', 'describe-stacks', '--stack-name', options.stack, '--query', 'Stacks[0].Outputs', '--output', 'json']));
    const get = name => outputs.find(value => value.OutputKey === name)?.OutputValue;
    options.bucket = get('S3BucketNameWww');
    options.distribution = get('CloudFrontDistributionIdWww');
    siteUrl = get('SiteUrl');
  }
  let root = path.resolve(options.root || path.join(__dirname, '../site/_site'));
  let temporary;
  let preparedLegacy = false;
  try {
    if (options['from-release']) {
      if (!/^[a-z0-9-]+$/.test(options['from-release']) || !options['archive-bucket']) throw new Error('A valid release ID and archive bucket are required');
      temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-rollback-'));
      root = temporary;
      await aws(['s3', 'sync', `s3://${options['archive-bucket']}/releases/${options['from-release']}/site/`, root, '--only-show-errors']);
      if (options['from-release'].startsWith('legacy-') && !fs.existsSync(path.join(root, 'release.json'))) {
        createManifest(root, options['from-release']);
        preparedLegacy = true;
      }
    }
    const manifest = verifyManifest(root);
    console.log(`Release ${manifest.release}: ${manifest.files.length} files; assets first, homepage last; previous assets retained.`);
    if (!options.execute) {
      console.log('Dry run. Add --execute to publish this release.');
      return;
    }
    await publish({ root, bucket: options.bucket, archiveBucket: options['archive-bucket'], distribution: options.distribution, restore: Boolean(options['from-release']) && !preparedLegacy });
    console.log(`Published ${manifest.release}`);
    if (siteUrl) await require('./check-hosted.cjs')(siteUrl, manifest.release);
  } finally {
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
  }
}
module.exports = { publish, phases };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
