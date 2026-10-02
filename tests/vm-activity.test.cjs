const test = require('node:test');
const assert = require('node:assert/strict');
const flush = () => new Promise(resolve => setImmediate(resolve));

async function setup(t) {
  const { createVmActivity } = await import('../site/js/vm-activity.mjs');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const states = [];
  const errors = [];
  const vm = { run: async () => { calls.push('run'); }, stop: async () => { calls.push('stop'); } };
  const activity = createVmActivity({ vm, onChange: state => states.push(state), onError: error => errors.push(error) });
  t.after(() => activity.dispose());
  return { activity, vm, calls, states, errors };
}

test('a hidden boot stays stopped and resumes only when visible', async t => {
  const { activity, calls } = await setup(t);
  await activity.initialize();
  assert.deepEqual(calls, []);
  await activity.setVisible(true);
  assert.deepEqual(calls, ['run']);
  assert.equal(activity.wake(), false, 'boot does not accept terminal input');
  t.mock.timers.tick(120000);
  await flush();
  assert.deepEqual(calls, ['run'], 'the inactivity deadline begins after login');
  await activity.setVisible(false);
  assert.deepEqual(calls, ['run', 'stop']);
  await activity.setVisible(true);
  assert.deepEqual(calls, ['run', 'stop', 'run']);
});

test('30 seconds without input pauses; activity resets the deadline and resumes the same VM', async t => {
  const { activity, calls, states } = await setup(t);
  await activity.setVisible(true);
  await activity.initialize();
  await activity.setReady();
  t.mock.timers.tick(29000);
  await flush();
  assert.deepEqual(calls, ['run']);
  assert.equal(activity.wake(), true);
  t.mock.timers.tick(29000);
  await flush();
  assert.deepEqual(calls, ['run']);
  t.mock.timers.tick(1000);
  await flush();
  assert.deepEqual(calls, ['run', 'stop']);
  assert.equal(states.at(-1).idle, true);
  assert.equal(activity.wake(), true, 'the first input is accepted while waking');
  await flush();
  assert.deepEqual(calls, ['run', 'stop', 'run']);
  assert.equal(states.at(-1).idle, false);
});

test('draining output cannot override visibility or inactivity pauses', async t => {
  const { activity, calls } = await setup(t);
  await activity.setVisible(true);
  await activity.initialize();
  await activity.setReady();
  await activity.setBackpressure(true);
  await activity.setVisible(false);
  await activity.setBackpressure(false);
  assert.deepEqual(calls, ['run', 'stop']);
  assert.equal(activity.wake(), false, 'hidden input cannot restart the VM');
  await activity.setVisible(true);
  await activity.setBackpressure(true);
  t.mock.timers.tick(30000);
  await flush();
  await activity.setBackpressure(false);
  assert.deepEqual(calls, ['run', 'stop', 'run', 'stop']);
  activity.wake();
  await flush();
  assert.deepEqual(calls, ['run', 'stop', 'run', 'stop', 'run']);
});

test('a quick return waits for the pending stop before restarting', async t => {
  const { activity, vm, calls } = await setup(t);
  await activity.setVisible(true);
  await activity.initialize();
  let finishStop;
  vm.stop = () => { calls.push('stopping'); return new Promise(resolve => { finishStop = resolve; }); };
  const stopped = activity.setVisible(false);
  await flush();
  const resumed = activity.setVisible(true);
  await flush();
  assert.deepEqual(calls, ['run', 'stopping']);
  finishStop();
  await Promise.all([stopped, resumed]);
  assert.deepEqual(calls, ['run', 'stopping', 'run']);
  vm.stop = async () => calls.push('stop');
});

test('disposal cancels a queued resume and ignores late boot, input, and output', async t => {
  const { activity, vm, calls } = await setup(t);
  await activity.setVisible(true);
  await activity.initialize();
  await activity.setReady();
  let finishStop;
  vm.stop = () => { calls.push('stopping'); return new Promise(resolve => { finishStop = resolve; }); };
  activity.setVisible(false);
  await flush();
  activity.setVisible(true);
  const disposed = activity.dispose();
  finishStop();
  await disposed;
  await activity.initialize();
  await activity.setBackpressure(false);
  assert.equal(activity.wake(), false);
  t.mock.timers.tick(120000);
  await flush();
  assert.deepEqual(calls, ['run', 'stopping']);
});
