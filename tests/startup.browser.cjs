const assert = require('node:assert/strict');

module.exports = async function checkStartup(browser, url, viewport) {
  const page = await browser.newPage({ viewport });
  let releaseModule;
  let moduleGate;
  await page.route('**/vm-terminal.js', async route => {
    await moduleGate;
    await route.continue();
  });
  await page.addInitScript(() => {
    window.__startupFrames = [];
    const sample = () => {
      const portfolio = document.querySelector('#portfolio');
      const terminal = document.querySelector('#terminal-view');
      if (portfolio && terminal) window.__startupFrames.push({
        browse: portfolio.getBoundingClientRect().height > 0,
        terminal: terminal.getBoundingClientRect().height > 0,
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  try {
    for (const [index, hash] of ['', '#terminal', '#portfolio', '#projects', '#contact', '#missing'].entries()) {
      const browse = ['#portfolio', '#projects', '#contact'].includes(hash);
      // Hold the real module until several frames have painted, including on reload.
      for (const reload of index === 0 ? [false, true] : [false]) {
        moduleGate = new Promise(resolve => { releaseModule = resolve; });
        if (reload) await page.reload({ waitUntil: 'commit' });
        else await page.goto(`${url}/?startup=${index}${hash}`, { waitUntil: 'commit' });
        await page.waitForFunction(() => window.__startupFrames.length >= 3);
        const frames = await page.evaluate(() => window.__startupFrames);
        assert(frames.every(frame => frame.browse === browse && frame.terminal === !browse),
          `wrong view before modules loaded: ${reload ? 'reload' : hash || 'home'} ${JSON.stringify(frames)}`);
        releaseModule();
        await page.waitForLoadState('domcontentloaded');
        assert.equal(await page.locator('#portfolio').isVisible(), browse);
        assert.equal(await page.locator('#terminal-view').isVisible(), !browse);
      }
    }
    // Browse remains usable even when the application module cannot load.
    await page.unroute('**/vm-terminal.js');
    await page.route('**/vm-terminal.js', route => route.abort());
    await page.goto(url);
    await page.locator('[data-view="browse"]').click();
    await page.locator('#portfolio').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#terminal-view').isVisible(), false);
  } finally {
    releaseModule?.();
    await page.close();
  }
  const fallback = await browser.newPage({ viewport, javaScriptEnabled: false });
  try {
    await fallback.goto(url);
    assert(await fallback.locator('#portfolio').isVisible());
    assert.equal(await fallback.locator('#terminal-view').isVisible(), false);
    await fallback.locator('a[href="#contact"]').click();
    assert(await fallback.locator('a[href="mailto:hello@chasefarrant.com"]').isVisible());
  } finally { await fallback.close(); }
};
