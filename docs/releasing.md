# Releasing the portfolio

## GitHub Actions

[Build and deploy](https://github.com/farrantch/www.chasefarrant.com/actions/workflows/build.yaml)
runs on pushes and pull requests. The build audits dependencies, runs unit and
Linux VM tests, builds the site, and checks Chromium, Firefox, WebKit, and a
throttled connection. It uploads the tested site as a GitHub artifact.

On `main`, **Publish to production** downloads that artifact, verifies its checksums
and source revision, applies the website CloudFormation template, and publishes
to S3. It waits for CloudFront invalidation and verifies every public release URL,
MIME type, and cache policy. The run summary records the release ID.

Pull requests and other branches cannot deploy. The `production` environment
allows only the `main` branch. Its AWS role trusts the exact GitHub OIDC subject
for this repository and environment, including the immutable repository IDs.
No AWS access keys are stored in GitHub. Production publishes and restores share
one concurrency group; a running release is never automatically canceled. An
outdated build is rejected before deployment if `main` has already moved.

The same workflow can be run manually on `main` to rebuild and publish its current
commit. A failed deployment stays failed until corrected or rerun.

## AWS setup

The website remains in account `010655802910`, region `us-east-1`, stack
`cf-prod-portfolio`. The separate `cf-prod-portfolio-github` stack defines the
OIDC provider, deployment role, CloudFormation execution role, and private,
encrypted, versioned release archive. Bootstrap or update it with an administrator:

```sh
aws cloudformation deploy \
  --stack-name cf-prod-portfolio-github \
  --template-file aws-github-actions/CloudFormation.yaml \
  --capabilities CAPABILITY_IAM
```

The template is scoped to the existing production resources. Infrastructure
changes that create or replace resources may also require an administrator to
update that role's permissions. The deployment role cannot change its own IAM
permissions or manage the delivery stack.

Set these GitHub **production environment variables** from the stack outputs:

| Variable | Stack output |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | `DeployRoleArn` |
| `CLOUDFORMATION_ROLE_ARN` | `CloudFormationRoleArn` |
| `RELEASE_ARCHIVE_BUCKET` | `ReleaseArchiveBucket` |

Set the environment's deployment branch policy to custom branches, with a single
`main` branch rule and no tag rules. Confirm the repository's OIDC subject using
`gh api repos/farrantch/www.chasefarrant.com/actions/oidc/customization/sub` before
changing the trust policy. Retain the OIDC provider if another repository uses it.

## Upload and recovery

`scripts/deploy.cjs`:

1. Verifies every file against the release manifest.
2. Before the first manifest-based release, saves the existing public site under
   `releases/legacy-<new-release-id>/site/` in the private archive.
3. Archives the tested output under `releases/<release-id>/site/`.
4. Uploads assets, secondary pages, then the homepage.
5. Publishes `release.json`, invalidates CloudFront, and checks public URLs.

An archive or asset failure stops the release before any HTML is published.
Uploads retain old assets so existing tabs can still load their original VM.
An interruption during HTML uploads can leave mixed page versions; restore the
last successful release if that happens. S3 archives have no automatic expiry;
GitHub build artifacts expire after 14 days.

To roll back, open **Actions → Restore production release → Run workflow**, choose
`main`, and enter the previous release ID. The workflow restores the archived
files and verifies the public site. It does not rebuild old source or change
infrastructure. Review infrastructure reversions separately.

With an authenticated local AWS profile, preview a restore without publishing:

```sh
node scripts/deploy.cjs --stack cf-prod-portfolio \
  --archive-bucket YOUR_RELEASE_ARCHIVE_BUCKET \
  --from-release PREVIOUS_RELEASE_ID
```

Add `--execute` to publish. The first backup uses the `legacy-...` ID above.
Archive and OIDC resources have retention policies so deleting the delivery stack
does not remove release history or an identity provider shared by other projects.

## Retiring the old AWS pipeline

The migration replaces `cf-prod-portfolio-pipeline` with GitHub Actions. During
cutover, disable the legacy source trigger, deploy and verify through GitHub,
then remove the old stack. The website stack must use the new CloudFormation
role before deleting the old deployment role. Retain the old artifact bucket
`cf-prod-portfolio-pipeline-s3bucketpipeline-1wdc57qkbedez` and both CodeBuild log
groups; they contain historical data. The retired stack's CodePipeline,
CodeBuild projects, connection, and IAM roles are no longer needed.

## Local checks

Use Node.js 22 (`nvm use` reads `.nvmrc`):

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

The final command validates the artifact without writing to AWS. Build after any
source changes: `npm run build` clears generated `site/_site`, checks local links,
and writes `release.json`. Development-server output is not a release artifact.

## Cache behavior and hosted checks

Terminal code, CSS, emulator files, and the guest image share a content-derived
`/vm/<hash>/` directory. These assets, generated images, and versioned fonts use
`public, max-age=31536000, immutable`. HTML, the VM manifest, résumé, and other
fixed URLs use `no-cache, max-age=0, must-revalidate`. Uploads explicitly set MIME
types, including JavaScript modules, WebAssembly, and PDF. Résumé links include a
content hash to bypass copies cached under the former one-year policy. A browser
with an old homepage still cached may need one hard refresh.

```sh
npm run check:hosted -- https://www.chasefarrant.com EXPECTED_RELEASE_ID
```

Both website buckets retain their existing public-read ACLs and ObjectWriter
behavior. Moving to private S3 origins is a separate infrastructure change.
Playwright WebKit covers Safari's engine; keyboard, scrolling, résumé download,
and reboot on a physical phone remain useful manual checks.

## Content and bundled programs

`site/ChaseFarrant-Resume.pdf` also supplies the guest PDF. Its Veritone end date
was corrected to February 2024 from the supplied work history, using the openly
licensed Carlito italic font (`vm/licenses/CARLITO-OFL.txt`).

The build verifies vendored program checksums. Source archives, recipes, licenses,
and provenance remain in `vm/` and are published with the hashed VM assets.
Guest networking remains disconnected.
