# www.chasefarrant.com

[![Build and deploy](https://github.com/farrantch/www.chasefarrant.com/actions/workflows/build.yaml/badge.svg)](https://github.com/farrantch/www.chasefarrant.com/actions/workflows/build.yaml)

The source for [www.chasefarrant.com](https://www.chasefarrant.com), a deliberately small engineering site built with Eleventy and deployed to AWS by GitHub Actions.

The portfolio can be explored through a real Linux VM running in the browser or through ordinary links. Eleventy generates both views from the same content. Build validation, infrastructure deployment, artifact uploads, and CloudFront invalidation are represented as code.

## Architecture

```text
┌──────────┐       ┌───────────┐       ┌────────────┐
│ Route 53 │──────▶│ CloudFront│──────▶│ S3 website │
└──────────┘       └─────┬─────┘       └────────────┘
      ▲                   │
      │             Cache policies
┌─────┴─────┐
│ ACM (TLS) │       Root redirect bucket
└───────────┘       is defined alongside the site.
```

The main CloudFormation stack owns the Route 53 zone and records, ACM certificates, CloudFront distributions and cache policies, S3 website buckets, bucket policies, and supporting resources.

## Delivery path

```text
Push or pull request
  └── GitHub Actions: audit, unit tests, Linux VM tests, browser tests
        └── Save the tested site artifact
              └── main only: Publish to production
                    ├── Authenticate to AWS with OIDC
                    ├── Update website CloudFormation stack
                    ├── Archive and upload the tested site
                    └── Invalidate CloudFront and verify public URLs
```

The production job uses the protected `production` environment and temporary AWS
credentials. Deployment and rollback share a concurrency group so they cannot
write to the website at the same time.

## Engineering choices

- **Static by default.** Eleventy turns Markdown and Nunjucks into files that can be served cheaply and reliably from S3.
- **Infrastructure is reviewable.** DNS, TLS, CDN behavior, storage, IAM, and CI/CD live in CloudFormation rather than a collection of console settings.
- **Test once, publish the artifact.** Production downloads the output from the successful build. It verifies checksums and the source revision before using AWS credentials.
- **Caching is explicit.** Separate response-header policies allow long-lived caching for static assets while keeping navigational content fresh.
- **Few third-party requests.** Fonts are served locally, and generated assets use cache-busting URLs.

## Repository map

```text
.
├── .github/workflows/       # Validation, production deployment, and rollback
├── aws-cloudformation/      # Runtime AWS infrastructure
├── aws-github-actions/      # AWS OIDC roles and private release archive
├── site/                    # Eleventy content, layouts, and assets
├── deploy_cf_stack.sh       # Infrastructure bootstrap helper
└── install.sh               # Local setup helper
```

## Run locally

Requires Node.js 22 or newer and npm. GitHub Actions uses Node.js 22.

```bash
npm ci
cd site
npx eleventy --serve
```

The production build writes generated content to `site/_site`:

```bash
npm run build
```

## Browser Linux portfolio

The home page offers a real Linux terminal and a click-through Browse view.
v86 runs a local Linux VM; xterm.js connects to its serial console. Real Linux
processes handle navigation, pipes, redirects, editing, scripts, and signals.
The old JavaScript command simulator has been removed.

The terminal starts automatically as `guest`, with download and boot progress
shown in the terminal area. A single navbar switches between Terminal and Browse.
Visitors arrive in `/home/guest`, with directories for `projects`,
`about`, `career`, `contact`, `notes`, and `documents`. Each career directory contains `role.txt`, `work.txt`, and `tools.txt`;
project and note summaries point to full articles and browser links. `help`,
`help keys`, and `help session` cover terminal use. Sessions are
writable and temporary; restarting restores the image. Guest networking is
currently disconnected. The full portfolio is also available without JavaScript.

```sh
npm run build
npm run dev
npm test
npm run test:vm
npx playwright install chromium firefox webkit
npm run test:browser
npm run test:browsers
```

See [the VM guide](vm/README.md) for adding tools, changing the image, customizing
fonts and system behavior, source information, and the security boundaries.

## Release

`npm run build` starts with fresh generated output, checks local page and asset
links, and writes `site/_site/release.json` with checksums for every release file.
The browser test commands start their own local server unless `TERMINAL_URL`
is provided. The preview serves the same content types and cache policies as
the deployment uploader.

GitHub Actions runs the audit, unit tests, Linux VM tests, full Chromium interaction
tests, and Firefox/WebKit/slow-connection checks before it produces a deployable
artifact. See [the release guide](docs/releasing.md) for deployment and rollback.

## More detail

The accompanying [project write-up](https://www.chasefarrant.com/projects/chasefarrant.com/) covers the Eleventy choices, cache busting, AWS design, fonts, image galleries, and performance work.

## License

Licensed under the [MIT License](./LICENSE.txt).
