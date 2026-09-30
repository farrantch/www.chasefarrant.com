export const easterEggs = [
  { text: 'Reticulating splines', done: 'Splines reticulated' },
  { text: 'Consulting the rubber duck', done: 'The duck approves' },
  { text: 'Untangling cables', done: 'Cables mostly untangled' },
  { text: 'Herding stray electrons', done: 'Electrons accounted for' },
  { text: 'Locating the any key', done: 'Any key located' },
  { text: 'Checking the magic smoke', done: 'Magic smoke contained' },
  { text: 'Turning it off and on again', done: 'Classic troubleshooting complete' },
  { text: 'Adjusting the vibe', done: 'Vibe within tolerance' }
];

// Shuffle a full set, then avoid repeating at the boundary between sets.
let remainingEggs = [];
let previousEgg;
function nextEasterEgg() {
  if (!remainingEggs.length) {
    remainingEggs = [...easterEggs];
    for (let i = remainingEggs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remainingEggs[i], remainingEggs[j]] = [remainingEggs[j], remainingEggs[i]];
    }
    const last = remainingEggs.length - 1;
    if (remainingEggs[last] === previousEgg) {
      [remainingEggs[0], remainingEggs[last]] = [remainingEggs[last], remainingEggs[0]];
    }
  }
  previousEgg = remainingEggs.pop();
  return previousEgg;
}

const duration = (min, max) => Math.round(min + Math.random() * (max - min));

// Presentation runs alongside startup; completed work still gets time to be read.
export function createBootSequence(now) {
  // Pick each minimum display time once per boot. Real milestones can take longer.
  const lines = [
    { text: 'Loading terminal', done: 'Terminal ready', milestone: 0, duration: duration(180, 360) },
    { text: 'Reading files', done: 'Files loaded', milestone: 1, duration: duration(650, 1200) },
    { ...nextEasterEgg(), kind: 'easter-egg', milestone: null, duration: duration(700, 1000) },
    { text: 'Preparing environment', done: 'Environment ready', milestone: 2, duration: duration(300, 550) },
    { text: 'Starting session', done: 'Session started', milestone: 3, duration: duration(900, 1500) },
    { text: 'Signing in', done: 'Signed in as guest', milestone: 4, duration: duration(200, 350) }
  ];
  return { lines, index: 0, enteredAt: now, doneAt: null, complete: false };
}

export function createShutdownSequence(now) {
  const lines = [
    { text: 'Closing terminal', done: 'Terminal closed', milestone: null, duration: duration(250, 350) },
    { text: 'Stopping session', done: 'Session stopped', milestone: 0, duration: duration(500, 700) },
    { text: 'Rebooting', done: 'Ready to boot', milestone: null, duration: duration(180, 240) }
  ];
  return { lines, index: 0, enteredAt: now, doneAt: null, complete: false, hold: 120, finalHold: 300 };
}

export function advanceBoot(sequence, milestones, now) {
  if (sequence.complete) return;
  if (sequence.doneAt !== null) {
    const hold = sequence.index === sequence.lines.length - 1 ? (sequence.finalHold ?? 450) : (sequence.hold ?? 200);
    if (now - sequence.doneAt < hold) return;
    sequence.index++;
    sequence.enteredAt = now;
    sequence.doneAt = null;
    sequence.complete = sequence.index === sequence.lines.length;
    return;
  }
  const line = sequence.lines[sequence.index];
  if (now - sequence.enteredAt >= line.duration &&
      (line.milestone === null || milestones[line.milestone] === 'done')) {
    sequence.doneAt = now;
  }
}
