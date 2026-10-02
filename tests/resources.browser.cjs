const assert = require('node:assert/strict');

module.exports = async function checkResources(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let releaseImage;
  const imageGate = new Promise(resolve => { releaseImage = resolve; });
  try {
    // Expose this test page's session without adding a debug API to production.
    await page.route('**/vm-terminal.js', async route => {
      const response = await route.fetch();
      const body = (await response.text())
        .replace('session = current;', 'session = current; globalThis.__resourceSession = current;')
        .replace('() => current.activity.initialize()', '() => { current.resourceInitialized = true; current.activity.initialize(); }');
      await route.fulfill({ response, body });
    });
    // Unit tests cover the real 30-second deadline; shorten only this browser test.
    await page.route('**/vm-activity.mjs', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace('idleTimeoutMs = 30000', 'idleTimeoutMs = 3000') });
    });
    await page.route('**/buildroot-bzimage68.bin', async route => { await imageGate; await route.continue(); });
    await page.goto(url);
    await page.locator('[data-view="browse"]').click();
    releaseImage();
    await page.waitForFunction(() => globalThis.__resourceSession?.resourceInitialized, null, { timeout: 95000 });
    const assertStopped = async () => {
      await page.waitForFunction(() => !__resourceSession.vm.is_running());
      const instructions = await page.evaluate(() => __resourceSession.vm.get_instruction_counter());
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => __resourceSession.vm.get_instruction_counter()), instructions, 'paused VM executes no instructions');
    };
    await assertStopped();
    assert.equal(await page.evaluate(() => __resourceSession.timeout), null, 'hidden boot has no running timeout');
    await page.locator('[data-view="terminal"]').click();
    await page.waitForFunction(() => __resourceSession.ready, null, { timeout: 95000 });
    const command = async text => {
      await page.locator('.xterm-helper-textarea').focus();
      await page.keyboard.type(text);
      await page.keyboard.press('Enter');
    };
    const waitText = text => page.waitForFunction(text => document.querySelector('.xterm-rows').textContent.includes(text), text);
    const waitIdle = () => page.waitForFunction(() => document.querySelector('#vm-status').textContent.includes('type or tap'));
    await command("stty -echo; printf kept > /tmp/resource-session; printf 'RESOURCE_%s_READY\\n' FILE");
    await waitText('RESOURCE_FILE_READY');
    await waitIdle();
    await assertStopped();
    assert.equal(await page.evaluate(() => __resourceSession.term.options.cursorBlink), false);
    assert.equal(await page.locator('[data-view="terminal"]').textContent(), 'Resume');
    await command("cat /tmp/resource-session; printf 'RESOURCE_%s_WAKE\\n' KEY");
    await waitText('keptRESOURCE_KEY_WAKE');
    assert.equal(await page.evaluate(() => __resourceSession.vm.is_running()), true, 'typing wakes the same session without losing its first character');
    await waitIdle();
    await page.locator('#terminal-screen').click({ position: { x: 10, y: 10 } });
    await page.waitForFunction(() => __resourceSession.vm.is_running());
    assert.match(await page.locator('#vm-status').textContent(), /connected/);

    // Headless browsers do not consistently hide tabs. Dispatch the browser's
    // visibility event with a controlled document.hidden value to test the wiring.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await assertStopped();
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => __resourceSession.vm.is_running());
    await command("printf 'RESOURCE_%s_LOOP\\n' BUSY; while :; do :; done");
    await waitText('RESOURCE_BUSY_LOOP');
    await waitIdle();
    await assertStopped();
    await page.evaluate(() => new Promise(resolve => __resourceSession.term.write('\x1b[6n', resolve)));
    await assertStopped(); // A guest terminal query must not count as visitor input.
    await page.keyboard.press('Control+c');
    await page.waitForFunction(() => document.querySelector('.xterm-rows').innerText.trimEnd().endsWith('guest@chasefarrant.com:~$'));
    await command("printf 'RESOURCE_%s_RECOVERED\\n' SIGNAL");
    await waitText('RESOURCE_SIGNAL_RECOVERED');
    await waitIdle();
    await page.locator('[data-view="terminal"]').click();
    await page.waitForFunction(() => __resourceSession.vm.is_running());
    assert.equal(await page.locator('[data-view="terminal"]').textContent(), 'Terminal');
    assert.deepEqual(errors, []);
  } finally {
    releaseImage();
    await page.close();
  }
};
