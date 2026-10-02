// Keep all pause reasons together so draining output cannot wake an idle or
// hidden VM. Serialize run/stop: v86.stop() finishes asynchronously.
export function createVmActivity({ vm, idleTimeoutMs = 30000, onChange = () => {}, onError = () => {} }) {
  let initialized = false;
  let visible = false;
  let ready = false;
  let idle = false;
  let backpressure = false;
  let disposed = false;
  let running = false;
  let idleTimer = null;
  let transition = Promise.resolve();

  const shouldRun = () => initialized && visible && !idle && !backpressure && !disposed;
  function sync() {
    onChange({ ready, visible, idle, paused: !shouldRun() });
    transition = transition.then(async () => {
      const next = shouldRun();
      if (running === next) return;
      if (next) await vm.run();
      else await vm.stop();
      running = next;
    }).catch(error => { onError(error); });
    return transition;
  }
  function armIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = null;
    if (ready && visible && !idle && !disposed) {
      idleTimer = setTimeout(() => {
        idleTimer = null;
        idle = true;
        sync();
      }, idleTimeoutMs);
    }
  }
  return {
    initialize() { initialized = true; return sync(); },
    setVisible(value) {
      if (visible === value) return transition;
      visible = value;
      if (visible) idle = false;
      armIdleTimer();
      return sync();
    },
    setReady() { ready = true; armIdleTimer(); return sync(); },
    setBackpressure(value) { backpressure = value; return sync(); },
    wake() {
      if (!ready || !visible || disposed) return false;
      const wasIdle = idle;
      idle = false;
      armIdleTimer();
      if (wasIdle) sync();
      return true;
    },
    dispose() { disposed = true; armIdleTimer(); return sync(); }
  };
}
