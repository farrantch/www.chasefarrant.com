const test = require('node:test');
const assert = require('node:assert/strict');
const { archive, readOverlay } = require('../scripts/cpio.cjs');
const portfolio = require('../site/_lib/portfolio.cjs');
const path = require('node:path');
const { readFileSync } = require('node:fs');

function unpack(buffer) {
  const files = new Map();
  let offset = 0;
  while (offset < buffer.length) {
    assert.equal(buffer.toString('ascii', offset, offset + 6), '070701');
    const field = index => parseInt(buffer.toString('ascii', offset + 6 + index * 8, offset + 14 + index * 8), 16);
    const mode = field(1), uid = field(2), size = field(6), nameSize = field(11);
    const name = buffer.toString('utf8', offset + 110, offset + 110 + nameSize - 1);
    offset = Math.ceil((offset + 110 + nameSize) / 4) * 4;
    const data = buffer.subarray(offset, offset + size);
    offset = Math.ceil((offset + size) / 4) * 4;
    if (name === 'TRAILER!!!') break;
    files.set(name, { mode, uid, data });
  }
  return files;
}

test('initramfs preserves binary files, Unix modes, ownership, and directory structure', () => {
  const input = [
    { path: 'home/guest/notes/hello.txt', text: 'café\n', uid: 1000, gid: 1000 },
    { path: 'usr/local/bin/tool', mode: 0o100755, data: Buffer.from([0, 1, 2, 255]) }
  ];
  const bytes = archive(input);
  assert.deepEqual(bytes, archive(input));
  const files = unpack(bytes);
  assert.equal(files.get('home/guest/notes').mode, 0o40755);
  assert.equal(files.get('home/guest').uid, 1000);
  assert.equal(files.get('home/guest/notes/hello.txt').data.toString(), 'café\n');
  assert.equal(files.get('usr/local/bin/tool').mode, 0o100755);
  assert.deepEqual(files.get('usr/local/bin/tool').data, Buffer.from([0, 1, 2, 255]));
});

test('initramfs rejects paths that escape the guest and accidental file collisions', () => {
  for (const name of ['/etc/passwd', '../secret', 'home/../etc/passwd', 'home//guest', 'home/./guest', 'home/guest\0bad']) assert.throws(() => archive([{ path: name }]));
  assert.throws(() => archive([{ path: 'a', text: 'one' }, { path: 'a', text: 'two' }]));
  assert.throws(() => archive([{ path: 'a', text: 'one' }, { path: 'a/b', text: 'two' }]));
  assert.throws(() => archive([{ path: 'a/b', text: 'one' }, { path: 'a', text: 'two' }]));
});

test('every catalog project and article has a real guest directory; helpers are executable', () => {
  const content = portfolio();
  const files = unpack(archive([...readOverlay(path.resolve(__dirname, '../vm/overlay')), ...content.files]));
  for (const project of content.projects) {
    assert(files.has(`home/guest/projects/${project.slug}/readme.txt`));
    if (project.url) assert.equal(files.get(`home/guest/projects/${project.slug}/page.url`).data.toString().trim(), project.url);
  }
  for (const name of ['about', 'contact']) assert(files.has(`home/guest/${name}/readme.txt`));
  const resume = files.get('home/guest/documents/ChaseFarrant-Resume.pdf');
  assert.equal(resume.uid, 1000);
  assert.equal(resume.mode, 0o100644);
  assert.deepEqual(resume.data, readFileSync(path.resolve(__dirname, '../site/ChaseFarrant-Resume.pdf')));
  assert.equal(resume.data.subarray(0, 5).toString(), '%PDF-');
  for (const role of content.career.roles) {
    const directory = `home/guest/career/${role.directory}`;
    assert.equal(files.get(directory).mode, 0o40755);
    assert(!files.has(`${directory}.txt`), 'old combined files are replaced by employer directories');
    assert.deepEqual([...files.keys()].filter(name => name.startsWith(directory + '/'))
      .map(name => name.slice(directory.length + 1)).sort(), ['role.txt', 'tools.txt', 'work.txt']);
    const read = name => files.get(`${directory}/${name}`).data.toString().replace(/\s+/g, ' ');
    const roleText = read('role.txt');
    for (const detail of [role.company, role.title, role.dates, role.location, role.summary, role.history].filter(Boolean)) {
      assert(roleText.includes(detail), `${role.slug}: ${detail}`);
    }
    const workText = read('work.txt');
    for (const section of role.sections) {
      assert(workText.includes(section.heading));
      if (section.dates) assert(workText.includes(section.dates));
      for (const item of section.items) assert(workText.includes(item), `${role.slug}: ${item}`);
    }
    for (const tool of role.tools) assert(read('tools.txt').includes(tool), `${role.slug}: ${tool}`);
  }
  for (const name of ['open', 'welcome', 'help', 'guest-login', 'reboot', 'games']) assert.equal(files.get(`usr/local/bin/${name}`).mode, 0o100755);
});

test('the browser bridge only accepts bounded, explicitly supported actions and URLs', async () => {
  const { bridgeMessage, safeLink } = await import('../site/js/vm-bridge.mjs');
  const origin = 'https://chasefarrant.com';
  for (const value of ['javascript:alert(1)', 'data:text/html,test', '//evil.test', '/\\evil.test', 'file:///etc/passwd', 'https://user:pass@evil.test', 'https://example.com/\n', 'mailto:x@example.com%0d%0aBcc:a@b.com']) assert.equal(safeLink(value, origin), null, value);
  assert.equal(safeLink('/ChaseFarrant-Resume.pdf', origin), origin + '/ChaseFarrant-Resume.pdf');
  assert.equal(safeLink('https://github.com/farrantch', origin), 'https://github.com/farrantch');
  assert.equal(safeLink('mailto:hello@chasefarrant.com', origin), 'mailto:hello@chasefarrant.com');
  assert.deepEqual(bridgeMessage('reboot', origin), { type: 'reboot' });
  for (const value of ['font=vga', 'font=__proto__', 'font=constructor', 'eval=alert(1)', 'reboot=anything', 'reboot;anything', 'reboot\n', 'open=!!!', 'x'.repeat(5000)]) assert.equal(bridgeMessage(value, origin), null);
  assert.equal(bridgeMessage('open=' + btoa('javascript:alert(1)'), origin), null);
  assert.deepEqual(bridgeMessage('open=' + btoa('/about/'), origin), { type: 'link', value: origin + '/about/' });
});
