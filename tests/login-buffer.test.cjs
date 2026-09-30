const test = require('node:test');
const assert = require('node:assert/strict');
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const artMarker = '\x1b]777;art\x07';
const readyMarker = '\x1b]777;ready\x07';

function feed(buffer, input) {
  return Uint8Array.from([...input].filter(byte => buffer.accept(byte)));
}

test('login output reveals art, welcome text, and the native prompt in separate stages', async () => {
  const { createLoginBuffer } = await import('../site/js/login-buffer.mjs');
  const buffer = createLoginBuffer();
  const art = '\x1b[?25l\x1b[32mcf>\x1b[0m\r\n';
  const welcome = "Heyo, I'm Chase.\r\nStart with ls or help.\r\n";
  const prompt = '\x1b[?25hguest@chasefarrant.com:~$ ';
  // A fast VM can send the entire login before either pause finishes.
  assert.equal(decoder.decode(feed(buffer, encoder.encode(art + artMarker + welcome + readyMarker + prompt))), art + artMarker);
  assert.equal(decoder.decode(buffer.release()), welcome + readyMarker);
  assert.equal(decoder.decode(buffer.release()), prompt);
  assert.equal(buffer.release().length, 0);
  // Running welcome again or receiving later control messages must not pause output.
  const later = encoder.encode(artMarker + readyMarker + 'normal output');
  assert.deepEqual(feed(buffer, later), later);
});

test('login stages handle output arriving after each release without losing bytes', async () => {
  const { createLoginBuffer } = await import('../site/js/login-buffer.mjs');
  const buffer = createLoginBuffer();
  const before = '\x1b[32mCF\x1b[0m\x1b]777;ar\x07\x1b' + artMarker;
  assert.deepEqual(feed(buffer, encoder.encode(before)), encoder.encode(before));
  assert.equal(buffer.release().length, 0);
  const welcome = encoder.encode('Welcome\r\n' + readyMarker.slice(0, 6));
  assert.deepEqual(feed(buffer, welcome), welcome);
  const remainder = encoder.encode(readyMarker.slice(6));
  const prompt = Uint8Array.from([0, 127, 128, 255]);
  assert.deepEqual(feed(buffer, [...remainder, ...prompt]), remainder);
  assert.deepEqual(buffer.release(), prompt);
  const live = encoder.encode('shell output');
  assert.deepEqual(feed(buffer, live), live);
});
