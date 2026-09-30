const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { firefox, webkit, chromium } = require('playwright');
const url = process.env.TERMINAL_URL;
const resumeURL = require('../site/_lib/portfolio.cjs')().resumeURL;
const expectedPDF = fs.readFileSync(path.resolve(__dirname, '../site/ChaseFarrant-Resume.pdf'));
(async () => {
  for (const [name, engine, viewport] of [['Firefox', firefox, { width: 1280, height: 900 }], ['WebKit', webkit, { width: 375, height: 667 }], ['Chromium slow connection', chromium, { width: 375, height: 667 }]]) {
    console.log(`${name}: starting browser checks.`);
    const browser = await engine.launch({ headless: true });
    try {
      await require('./startup.browser.cjs')(browser, url, viewport);
      console.log(`${name}: first paint, reload, section links, blocked modules, and no-JS passed.`);
      const page = await browser.newPage({ viewport, acceptDownloads: true, ...(engine !== firefox ? { isMobile: true, hasTouch: true } : {}) });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      if (engine === chromium) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: 625000, uploadThroughput: 125000 });
      }
      await page.goto(url);
      const waitReady = () => page.waitForFunction(() => document.querySelector('#boot-screen').dataset.state === 'ready', null, { timeout: 120000 });
      await waitReady();
      assert.match(await page.locator('.xterm-rows').innerText(), /guest@chasefarrant\.com:~\$/);
      const command = async text => { await page.locator('.xterm-helper-textarea').focus(); await page.keyboard.type(text); await page.keyboard.press('Enter'); };
      await command("printf 'BROWSER_%s_OK\\n' SHELL");
      await page.waitForFunction(() => document.querySelector('.xterm-rows').textContent.includes('BROWSER_SHELL_OK'));
      console.log(`${name}: guest shell ready.`);
      if (engine !== firefox) await require('./touch-scroll.browser.cjs')(page);
      const checkPDFNavigation = engine === webkit && new URL(url).origin !== new URL(resumeURL).origin;
      // Headless WebKit opens an empty tab for a cross-origin PDF without a
      // download event. Check its navigation with HTML; other engines also
      // verify the downloaded PDF bytes.
      await page.context().route(resumeURL, route => route.fulfill(checkPDFNavigation ? {
        contentType: 'text/html; charset=utf-8', body: '<title>Public resume</title><p>Public resume URL reached.</p>'
      } : {
        contentType: 'application/pdf', body: expectedPDF,
        headers: { 'Content-Disposition': 'attachment; filename="ChaseFarrant-Resume.pdf"' }
      }));
      await command('open ~/contact/resume.url');
      await page.waitForFunction(href => document.querySelector('#guest-link').href === href, resumeURL);
      const pagesBeforePDF = new Set(page.context().pages());
      if (checkPDFNavigation) {
        const popupPromise = page.waitForEvent('popup');
        await page.locator('#guest-link').click();
        const popup = await popupPromise;
        await popup.waitForURL(resumeURL);
        assert.equal(await popup.title(), 'Public resume');
        assert.equal(await popup.evaluate(() => window.opener), null);
        assert.equal(await popup.evaluate(() => document.referrer), '');
      } else {
        const downloadPromise = page.waitForEvent('download');
        await page.locator('#guest-link').click();
        const download = await downloadPromise;
        assert.deepEqual(fs.readFileSync(await download.path()), expectedPDF);
      }
      // The mocked cross-origin attachment can leave an empty download tab.
      for (const tab of page.context().pages()) {
        if (!pagesBeforePDF.has(tab)) await tab.close();
      }
      await page.bringToFront();
      await page.locator('#dismiss-link').click();
      await page.locator('[data-view="browse"]').click();
      assert(await page.locator('#portfolio').isVisible());
      await page.locator('[data-view="terminal"]').click();
      await command('reboot');
      await page.waitForFunction(() => document.querySelector('#boot-screen').dataset.state === 'off', null, { timeout: 20000 });
      assert.equal(await page.locator('.boot-cursor').isVisible(), false);
      await waitReady();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      console.log(`${name}: boot, shell, résumé ${checkPDFNavigation ? 'navigation' : 'download'}, Browse, and reboot passed.`);
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
