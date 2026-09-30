const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const assets = require('../vm/assets.json');

async function verifyGames(page) {
  const screen = () => page.locator('.xterm-rows').innerText();
  const waitText = text => page.waitForFunction(text =>
    document.querySelector('.xterm-rows')?.textContent.includes(text), text, { timeout: 20000 });
  const waitPrompt = () => page.waitForFunction(() =>
    document.querySelector('.xterm-rows')?.innerText.trimEnd().endsWith('guest@chasefarrant.com:~$'), null, { timeout: 20000 });
  async function command(text) {
    await page.locator('.xterm-helper-textarea').focus();
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
  }
  await command('stty -echo; clear');
  await waitPrompt();

  // The upstream menu must be able to start a child game through PATH.
  await command('games');
  await waitText('Enter a name');
  await page.keyboard.press('Enter');
  await waitText('redsquare');
  await page.screenshot({ path: '/tmp/chase-games-menu.png' });
  for (let i = 0; i < 11; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await waitText('Flags:0');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await waitText('Flags:1');
  await page.screenshot({ path: '/tmp/chase-games-mines.png' });
  await page.keyboard.press('Space');
  await waitText('Flags:0');
  await page.keyboard.press('q');
  await waitText('Main Menu');
  await page.keyboard.press('q');
  await waitPrompt();

  await command('2048');
  await waitText('←,↑,→,↓ or q');
  const initialBoard = await screen();
  for (const key of ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(200);
  }
  assert.notEqual(await screen(), initialBoard, 'arrow keys move the 2048 board');
  await page.screenshot({ path: '/tmp/chase-games-2048.png' });
  await page.keyboard.press('q');
  await waitText('QUIT?');
  await page.keyboard.press('y');
  await waitPrompt();

  await command('tetris');
  await waitText('1-Player Game');
  await page.keyboard.press('Enter');
  await waitText('Softdrop Speed');
  await page.keyboard.press('Enter');
  await waitText('PRESS KEY');
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(500);
  assert.match(await screen(), /Score[\s\S]*Level[\s\S]*Lines/);
  await page.screenshot({ path: '/tmp/chase-games-tetris.png' });
  await page.keyboard.press('Control+c');
  await waitPrompt();

  // Every other packaged game must render and handle an interrupt cleanly.
  const games = assets.filter(asset => /^opt\/nbsdgames\/bin\//.test(asset.guestPath || ''))
    .map(asset => asset.guestPath.split('/').at(-1))
    .filter(name => !['nbsdgames', 'mines'].includes(name));
  for (const name of games) {
    await command(`stty -echo; clear; ${name}; printf '\\nGAME_EXIT:%s\\n' "$?"`);
    await page.waitForTimeout(700);
    const gameScreen = await screen();
    assert(gameScreen.trim(), `${name} renders a screen`);
    assert.doesNotMatch(gameScreen, /GAME_EXIT:|Segmentation fault|Illegal instruction|Error loading shared library/, name);
    await page.keyboard.press('Control+c');
    await waitPrompt();
    assert.match(await screen(), /GAME_EXIT:(0|1|2|130)\s/, `${name} exits on Ctrl+C`);
  }
  await command("printf 'GAMES_SHELL_OK\\n'");
  await waitText('GAMES_SHELL_OK');
  await waitPrompt();

  // The compact games still render and return to the shell on a phone width.
  const originalViewport = page.viewportSize();
  await page.setViewportSize({ width: 375, height: 900 });
  await page.waitForTimeout(300);
  await command('2048');
  await waitText('←,↑,→,↓ or q');
  await page.screenshot({ path: '/tmp/chase-games-2048-mobile.png' });
  await page.keyboard.press('q');
  await waitText('QUIT?');
  await page.keyboard.press('y');
  await waitPrompt();
  await command('mines');
  await waitText('Flags:0');
  await page.keyboard.press('Space');
  await waitText('Flags:1');
  await page.screenshot({ path: '/tmp/chase-games-mines-mobile.png' });
  await page.keyboard.press('q');
  await waitPrompt();
  await page.setViewportSize(originalViewport);
  await page.waitForTimeout(300);
  console.log('Games passed: upstream menu, gameplay controls, all game launches, Ctrl+C, and narrow-screen rendering.');
}
module.exports = verifyGames;

if (require.main === module) {
  (async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      await page.goto(process.env.TERMINAL_URL || 'http://127.0.0.1:8080');
      await page.waitForFunction(() => document.querySelector('#vm-status')?.textContent.includes('connected'), null, { timeout: 95000 });
      await verifyGames(page);
    } catch (error) {
      console.error(await page.locator('.xterm-rows').innerText());
      await page.screenshot({ path: '/tmp/chase-games-failure.png' });
      throw error;
    } finally { await browser.close(); }
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
