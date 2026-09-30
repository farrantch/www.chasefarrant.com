const assert = require('node:assert/strict');

module.exports = async function checkTouchScroll(page) {
  await page.locator('.xterm-helper-textarea').focus();
  await page.keyboard.type("i=1; while [ \"$i\" -le 120 ]; do printf 'SCROLL_%03d\\n' \"$i\"; i=$((i+1)); done");
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const text = document.querySelector('.xterm-rows').textContent;
    return text.includes('SCROLL_120') && text.trimEnd().endsWith('guest@chasefarrant.com:~$');
  });
  const cdp = page.context().browser().browserType().name() === 'chromium'
    ? await page.context().newCDPSession(page) : null;
  const screen = await page.locator('.xterm-screen').boundingBox();
  const x = screen.x + screen.width / 2;
  const top = screen.y + screen.height * 0.25;
  const bottom = screen.y + screen.height * 0.75;
  const dispatch = async (type, points) => {
    if (cdp) return cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    // Playwright only exposes native swipe injection in Chromium; exercise the
    // same DOM touch events in WebKit as well.
    await page.locator('.xterm-screen').evaluate((element, { type, points }) => {
      // WebKit does not expose a constructible Touch object.
      const touches = points.map(({ x, y }, identifier) => ({
        identifier, target: element, clientX: x, clientY: y
      }));
      const event = new Event(type.toLowerCase(), { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        touches: { value: touches }, targetTouches: { value: touches }, changedTouches: { value: touches }
      });
      element.dispatchEvent(event);
    }, { type, points });
  };
  const swipe = async (from, to) => {
    await dispatch('touchStart', [{ x, y: from }]);
    for (let step = 1; step <= 12; step++) {
      await dispatch('touchMove', [{ x, y: from + (to - from) * step / 12 }]);
      await new Promise(resolve => setTimeout(resolve, 16));
    }
    await dispatch('touchEnd', []);
  };
  try {
    const before = await page.locator('.xterm-rows').innerText();
    const pageY = await page.evaluate(() => scrollY);
    await swipe(top, bottom);
    await page.waitForFunction(before => document.querySelector('.xterm-rows').innerText !== before, before, { timeout: 3000 });
    const after = await page.locator('.xterm-rows').innerText();
    assert(Number(after.match(/SCROLL_(\d+)/)[1]) < Number(before.match(/SCROLL_(\d+)/)[1]), 'Swiping down reveals earlier output');
    assert.equal(await page.evaluate(() => scrollY), pageY, 'Scrolling history does not move the page');
    await swipe(bottom, top);
    await page.waitForFunction(() => document.querySelector('.xterm-rows').textContent.trimEnd().endsWith('guest@chasefarrant.com:~$'));
    assert.equal(await page.evaluate(() => scrollY), pageY);
    // A tap must still focus the terminal so the mobile keyboard can open.
    await page.locator('[data-view="terminal"]').focus();
    await page.touchscreen.tap(x, bottom);
    assert(await page.locator('.xterm-helper-textarea').evaluate(element => element === document.activeElement));
    console.log('Mobile touch: swipe through history in both directions and tap to type passed.');
  } finally {
    await cdp?.detach();
  }
};
