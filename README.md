# chasefarrant.com

[![Build](https://github.com/farrantch/chasefarrant.com/actions/workflows/build.yaml/badge.svg)](https://github.com/farrantch/chasefarrant.com/actions/workflows/build.yaml)

The source for [chasefarrant.com](https://www.chasefarrant.com), a deliberately small engineering site built with Eleventy and deployed through an infrastructure-as-code pipeline on AWS.

The portfolio can be explored through a real Linux VM running in the browser or through ordinary links. Eleventy generates both views from the same content. Build validation, pipeline updates, infrastructure deployment, artifact sync, and CloudFront invalidation are represented as code.

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
GitHub
  │
  ▼
CodePipeline source
  │
  ├── Update the pipeline's own CloudFormation stack
  ├── Build the Eleventy site in CodeBuild
  ├── Deploy the site infrastructure with CloudFormation
  ├── Sync generated content to S3
  └── Invalidate CloudFront
```

The repository also runs an independent GitHub Actions build on every push, running the same dependency, unit, VM, and browser checks as the release build.

## Engineering choices

- **Static by default.** Eleventy turns Markdown and Nunjucks into files that can be served cheaply and reliably from S3.
- **Infrastructure is reviewable.** DNS, TLS, CDN behavior, storage, IAM, and CI/CD live in CloudFormation rather than a collection of console settings.
- **The pipeline updates itself.** CodePipeline deploys its own template before building and releasing the site, keeping delivery changes versioned with the application.
- **Caching is explicit.** Separate response-header policies allow long-lived caching for static assets while keeping navigational content fresh.
- **Few third-party requests.** Fonts are served locally, and generated assets use cache-busting URLs.

## Repository map

```text
.
├── .github/workflows/       # Push-time build validation
├── aws-cloudformation/      # Runtime AWS infrastructure
├── aws-codebuild/           # Build and post-deploy steps
├── aws-codepipeline/        # Self-updating delivery pipeline
├── site/                    # Eleventy content, layouts, and assets
├── deploy_cf_stack.sh       # Infrastructure bootstrap helper
└── install.sh               # Local setup helper
```

## Run locally

Requires Node.js 22 or newer and npm. Both CI systems use Node.js 22.

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

CodeBuild runs the audit, unit tests, Linux VM tests, full Chromium interaction
tests, and Firefox/WebKit/slow-connection checks before it produces a deployable
artifact. See [the release guide](docs/releasing.md) for deployment and rollback.

## More detail

The accompanying [project write-up](https://www.chasefarrant.com/projects/chasefarrant.com/) covers the Eleventy choices, cache busting, AWS design, fonts, image galleries, and performance work.

## License

Licensed under the [MIT License](./LICENSE.txt).
