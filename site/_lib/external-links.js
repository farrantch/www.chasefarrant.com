// Apply the link policy to generated HTML, including pages used without JS.
module.exports = function externalLinks(html) {
  return html.replace(/<a\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, (tag) => {
    const href = tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (!href) return tag;
    let url;
    try { url = new URL(href[1] ?? href[2] ?? href[3], 'https://www.chasefarrant.com'); }
    catch { return tag; }
    const external = ['https:', 'http:'].includes(url.protocol) && url.hostname.replace(/^www\./, '') !== 'chasefarrant.com';
    if (!external && url.protocol !== 'mailto:') return tag;
    const rel = tag.match(/\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const values = new Set(((rel && (rel[1] ?? rel[2] ?? rel[3])) || '').split(/\s+/).filter(Boolean));
    values.add('noopener');
    values.add('noreferrer');
    return tag.replace(/\s+(?:target|rel)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/>$/, ' target="_blank" rel="' + [...values].join(' ') + '">');
  });
};
