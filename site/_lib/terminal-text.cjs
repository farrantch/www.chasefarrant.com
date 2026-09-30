const MarkdownIt = require('markdown-it');
const markdown = new MarkdownIt({ html: true });
const WIDTH = 72;

function wrap(text, prefix = '', continuation = prefix) {
  if (text.trim().includes('\n')) return text.trim().split('\n')
    .map((line, index) => wrap(line, index === 0 ? prefix : continuation, continuation)).join('\n');
  const lines = [];
  let line = prefix;
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const space = line === prefix || line === continuation ? '' : ' ';
    if (line.length + space.length + word.length > WIDTH && space) {
      lines.push(line);
      line = continuation + word;
    } else line += space + word;
  }
  if (line.trim()) lines.push(line);
  return lines.join('\n');
}

// Parse Markdown before removing markup so code samples retain HTML, template
// expressions, indentation, and shell operators. Prose wraps; code stays exact.
function terminalText(source, pageURL = '/') {
  const references = [];
  function reference(href) {
    const url = new URL(href, `https://chasefarrant.com${pageURL}`).href;
    let index = references.indexOf(url);
    if (index < 0) index = references.push(url) - 1;
    return ` [${index + 1}]`;
  }
  function inline(tokens) {
    const links = [];
    return tokens.map(token => {
      if (token.type === 'text' || token.type === 'code_inline') return token.content;
      if (token.type === 'softbreak') return ' ';
      if (token.type === 'hardbreak') return '\n';
      if (token.type === 'link_open') links.push(token.attrGet('href'));
      if (token.type === 'link_close') return reference(links.pop());
      if (token.type === 'html_inline') {
        const href = token.content.match(/^<a\b[^>]*\bhref=["']([^"']+)["']/i);
        if (href) links.push(href[1]);
        else if (/^<\/a>/i.test(token.content) && links.length) return reference(links.pop());
        else if (/^<br\b/i.test(token.content)) return '\n';
      }
      return '';
    }).join('').trim();
  }
  const blocks = [];
  function append(text, list = false) {
    if (list && blocks.at(-1)?.list) blocks.at(-1).text += '\n' + text;
    else blocks.push({ text, list });
  }
  const lists = [];
  const items = [];
  let heading = 0;
  let quoteDepth = 0;
  function paragraph(text) {
    if (!text.trim()) return;
    const quote = '> '.repeat(quoteDepth);
    const item = items.at(-1);
    const indent = '  '.repeat(Math.max(0, items.length - 1));
    const prefix = quote + indent + (item ? (item.started ? ' '.repeat(item.marker.length) : item.marker) : '');
    const continuation = quote + indent + (item ? ' '.repeat(item.marker.length) : '');
    append(wrap(text, prefix, continuation), Boolean(item && !item.started));
    if (item) item.started = true;
  }
  for (const token of markdown.parse(source, {})) {
    if (token.type === 'heading_open') heading = Number(token.tag.slice(1));
    else if (token.type === 'heading_close') heading = 0;
    else if (token.type === 'blockquote_open') quoteDepth++;
    else if (token.type === 'blockquote_close') quoteDepth--;
    else if (token.type === 'bullet_list_open') lists.push({ ordered: false });
    else if (token.type === 'ordered_list_open') lists.push({ ordered: true, next: Number(token.attrGet('start') || 1) });
    else if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') {
      lists.pop();
      if (blocks.length) blocks.at(-1).list = false;
    }
    else if (token.type === 'list_item_open') {
      const list = lists.at(-1);
      items.push({ marker: list.ordered ? `${list.next++}. ` : '- ', started: false });
    } else if (token.type === 'list_item_close') items.pop();
    else if (token.type === 'inline') {
      const text = inline(token.children);
      if (heading && text) append(wrap(text) + '\n' + (heading === 1 ? '=' : '-').repeat(Math.min(text.length, WIDTH)));
      else paragraph(text);
    } else if (token.type === 'fence' || token.type === 'code_block') {
      append(token.content.trimEnd().split('\n').map(line => '    ' + line).join('\n'));
    } else if (token.type === 'html_block') {
      const html = token.content.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
      paragraph(inline(markdown.parseInline(html, {})[0].children));
    } else if (token.type === 'hr') append('-'.repeat(32));
  }
  if (references.length) append('Links\n-----\n' + references.map((url, i) => `[${i + 1}] ${url}`).join('\n'));
  return blocks.map(block => block.text).filter(Boolean).join('\n\n').trim() + '\n';
}

module.exports = { terminalText, wrap };
