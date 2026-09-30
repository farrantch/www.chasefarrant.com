// Hold the welcome text after the art marker, then the native prompt after
// the ready marker. Each release advances only as far as the next marker.
export function createLoginBuffer() {
  const encoder = new TextEncoder();
  const markers = ['art', 'ready'].map(name => encoder.encode(`\x1b]777;${name}\x07`));
  let stage = 0;
  let matched = 0;
  let holding = false;
  let pending = [];
  function accept(byte) {
    if (holding) { pending.push(byte); return false; }
    const marker = markers[stage];
    if (marker) {
      matched = byte === marker[matched] ? matched + 1 : (byte === marker[0] ? 1 : 0);
      if (matched === marker.length) { stage++; matched = 0; holding = true; }
    }
    return true;
  }
  return {
    accept,
    release() {
      holding = false;
      const bytes = pending;
      pending = [];
      return Uint8Array.from(bytes.filter(accept));
    }
  };
}
