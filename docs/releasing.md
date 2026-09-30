# Releasing the portfolio

## Local checks

Use Node.js 22 (`nvm use` reads `.nvmrc`), then run:

```sh
npm ci
npm audit --audit-level=moderate
npm test
npm run test:vm
npm run build
npx playwright install --with-deps chromium firefox webkit
npm run test:browser
npm run test:browsers
node scripts/deploy.cjs
```

The final command is a dry run. It validates the artifact without writing to AWS.
`npm run build` clears only generated `site/_site` output, checks local links,
and creates a release manifest. Rebuild after any source change before running
the browser tests or deploying. Development output from `npm run dev` is not a
release artifact.

GitHub Actions and the AWS build run the same checks on Node.js 22. The AWS build
produces its artifact only after all checks pass. Pushing to `main` triggers the
production CodePipeline; use a branch for work that is not ready to publish.
A deployment applies the CloudFormation changes included in that same commit.

## Cache behavior

Terminal code, CSS, emulator files, and the guest image share a content-derived
`/vm/<hash>/` directory. A page therefore always requests matching versions.
Those assets, generated image filenames, and versioned font filenames use
`public, max-age=31536000, immutable`. The mutable VM manifest, HTML, résumé,
and other fixed URLs use `no-cache, max-age=0, must-revalidate`. CloudFront uses
separate behaviors for those groups. The uploader explicitly supplies MIME
types, including JavaScript modules, WebAssembly, and PDF. Résumé links also
include a content hash in the query string to bypass PDF copies cached under
the former one-year policy. A browser that already cached the old homepage
may need a hard refresh once; changing server headers cannot evict a fresh
copy from that browser.

## Deployment and recovery

The deploy job calls `scripts/deploy.cjs` with the site stack and private
pipeline artifact bucket. The runner:

1. Verifies every file against the release manifest.
2. On the first release, saves the legacy public site under
   `releases/legacy-<new-release-id>/site/` in the private artifact bucket.
3. Archives the new tested output under `releases/<release-id>/site/`.
4. Uploads non-HTML assets, then secondary pages, then the homepage.
5. Publishes `release.json` as the release marker, invalidates CloudFront,
   waits for completion, and checks public URLs and their response headers.

An asset or archive failure stops the release before any HTML is published.
Uploads do not delete previous assets. Existing browser tabs can still request
their original VM version. An interruption during the HTML phase may leave a
mix of page versions; restore the last known-good archived release in that case.
Keep the release ID from the last successful deployment. Archives stay in the
private artifact bucket; the public manifest contains only public file paths,
hashes, metadata, and the source revision.

Preview a rollback (this reads the archive but does not publish):

```sh
node scripts/deploy.cjs --stack cf-prod-portfolio \
  --archive-bucket YOUR_PIPELINE_ARTIFACT_BUCKET \
  --from-release PREVIOUS_RELEASE_ID
```

Run the same command with `--execute` to restore it. The first pre-migration
backup uses the `legacy-...` ID described above. Rollback restores website files;
review infrastructure changes separately if the CloudFormation update itself
needs to be reverted. Old assets and archives are retained until deliberately
cleaned up, rather than being removed during deployment.

## Verified AWS configuration

Read-only checks on 2026-09-29 confirmed account `010655802910`, site stack
`cf-prod-portfolio`, and pipeline stack `cf-prod-portfolio-pipeline`. Production
tracks `main`; both existing CodeBuild jobs had five-minute timeouts. The live
homepage and résumé returned a one-year cache lifetime. The private pipeline
bucket has versioning enabled and owner-only ACL access.

Both website buckets have legacy public-read ACLs and no ownership controls.
The template makes their existing ObjectWriter behavior explicit. CloudFormation
validation passes; `cfn-lint` reports only the existing legacy-ACL warnings.
Migrating these website origins to private S3 access is a separate infrastructure
change. No live AWS settings were changed during these checks.

## Hosted checks

After deployment, this read-only check verifies every release URL, MIME type,
and cache policy, plus the expected release ID when supplied:

```sh
npm run check:hosted -- https://www.chasefarrant.com EXPECTED_RELEASE_ID
```

A preview on actual AWS hosting still requires an authenticated AWS profile
and an existing preview environment or an explicitly approved deployment.
The repository defines production; it does not silently create a paid staging
environment. Playwright WebKit covers the Safari engine, but final interaction
on a physical iPhone or Android device remains a manual check. Verify boot,
keyboard, scrolling, Browse, résumé download, and reboot on that device.

## Content and bundled programs

The published résumé is `site/ChaseFarrant-Resume.pdf`; the guest PDF is generated
from that same file. Its Veritone end date was corrected to February 2024 from
the supplied work history. The replacement date uses the openly licensed Carlito
italic font; its license is included in `vm/licenses/CARLITO-OFL.txt`.

The build verifies the vendored program checksums. Program source archives,
recipes, licenses, and provenance remain in `vm/` and are published alongside
the hashed VM assets. Guest networking remains disconnected.
