// xterm 6.0's custom viewport handles wheels but not touch swipes.
// Remove this fallback when the installed xterm release restores touch scrolling.
export function attachTouchScroll(term, signal) {
  const screen = term.element.querySelector('.xterm-screen');
  let gesture = null;
  const reset = () => { gesture = null; };

  screen.addEventListener('touchstart', event => {
    reset();
    if (event.touches.length !== 1 || term.buffer.active.type !== 'normal') return;
    const touch = event.touches[0];
    gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, lastY: touch.clientY, remainder: 0, dragging: false };
  }, { passive: true, signal });

  screen.addEventListener('touchmove', event => {
    if (!gesture) return;
    const touch = event.touches[0];
    if (event.touches.length !== 1 || touch.identifier !== gesture.id || !event.cancelable || term.buffer.active.type !== 'normal') {
      reset();
      return;
    }
    const delta = gesture.y - touch.clientY;
    if (!gesture.dragging) {
      // Preserve taps, horizontal gestures, pinch zoom, and page scrolling at the edges.
      if (Math.abs(delta) < 6) return;
      const buffer = term.buffer.active;
      if (Math.abs(touch.clientX - gesture.x) > Math.abs(delta) ||
          (delta < 0 && buffer.viewportY === 0) ||
          (delta > 0 && buffer.viewportY === buffer.baseY)) {
        reset();
        return;
      }
      gesture.dragging = true;
    }
    event.preventDefault();
    const lineHeight = screen.getBoundingClientRect().height / term.rows;
    gesture.remainder += gesture.lastY - touch.clientY;
    gesture.lastY = touch.clientY;
    const lines = Math.trunc(gesture.remainder / lineHeight);
    if (lines) {
      term.scrollLines(lines);
      gesture.remainder -= lines * lineHeight;
    }
  }, { passive: false, signal });

  screen.addEventListener('touchend', reset, { passive: true, signal });
  screen.addEventListener('touchcancel', reset, { passive: true, signal });
}
