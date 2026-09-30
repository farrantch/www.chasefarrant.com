// npm run build && npm run dev (or serve site/_site), then npm run test:browser.
// TERMINAL_URL defaults to http://127.0.0.1:8080.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const portfolio = require('../site/_lib/portfolio.cjs')();
const expectedProjectCount = portfolio.projects.length;
const expectedPDF = readFileSync(path.join(__dirname, '../site/ChaseFarrant-Resume.pdf'));
const resumeURL = portfolio.resumeURL;
const url = process.env.TERMINAL_URL || 'http://127.0.0.1:8080';
const waitTextInBoot = (page, text) => page.waitForFunction(text => document.querySelector('#boot-log').textContent.includes(text), text);
const waitReady = page => page.waitForFunction(() => document.querySelector('#vm-status').textContent.includes('connected'), null, { timeout: 95000 });
async function observeBoot(page) {
  await page.addInitScript(() => {
    // Record browser-local state and rendered frames. Screenshots and remote
    // Playwright calls can consume a whole login pause on a busy CI runner.
    window.__bootHistory = [];
    new MutationObserver(() => {
      const screen = document.querySelector('#boot-screen');
      if (!screen) return;
      const state = screen.dataset.state;
      let current = window.__bootHistory.at(-1);
      if (current?.state !== state) {
        current = { state, at: performance.now(), frames: [] };
        window.__bootHistory.push(current);
      }
      if (!['art', 'welcome', 'ready', 'off'].includes(state)) return;
      const text = document.querySelector('.xterm-rows')?.textContent || '';
      const matches = state === 'art' ? text.includes('::') && !text.includes('Heyo')
        : state === 'welcome' ? /Heyo[\s\S]*Start with ls or help\./.test(text)
        : state === 'ready' ? text.includes('guest@chasefarrant.com:~$') : true;
      if (matches && !current.frames.length) current.frames.push({
        text, cursor: Boolean(document.querySelector('.xterm-cursor')),
        busy: document.querySelector('#terminal-view').getAttribute('aria-busy'),
        hidden: screen.hidden, log: document.querySelector('#boot-log').textContent,
      });
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  });
}
async function waitForLogin(page, checkInput = false) {
  if (checkInput) {
    await page.waitForFunction(() => document.querySelector('#boot-screen').dataset.state === 'art', null, { timeout: 95000 });
    await page.locator('.xterm-helper-textarea').focus();
    await page.keyboard.type('x');
    await page.keyboard.press('Enter');
  }
  await waitReady(page);
  await waitPrompt(page);
  const history = await page.evaluate(() => window.__bootHistory);
  const ready = history.findLastIndex(entry => entry.state === 'ready');
  const [art, welcome, prompt] = history.slice(ready - 2, ready + 1);
  assert.deepEqual([art.state, welcome.state, prompt.state], ['art', 'welcome', 'ready']);
  assert(welcome.at - art.at >= 350, 'ASCII art gets a short pause before the welcome paragraph');
  assert(prompt.at - welcome.at >= 750, 'the welcome paragraph gets a pause before the prompt');
  for (const stage of [art, welcome]) {
    assert(stage.frames.length, `${stage.state} was rendered before the next stage`);
    assert.equal(stage.frames[0].hidden, true);
    assert.equal(stage.frames[0].busy, 'true');
    assert.equal(stage.frames[0].cursor, false);
    assert.doesNotMatch(stage.frames[0].text, /guest@chasefarrant\.com:~\$/);
  }
  assert.doesNotMatch(art.frames[0].text, /Heyo|Start with ls or help\./);
  assert.match(welcome.frames[0].text, /Heyo[\s\S]*Start with ls or help\./);
  assert.doesNotMatch(await page.locator('.xterm-rows').innerText(), /x: (not found|command not found)/);
}
async function waitPrompt(page) {
  try { await page.waitForFunction(() => document.querySelector('.xterm-rows')?.innerText.trimEnd().endsWith('guest@chasefarrant.com:~$'), null, { timeout: 15000 }); }
  catch (error) { console.error('Waiting for shell:', await page.locator('.xterm-rows').innerText()); throw error; }
}
const waitText = (page, text) => page.waitForFunction(text => document.querySelector('.xterm-rows')?.textContent.includes(text), text, { timeout: 15000 });
async function command(page, text, expected) {
  await page.locator('.xterm-helper-textarea').focus();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  if (expected) {
    try { await waitText(page, expected); }
    catch (error) { console.error('Terminal contents:', await page.locator('.xterm-rows').innerText()); await page.screenshot({ path: '/tmp/chase-vm-failure.png' }); throw error; }
  }
}


async function clickTerminalLink(page, label) {
  const row = page.locator('.xterm-rows > div').filter({ hasText: label }).last();
  const point = await row.evaluate((row, label) => {
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    for (let node; (node = walker.nextNode());) {
      const index = node.textContent.indexOf(label);
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + label.length);
      const box = range.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }
    throw new Error(`Link text not found: ${label}`);
  }, label);
  await page.mouse.move(point.x, point.y);
  await page.locator('.xterm-cursor-pointer').waitFor();
  await page.mouse.click(point.x, point.y);
}
async function expectTerminalTab(page, label, target) {
  const tabPromise = page.context().waitForEvent('page');
  await clickTerminalLink(page, label);
  const tab = await tabPromise;
  await tab.waitForLoadState('domcontentloaded');
  assert.equal(tab.url(), target);
  assert.equal(await tab.evaluate(() => window.opener), null);
  assert.equal(await tab.evaluate(() => document.referrer), '');
  await tab.close();
  await page.bringToFront();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await require('./startup.browser.cjs')(browser, url, { width: 1280, height: 900 });
    console.log('Startup checks passed: first paint, reload, section links, blocked modules, and no-JS browsing.');
    const errors = [];
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    let releaseImage;
    const imageGate = new Promise(resolve => { releaseImage = resolve; });
    await page.route('**/buildroot-bzimage68.bin', async route => { await imageGate; await route.continue(); });
    await observeBoot(page);
    await page.goto(url);
    await page.locator('#boot-screen').waitFor({ state: 'visible' });
    await waitTextInBoot(page, 'Reading files');
    assert(requests.some(url => url.endsWith('buildroot-bzimage68.bin')), 'VM starts automatically');
    assert.equal(await page.locator('.boot-line').count(), 2);
    assert.equal(await page.locator('.boot-marker.is-done').count(), 1);
    assert.equal(await page.locator('#boot-meter, #boot-progress, #boot-elapsed, [role="progressbar"]').count(), 0);
    const pendingLog = await page.locator('#boot-log').textContent();
    await page.waitForTimeout(360);
    assert.equal(await page.locator('#boot-log').textContent(), pendingLog);
    assert.doesNotMatch(await page.locator('#boot-log').textContent(), /Files loaded|Signing in/);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('#boot-log').textContent.includes('[ .. ] Reading files'));
    assert.equal(await page.locator('.boot-cursor').evaluate(element => getComputedStyle(element).animationName), 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const faviconURL = await page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute('href');
    assert.match(faviconURL, /^\/favicon\.svg\?v=[a-f0-9]+$/);
    const favicon = await page.request.get(url + faviconURL);
    assert.equal(favicon.status(), 200);
    assert.match(await favicon.text(), /<title>cf&gt;<\/title>/);

    assert.equal(await page.locator('#start-vm, #restart-vm, .session-bar, .terminal-toolbar, .terminal-footer').count(), 0);
    assert.equal(await page.locator('.site-credit a').getAttribute('href'), 'https://wiredby.design/');
    await page.screenshot({ path: '/tmp/chase-vm-boot.png' });
    await page.locator('[data-view="browse"]').click();
    assert(await page.locator('#portfolio').isVisible());
    assert.equal(await page.locator('#projects .project').count(), expectedProjectCount);
    const career = require('../site/_data/career.json');
    assert.equal(await page.locator('#career .role').count(), career.roles.length);
    for (const role of career.roles) {
      const article = page.locator('#career .role').filter({ has: page.locator('h3', { hasText: role.company }) });
      const text = (await article.textContent()).replace(/\s+/g, ' ');
      assert(text.includes(role.dates));
      if (role.history) assert(text.includes(role.history));
      for (const section of role.sections) {
        assert(text.includes(section.heading));
        if (section.dates) assert(text.includes(section.dates));
        for (const item of section.items) assert(text.includes(item), `${role.slug}: ${item}`);
      }
    }
    await page.screenshot({ path: '/tmp/chase-vm-browse.png' });
    await page.locator('[data-view="terminal"]').click();
    releaseImage();
    await page.locator('.boot-line[data-kind="easter-egg"]').waitFor();
    await waitForLogin(page, true);
    const greeting = await page.locator('.xterm-rows').innerText();
    assert.match(greeting, /Start with ls or help\./);
    const firstEgg = await page.locator('.boot-line[data-kind="easter-egg"]').textContent();
    assert.doesNotMatch(greeting, /projects\/|about\/|career\/|contact\/|notes\//);
    assert.equal(await page.locator('#boot-screen').isVisible(), false);
    assert.equal(await page.evaluate(() => {
      const header = document.querySelector('.topbar').getBoundingClientRect();
      const terminal = document.querySelector('#terminal-view').getBoundingClientRect();
      return header.height === 60 && terminal.top === header.bottom && terminal.bottom === innerHeight;
    }), true);
    await command(page, 'stty -echo');
    for (const shortcut of ['Control+v', 'Control+Shift+v']) {
      const marker = `PASTED_${shortcut.replace(/[^a-z]/gi, '')}`;
      await page.evaluate(value => navigator.clipboard.writeText(value), `printf '${marker}\\n'`);
      await page.locator('.xterm-helper-textarea').focus();
      await page.keyboard.press(shortcut);
      await page.keyboard.press('Enter');
      await waitText(page, marker);
    }
    await command(page, "clear; printf 'COPY_CLIPBOARD_TEST\\n'", 'COPY_CLIPBOARD_TEST');
    const copyLine = page.locator('.xterm-rows > div').filter({ hasText: /^COPY_CLIPBOARD_TEST/ });
    const selectionBox = await copyLine.locator('span').first().boundingBox();
    await page.mouse.move(selectionBox.x + 1, selectionBox.y + selectionBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(selectionBox.x + selectionBox.width, selectionBox.y + selectionBox.height / 2, { steps: 10 });
    await page.mouse.up();
    for (const shortcut of ['Control+Shift+c', 'Control+c']) {
      await page.evaluate(() => navigator.clipboard.writeText('BEFORE_COPY'));
      await page.keyboard.press(shortcut);
      await page.waitForFunction(async () => await navigator.clipboard.readText() === 'COPY_CLIPBOARD_TEST');
    }
    await command(page, 'cat > /tmp/pasted.txt');
    await page.evaluate(() => navigator.clipboard.writeText('first line\nsecond line\n'));
    await page.keyboard.press('Control+v');
    await page.keyboard.press('Control+d');
    await waitPrompt(page);
    await command(page, "test \"$(wc -l < /tmp/pasted.txt)\" -eq 2 && echo MULTILINE_PASTE_OK", 'MULTILINE_PASTE_OK');
    await command(page, 'uname -s; id; pwd', '/home/guest');
    assert.match(await page.locator('.xterm-rows').innerText(), /uid=1000\(guest\)/);
    await command(page, "printf 'pear\\napple\\npear\\n' | sort | uniq -c", '2 pear');
    await command(page, 'cat projects/www.chasefarrant.com/readme.txt', 'v86');
    // Wait for the final help entry before continuing.
    await command(page, 'clear; help', 'Command options');
    await waitPrompt(page);
    await page.screenshot({ path: '/tmp/chase-vm-help.png' });
    await require('./games.browser.cjs')(page);
    await command(page, 'open contact/github.url');
    await page.locator('#open-link').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#guest-link').getAttribute('href'), 'https://github.com/farrantch');
    assert.equal(await page.locator('#guest-link').getAttribute('rel'), 'noopener noreferrer');
    await page.locator('#dismiss-link').click();
    await page.context().route('https://github.com/farrantch/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Project repository</title>' }));
    for (const project of portfolio.projects.filter(project => project.repository)) {
      await command(page, `clear; open ~/projects/${project.slug}/github.url`, project.repository);
      await page.waitForFunction(href => document.querySelector('#guest-link').href === href, project.repository);
      await expectTerminalTab(page, project.repository, project.repository);
      await page.locator('#dismiss-link').click();
    }
    await page.context().route(resumeURL, route => route.fulfill({
      contentType: 'application/pdf', body: expectedPDF,
      headers: { 'Content-Disposition': 'attachment; filename="ChaseFarrant-Resume.pdf"' }
    }));
    await command(page, 'open ~/documents/ChaseFarrant-Resume.pdf', `Open in browser: ${resumeURL}`);
    assert.equal(await page.locator('#guest-link').getAttribute('href'), resumeURL);
    const sameOriginPDF = new URL(resumeURL).origin === new URL(url).origin;
    assert.equal(await page.locator('#guest-link').textContent(), sameOriginPDF ? 'Download PDF ↓' : 'Open link ↗');
    assert.equal(await page.locator('#guest-link').getAttribute('download'), sameOriginPDF ? 'ChaseFarrant-Resume.pdf' : null);
    const pagesBeforePDF = new Set(page.context().pages());
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#guest-link').click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'ChaseFarrant-Resume.pdf');
    assert.deepEqual(readFileSync(await download.path()), expectedPDF);
    // The mocked cross-origin attachment can leave an empty download tab.
    for (const tab of page.context().pages()) {
      if (!pagesBeforePDF.has(tab)) await tab.close();
    }
    await page.bringToFront();
    await command(page, 'open contact/github.url');
    await page.waitForFunction(() => document.querySelector('#guest-link').textContent === 'Open link ↗');
    assert.equal(await page.locator('#guest-link').getAttribute('download'), null);
    await page.locator('#dismiss-link').click();
    // Real clicks open web URLs and guest OSC 8 links directly, without a navbar click.
    await page.context().route('https://example.com/terminal-link', route => route.fulfill({ contentType: 'text/html', body: '<title>Link target</title>' }));
    await page.context().route(url + '/about/', route => route.fulfill({ contentType: 'text/html', body: '<title>About target</title>' }));
    await command(page, "clear; printf 'https://example.com/terminal-link\\n'", 'https://example.com/terminal-link');
    assert.equal(page.context().pages().length, 1, 'printing a URL does not open a tab');
    await expectTerminalTab(page, 'https://example.com/terminal-link', 'https://example.com/terminal-link');
    await command(page, "printf '/about/\\n' > /tmp/site.url; open /tmp/site.url", 'Open in browser: /about/');
    assert.equal(page.context().pages().length, 1, 'open waits for a click');
    await expectTerminalTab(page, '/about/', url + '/about/');
    await page.locator('#dismiss-link').click();

    // Record activation without launching a native email application.
    await page.evaluate(() => {
      window.__linkOpens = [];
      window.__originalOpen = window.open;
      window.open = (...args) => { window.__linkOpens.push(args); return null; };
    });
    await command(page, 'open contact/email.url', 'mailto:hello@chasefarrant.com');
    await clickTerminalLink(page, 'mailto:hello@chasefarrant.com');
    assert.deepEqual(await page.evaluate(() => window.__linkOpens), [['mailto:hello@chasefarrant.com', '_blank', 'noopener,noreferrer']]);
    await page.locator('#dismiss-link').click();
    // Unsafe OSC 8 targets cannot bypass the shared URL validation when clicked.
    for (const [index, target] of ['javascript:alert(1)', 'data:text/html,bad', 'file:///etc/passwd'].entries()) {
      const label = `UNSAFE_LINK_${index}`;
      await command(page, String.raw`printf '\033]8;;${target}\033\\${label}\033]8;;\033\\\n'`, label);
      await clickTerminalLink(page, label);
    }
    assert.equal(await page.evaluate(() => window.__linkOpens.length), 1, 'unsafe links do not navigate');
    await page.evaluate(() => { window.open = window.__originalOpen; });
    // Reject a malicious guest OSC, and render HTML-shaped output as terminal text.
    await command(page, "printf '\033]777;open=amF2YXNjcmlwdDphbGVydCgxKQ==\007'; echo '<img src=x onerror=alert(1)>'", '<img');
    assert.equal(await page.locator('#open-link').isVisible(), false);
    assert.equal(await page.locator('#terminal-screen img').count(), 0);
    await command(page, 'stty echo');
    await page.keyboard.type('cd pro');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await command(page, 'pwd', '/home/guest/projects');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await command(page, 'cd ~; stty -echo; clear; vi /tmp/edited.txt');
    await page.waitForFunction(() => {
      const text = document.querySelector('.xterm-rows')?.innerText || '';
      return text.includes('/tmp/edited.txt') && text.includes('~\n~') && !text.includes('guest@');
    });
    await page.keyboard.press('i');
    await page.keyboard.type('EDITOR_WORKS');
    await waitText(page, 'EDITOR_WORKS');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => {
      const text = document.querySelector('.xterm-rows')?.innerText || '';
      return /(?:^|\n)- \/tmp\/edited\.txt/.test(text);
    });
    await page.keyboard.type(':wq');
    await page.keyboard.press('Enter');
    await waitPrompt(page);
    await command(page, 'clear; cat /tmp/edited.txt', 'EDITOR_WORKS');
    await command(page, 'clear; nano /tmp/nano.txt', 'GNU nano');
    await page.keyboard.type('NANO_SAVED');
    await page.keyboard.press('Control+o');
    await waitText(page, 'Write to File:');
    await page.keyboard.press('Enter');
    await waitText(page, 'Wrote 1 line');
    await page.keyboard.press('Control+x');
    await waitPrompt(page);
    await command(page, 'clear; cat /tmp/nano.txt', 'NANO_SAVED');
    await command(page, 'clear; less projects/www.chasefarrant.com/article.txt', 'Explore the portfolio in Linux');
    await page.keyboard.press('Space');
    await page.keyboard.press('q');
    await waitPrompt(page);
    await command(page, "printf 'SLEEP_RUNNING\\n'; sleep 30", 'SLEEP_RUNNING');
    await page.keyboard.press('Control+c');
    await waitPrompt(page);
    await command(page, 'echo SIGNAL_WORKS', 'SIGNAL_WORKS');
    await command(page, 'yes output');
    await page.waitForTimeout(250);
    await page.keyboard.press('Control+c');
    await waitPrompt(page);
    await command(page, 'echo OUTPUT_RECOVERED', 'OUTPUT_RECOVERED');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('.xterm-helper-textarea').evaluate(element => element === document.activeElement), false);
    await command(page, 'clear; welcome', 'Start with ls or help.');
    await waitPrompt(page);
    await page.screenshot({ path: '/tmp/chase-vm-terminal.png' });
    await page.locator('[data-view="browse"]').click();
    assert.match(await page.locator('#vm-status').textContent(), /paused/);
    await page.locator('[data-view="terminal"]').click();
    await command(page, 'cat /tmp/edited.txt', 'EDITOR_WORKS');
    await command(page, 'reboot --help', 'All session files are discarded');
    await command(page, 'echo SHELL_REBOOT_FILE > /tmp/before-reboot; cat /tmp/before-reboot', 'SHELL_REBOOT_FILE');
    await command(page, 'reboot');
    await page.waitForFunction(() => document.querySelector('#boot-screen').dataset.state === 'stopping');
    assert.equal(await page.locator('#terminal-view').getAttribute('aria-busy'), 'true');
    assert.match(await page.locator('#boot-log').textContent(), /Closing terminal|Terminal closed/);
    await waitTextInBoot(page, 'Stopping session');
    assert.equal(await page.locator('.boot-marker.is-done').count(), 1);
    await page.screenshot({ path: '/tmp/chase-vm-shutdown.png' });
    // Switching views during shutdown must not resume the old guest.
    await page.evaluate(() => {
      document.querySelector('[data-view="browse"]').click();
      document.querySelector('[data-view="terminal"]').click();
    });
    assert.match(await page.locator('#vm-status').textContent(), /Restarting/);
    await waitTextInBoot(page, 'Ready to boot');
    assert.equal(await page.locator('.boot-marker.is-done').count(), 3);
    await page.waitForFunction(() => document.querySelector('#boot-screen').dataset.state === 'off');
    await page.waitForFunction(() => document.querySelector('#boot-screen').dataset.state === 'loading');
    const blank = await page.evaluate(() => {
      const off = window.__bootHistory.findLastIndex(entry => entry.state === 'off');
      return { ...window.__bootHistory[off], duration: window.__bootHistory[off + 1].at - window.__bootHistory[off].at };
    });
    assert(blank.duration >= 700, 'reboot includes a brief blank-screen pause');
    assert.equal(blank.frames[0].hidden, false);
    assert.equal(blank.frames[0].log, '');
    await waitForLogin(page);
    assert.notEqual(await page.locator('.boot-line[data-kind="easter-egg"]').textContent(), firstEgg);
    await command(page, 'stty -echo');
    await command(page, 'test ! -e /tmp/before-reboot && test ! -e /tmp/edited.txt && test "$(id -u)" -eq 1000 && echo SHELL_REBOOT_OK', 'SHELL_REBOOT_OK');
    await command(page, 'echo temporary > ~/visit-test.txt; test -s ~/visit-test.txt && echo VISIT_FILE_CREATED', 'VISIT_FILE_CREATED');
    await page.reload();
    await waitForLogin(page);
    await command(page, 'stty -echo');
    await command(page, 'test ! -e ~/visit-test.txt && echo FRESH_VISIT_CONFIRMED', 'FRESH_VISIT_CONFIRMED');
    assert.equal(await page.locator('#start-vm').count(), 0);
    assert.deepEqual(errors, []);
    assert(requests.every(request => new URL(request).origin === new URL(url).origin), 'No external requests from the VM page');
    await page.close();

    const mobile = await browser.newPage({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
    mobile.on('pageerror', error => errors.push(error.message));
    await observeBoot(mobile);
    await mobile.goto(url);
    await mobile.screenshot({ path: '/tmp/chase-vm-mobile.png' });
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await waitForLogin(mobile);
    await mobile.screenshot({ path: '/tmp/chase-vm-welcome-mobile.png' });
    await command(mobile, 'stty -echo');
    await command(mobile, 'clear; help', 'Command options');
    await waitPrompt(mobile);
    await mobile.screenshot({ path: '/tmp/chase-vm-help-mobile.png' });
    await command(mobile, 'pwd', '/home/guest');
    await command(mobile, 'echo MOBILE_WORKS', 'MOBILE_WORKS');
    await require('./touch-scroll.browser.cjs')(mobile);
    await mobile.setViewportSize({ width: 320, height: 640 });
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await mobile.locator('.topbar').evaluate(element => element.getBoundingClientRect().height), 54);
    await command(mobile, 'open contact/github.url');
    await mobile.locator('#open-link').waitFor({ state: 'visible' });
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await mobile.locator('#dismiss-link').click();
    await mobile.screenshot({ path: '/tmp/chase-vm-mobile-terminal.png' });
    await mobile.locator('[data-view="browse"]').click();
    await mobile.locator('a[href="#contact"]').last().click();
    assert(await mobile.locator('#contact').isVisible());
    await mobile.close();

    const directBrowse = await browser.newPage();
    const directRequests = [];
    directBrowse.on('request', request => directRequests.push(request.url()));
    await observeBoot(directBrowse);
    await directBrowse.goto(url + '/#portfolio');
    await directBrowse.locator('#portfolio').waitFor({ state: 'visible' });
    assert(!directRequests.some(request => /\.(wasm|bin)$/.test(request)));
    await directBrowse.locator('[data-view="terminal"]').click();
    await directBrowse.locator('[data-view="browse"]').click();
    await directBrowse.waitForFunction(() => document.querySelector('#boot-screen').dataset.state === 'art', null, { timeout: 95000 });
    await directBrowse.waitForTimeout(1800);
    assert.equal(await directBrowse.locator('#boot-screen').getAttribute('data-state'), 'art');
    assert.doesNotMatch(await directBrowse.locator('.xterm-rows').textContent(), /guest@chasefarrant\.com:~\$/);
    await directBrowse.locator('[data-view="terminal"]').click();
    await waitForLogin(directBrowse);
    await directBrowse.close();

    const fallback = await browser.newPage({ javaScriptEnabled: false });
    await fallback.goto(url);
    assert(await fallback.locator('#portfolio').isVisible());
    assert.equal(await fallback.locator('#projects .project').count(), expectedProjectCount);
    assert(await fallback.locator('a[href="mailto:hello@chasefarrant.com"]').isVisible());
    await fallback.close();

    const recovery = await browser.newPage();
    await recovery.route('**/buildroot-bzimage68.bin', route => route.fulfill({ status: 503, body: 'Test failure' }));
    await recovery.goto(url);
    await recovery.locator('#boot-error').waitFor({ state: 'visible' });
    assert.equal(await recovery.locator('#boot-screen').getAttribute('data-state'), 'failed');
    assert.equal(await recovery.locator('#boot-meter').count(), 0);
    await recovery.unroute('**/buildroot-bzimage68.bin');
    assert.match(await recovery.locator('#boot-error').textContent(), /Refresh the page to try again/);
    await recovery.reload();
    await waitReady(recovery);
    await recovery.close();
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: automatic guest boot, paced boot log, separate art/welcome/prompt stages, easter egg, clipboard shortcuts and multiline paste, temporary session files, reduced motion, favicon, one-row navigation, desktop/mobile, navigation, shell, vi and nano editing, pager, signals, output flooding, direct URL clicks, relative and email links, safe links, reset, paced shutdown and guest reboot, no-JS, and failed-download recovery.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
