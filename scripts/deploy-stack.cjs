// Apply the infrastructure from the same checkout as the tested release.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const config = JSON.parse(require('node:fs').readFileSync(path.join(__dirname, '../aws-cloudformation/envs/prod.template'), 'utf8'));
if (!process.env.SITE_STACK || !process.env.STACK_ROLE) throw new Error('SITE_STACK and STACK_ROLE are required');
execFileSync('aws', ['cloudformation', 'deploy',
  '--stack-name', process.env.SITE_STACK,
  '--template-file', path.join(__dirname, '../aws-cloudformation/CloudFormation.yaml'),
  '--role-arn', process.env.STACK_ROLE,
  '--parameter-overrides', ...Object.entries(config.Parameters).map(([key, value]) => `${key}=${value}`),
  '--tags', ...Object.entries(config.Tags).map(([key, value]) => `${key}=${value}`),
  '--no-fail-on-empty-changeset', '--no-cli-pager'], { stdio: 'inherit' });
