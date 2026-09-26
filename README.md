# chasefarrant.com

[![Build](https://github.com/farrantch/chasefarrant.com/actions/workflows/build.yaml/badge.svg)](https://github.com/farrantch/chasefarrant.com/actions/workflows/build.yaml)

The source for [chasefarrant.com](https://www.chasefarrant.com), a deliberately small engineering site built with Eleventy and deployed through an infrastructure-as-code pipeline on AWS.

The interesting part of this repository is not the front end. It is the complete path from a Markdown change to globally cached production content: build validation, pipeline self-update, infrastructure deployment, artifact sync, and CloudFront invalidation are all represented as code.

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

The repository also runs an independent GitHub Actions build on every push, providing a fast check that the static site compiles.

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

Requires Node.js and npm.

```bash
npm ci
cd site
npx eleventy --serve
```

The production build writes generated content to `site/_site`:

```bash
cd site
npx eleventy
```

## More detail

The accompanying [project write-up](https://www.chasefarrant.com/projects/chasefarrant.com/) covers the Eleventy choices, cache busting, AWS design, fonts, image galleries, and performance work.

## License

Licensed under the [MIT License](./LICENSE.txt).
