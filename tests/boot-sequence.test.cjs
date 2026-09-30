const test = require('node:test');
const assert = require('node:assert/strict');

test('cached startup work still stays visible before OK and before the next line', async () => {
  const { createBootSequence, advanceBoot } = await import('../site/js/boot-sequence.mjs');
  const sequence = createBootSequence(0);
  const done = Array(5).fill('done');
  advanceBoot(sequence, done, 0);
  advanceBoot(sequence, done, sequence.lines[0].duration - 1);
  assert.equal(sequence.index, 0);
  assert.equal(sequence.doneAt, null);
  advanceBoot(sequence, done, sequence.lines[0].duration);
  assert.equal(sequence.doneAt, sequence.lines[0].duration);
  advanceBoot(sequence, done, sequence.lines[0].duration + 199);
  assert.equal(sequence.index, 0);
  advanceBoot(sequence, done, sequence.lines[0].duration + 200);
  assert.equal(sequence.index, 1);
  assert.equal(sequence.doneAt, null);
});

test('a delayed download cannot complete its line or skip later lines', async () => {
  const { createBootSequence, advanceBoot } = await import('../site/js/boot-sequence.mjs');
  const sequence = createBootSequence(0);
  const milestones = ['done', 'running', 'waiting', 'waiting', 'waiting'];
  advanceBoot(sequence, milestones, sequence.lines[0].duration);
  advanceBoot(sequence, milestones, sequence.lines[0].duration + 200);
  advanceBoot(sequence, milestones, 20000);
  assert.equal(sequence.index, 1);
  assert.equal(sequence.doneAt, null);
  milestones.fill('done');
  advanceBoot(sequence, milestones, 20000);
  assert.equal(sequence.index, 1);
  assert.equal(sequence.doneAt, 20000);
  advanceBoot(sequence, milestones, 20500);
  assert.equal(sequence.index, 2);
  assert.equal(sequence.doneAt, null);
});

test('the intro waits for the actual guest and leaves its last line readable', async () => {
  const { createBootSequence, advanceBoot } = await import('../site/js/boot-sequence.mjs');
  const sequence = createBootSequence(0);
  const milestones = ['done', 'done', 'done', 'done', 'running'];
  for (let now = 0; now <= 12000; now += 100) advanceBoot(sequence, milestones, now);
  assert.equal(sequence.index, sequence.lines.length - 1);
  assert.equal(sequence.complete, false);
  assert.equal(sequence.doneAt, null);
  milestones[4] = 'done';
  advanceBoot(sequence, milestones, 12100);
  advanceBoot(sequence, milestones, 12549);
  assert.equal(sequence.complete, false);
  advanceBoot(sequence, milestones, 12550);
  assert.equal(sequence.complete, true);
});

test('easter eggs keep their matching completion text and rotate through a whole set', async () => {
  // A fresh module starts with a full set, independent of the timing tests above.
  const { createBootSequence, advanceBoot, easterEggs } = await import('../site/js/boot-sequence.mjs?rotation');
  let previous;
  for (let cycle = 0; cycle < 4; cycle++) {
    const seen = new Set();
    for (let i = 0; i < easterEggs.length; i++) {
      const sequence = createBootSequence(0);
      const egg = sequence.lines.find(line => line.kind === 'easter-egg');
      assert.notEqual(egg.text, previous);
      assert(!seen.has(egg.text), 'each message appears once per set');
      seen.add(egg.text);
      previous = egg.text;
      assert.equal(egg.done, easterEggs.find(candidate => candidate.text === egg.text).done);
      for (let now = 0; now <= 12000; now += 100) advanceBoot(sequence, Array(5).fill('done'), now);
      assert.equal(sequence.complete, true);
      assert.equal(sequence.lines.find(line => line.kind === 'easter-egg'), egg);
    }
  }
});

test('shutdown is brief and paced, and waits for the VM to stop', async () => {
  const { createShutdownSequence, advanceBoot } = await import('../site/js/boot-sequence.mjs');
  const sequence = createShutdownSequence(0);
  const milestones = ['running'];
  advanceBoot(sequence, milestones, sequence.lines[0].duration - 1);
  assert.equal(sequence.doneAt, null, 'the first line starts pending');
  for (let now = sequence.lines[0].duration; now <= 5000; now += 20) advanceBoot(sequence, milestones, now);
  assert.equal(sequence.index, 1);
  assert.equal(sequence.doneAt, null, 'the stopped marker waits for the actual VM');
  assert.equal(sequence.complete, false);
  milestones[0] = 'done';
  for (let now = 5020; now <= 6500; now += 20) advanceBoot(sequence, milestones, now);
  assert.equal(sequence.complete, true);

  const quick = createShutdownSequence(0);
  assert.equal(new Set(quick.lines.map(line => line.duration)).size, 3, 'stages have distinct durations');
  let completeAt;
  for (let now = 0; now <= 2400; now += 20) {
    advanceBoot(quick, ['done'], now);
    if (quick.complete) { completeAt = now; break; }
  }
  assert(completeAt >= 1200 && completeAt <= 2200, 'a normal outro takes around two seconds');
});
