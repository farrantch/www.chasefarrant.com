const test = require('node:test');
const assert = require('node:assert/strict');
const externalLinks = require('../site/_lib/external-links');
test('external links get a new tab while existing rel values survive', () => {
  const html = externalLinks('<a href="https://github.com/farrantch" rel="me" target="_self">GitHub</a>');
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="me noopener noreferrer"/);
  assert.equal((html.match(/target=/g)||[]).length, 1);
  assert.equal(externalLinks(html), html);
});
test('internal and fragment links preserve normal navigation', () => {
  for(const href of ['/', '/projects/', '#main', 'https://chasefarrant.com/about/', 'https://www.chasefarrant.com/']) {
    const html = '<a href="'+href+'">link</a>';assert.equal(externalLinks(html),html);
  }
});
test('quoted attributes, protocol-relative URLs, and email links are handled', () => {
  assert.match(externalLinks("<a title='go > here' href='//example.com'>test</a>"), /target="_blank"/);
  assert.match(externalLinks('<a href=mailto:hello@chasefarrant.com>email</a>'), /target="_blank"/);
});
