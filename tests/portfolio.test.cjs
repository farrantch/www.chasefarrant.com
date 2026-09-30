const test = require('node:test');
const assert = require('node:assert/strict');
const portfolio = require('../site/_lib/portfolio.cjs');
const { terminalText } = require('../site/_lib/terminal-text.cjs');

test('portfolio text is readable and every suggested home path exists', () => {
  const content = portfolio();
  const files = new Map(content.files.map(file => [file.path, file]));
  for (const file of content.files) {
    assert.equal(file.uid, file.path.startsWith('home/guest/') ? 1000 : 0);
    if (!file.path.endsWith('.txt') || file.path.endsWith('/article.txt')) continue;
    for (const [reference] of file.text.matchAll(/~\/[\w/.'">-]+/g)) {
      const target = 'home/guest/' + reference.slice(2).replace(/['"]/g, '');
      const directory = target.endsWith('/') ? target : target + '/';
      assert(files.has(target) || [...files.keys()].some(name => name.startsWith(directory)), `${file.path}: ${reference}`);
    }
    for (const line of file.text.split('\n')) assert(line.length <= 72, `${file.path}: ${line}`);
  }
  assert.equal(files.get('home/guest/contact/resume.url').text.trim(), content.resumeURL);
  assert(!files.has('home/guest/career/resume.url'));
  assert(!files.has('home/guest/documents/resume.url'));
  assert(!files.has('home/guest/readme.txt'));
  assert(files.has('home/guest/career/overview.txt'));
  assert(!files.has('home/guest/career/readme.txt'));
  assert(!content.files.some(file => file.path.startsWith('home/guest/employment/')));
  assert(!files.has('home/guest/about.txt'));
  assert(!files.has('home/guest/projects/index.txt'));
  assert(!files.has('home/guest/notes/index.txt'));
});

test('the curated portfolio excludes duplicate and unfinished drafts', () => {
  const content = portfolio();
  assert.equal(new Set(content.projects.map(project => project.slug)).size, content.projects.length);
  assert.equal(content.projects.filter(project => project.slug === 'basement').length, 1);
  for (const slug of ['renovating-our-deck', 'knex-rc-car', '10gbe-home-networking-on-a-budget']) {
    assert(!content.projects.some(project => project.slug === slug));
  }
  assert(!content.notes.some(note => /s3ql|stop-using-microservices/.test(note.source)));
  for (const project of content.projects) {
    assert(project.description && project.highlights.length && project.slug);
  }
  for (const note of content.notes) {
    assert(content.files.some(file => file.path === `home/guest/notes/${note.slug}/article.txt`));
    assert(content.files.some(file => file.path === `home/guest/notes/${note.slug}/page.url` && file.text.trim() === note.url));
  }
});

test('terminal articles preserve code and convert prose links and markup to readable text', () => {
  const source = `# A readable title

A **bold** idea with [details](./details/) and <a href="https://example.com">a link</a>.

- First item.
- Second item with some longer text that wraps underneath its bullet instead of losing the list indentation.

<!-- This stays out of the article. -->

\`\`\`html
<link href="{{ '/css/styles.css' | url }}" rel="stylesheet" />
<script>if (a < b && b > 0) run();</script>
\`\`\`
`;
  const result = terminalText(source, '/projects/example/');
  assert.match(result, /^A readable title\n=+/);
  assert.match(result, /A bold idea with details \[1\] and a link \[2\]/);
  assert.match(result, /\[1\] https:\/\/chasefarrant.com\/projects\/example\/details\//);
  assert.match(result, /\[2\] https:\/\/example.com\//);
  assert.match(result, /- First item\.\n- Second item/);
  assert.match(result, /\n  (?:\w+ )+/);
  assert(result.includes('    <link href="{{ \'/css/styles.css\' | url }}" rel="stylesheet" />'));
  assert(result.includes('    <script>if (a < b && b > 0) run();</script>'));
  assert(!result.includes('This stays out'));
});

test('explicit line breaks keep résumé entries and other short records together', () => {
  const text = terminalText('Role and company  \nDates  \nSummary');
  assert.equal(text, 'Role and company\nDates\nSummary\n');
});
