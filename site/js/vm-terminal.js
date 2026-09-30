import { safeLink, bridgeMessage } from './vm-bridge.mjs';
import { createLoginBuffer } from './login-buffer.mjs';
import { createBootSequence, createShutdownSequence, advanceBoot } from './boot-sequence.mjs';

const $ = selector => document.querySelector(selector);
const config = JSON.parse($('#vm-config').textContent);
const terminalView = $('#terminal-view');
const portfolio = $('#portfolio');
const status = $('#vm-status');
const bootScreen = $('#boot-screen');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let view = 'terminal';
let session = null;
let starting = false;
let generation = 0;

function setStatus(text) { status.textContent = text; }
function syncActivity() {
  if (session?.loginStage && !session.ready && !session.stopping) {
    if (!document.hidden && view === 'terminal') startLoginDelay(session);
    else {
      clearTimeout(session.loginTimer);
      session.loginTimer = null;
    }
    return;
  }
  if (!session?.ready) return;
  if (document.hidden || view === 'browse') {
    session.vm.stop();
    setStatus('Session paused.');
  } else {
    session.vm.run();
    setStatus('guest · connected');
    fitTerminal();
  }
}
function setView(next) {
  view = next;
  terminalView.hidden = next !== 'terminal';
  portfolio.hidden = next !== 'browse';
  delete document.documentElement.dataset.initialView;
  $('[data-view="terminal"]').setAttribute('aria-pressed', String(next === 'terminal'));
  if (next === 'browse') $('[data-view="browse"]').setAttribute('aria-current', 'true');
  else $('[data-view="browse"]').removeAttribute('aria-current');
  syncActivity();
  if (next === 'terminal') {
    if (!session && !starting) start();
    requestAnimationFrame(() => { fitTerminal(); if (session?.ready) session.term.focus(); });
  }
}
function followHash() {
  if (!location.hash || location.hash === '#terminal') { setView('terminal'); return; }
  const target = document.getElementById(location.hash.slice(1));
  if (target && (target === portfolio || portfolio.contains(target))) {
    setView('browse');
    requestAnimationFrame(() => target.scrollIntoView());
  } else {
    setView('terminal');
  }
}
document.querySelectorAll('[data-view]').forEach(element => {
  element.hidden = false;
  if (element.dataset.view === 'terminal') element.addEventListener('click', () => {
    history.replaceState(null, '', '#terminal');
    setView('terminal');
  });
});
// Reveal browse targets before native fragment navigation, including the skip link.
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (link && link.getAttribute('href') !== '#terminal') setView('browse');
});
addEventListener('hashchange', followHash);
document.addEventListener('visibilitychange', syncActivity);
function fitTerminal() {
  if (!session?.term || terminalView.hidden) return;
  session.fit.fit();
  if (session.ready) {
    const dimensions = `${session.term.rows} ${session.term.cols}\n`;
    session.vm.serial_send_bytes(1, new TextEncoder().encode(dimensions));
  }
}
$('#dismiss-link').addEventListener('click', () => {
  $('#open-link').hidden = true;
  $('.topbar').classList.remove('has-guest-link');
});

// Called only by a terminal link click, so navigation has a browser gesture.
function activateLink(_event, value) {
  const url = safeLink(value, location.origin);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

function offerLink(value) {
  const url = safeLink(value, location.origin);
  if (!url) return;
  const link = $('#guest-link');
  link.href = url;
  link.title = url;
  const address = new URL(url);
  const pdf = address.origin === location.origin && address.pathname.endsWith('.pdf');
  if (pdf) link.download = address.pathname.split('/').pop();
  else link.removeAttribute('download');
  link.textContent = pdf ? 'Download PDF ↓' : 'Open link ↗';
  link.setAttribute('aria-label', `${pdf ? 'Download' : 'Open'} ${url}`);
  $('#open-link').hidden = false;
  $('.topbar').classList.add('has-guest-link');
}

async function dispose() {
  const old = session;
  session = null;
  if (!old) return;
  clearTimeout(old.timeout);
  clearTimeout(old.flushTimer);
  clearTimeout(old.rebootTimer);
  clearTimeout(old.loginTimer);
  clearInterval(old.bootTimer);
  old.abort.abort();
  old.observer?.disconnect();
  old.term?.dispose();
  if (old.vm) await old.vm.destroy();
}

const bootSteps = [
  'Load terminal',
  'Load portfolio',
  'Prepare session',
  'Start session',
  'Sign in'
];
function finishBoot(current) {
  if (session !== current || current.loginStage || !current.artReady || !current.sequence.complete) return;
  current.loginStage = 'art';
  clearInterval(current.bootTimer);
  bootScreen.dataset.state = 'art';
  bootScreen.hidden = true;
  setStatus('Preparing shell…');
  syncActivity();
}
function startLoginDelay(current) {
  if (current.loginTimer || current.releasingLogin || !['art', 'welcome'].includes(current.loginStage)) return;
  const stage = current.loginStage;
  current.loginTimer = setTimeout(() => {
    current.loginTimer = null;
    if (session !== current || document.hidden || view !== 'terminal') return;
    current.loginStage = 'printing';
    current.releasingLogin = true;
    current.term.write(current.loginBuffer.release(), () => {
      if (session !== current) return;
      current.releasingLogin = false;
      if (stage === 'art') {
        syncActivity();
        return;
      }
      current.term.options.disableStdin = false;
      current.ready = true;
      current.loginStage = 'ready';
      bootScreen.dataset.state = 'ready';
      terminalView.setAttribute('aria-busy', 'false');
      starting = false;
      syncActivity();
      if (view === 'terminal') current.term.focus();
    });
  }, stage === 'art' ? 400 : 800);
}
function renderBoot(current) {
  if (session !== current || current.ready || current.failed) return;
  const now = performance.now();
  advanceBoot(current.sequence, current.steps, now);
  const { index, doneAt, complete, lines: bootLines } = current.sequence;
  const lines = bootLines.slice(0, Math.min(index + 1, bootLines.length)).map((line, number) => {
    const done = complete || number < index || (number === index && doneAt !== null);
    const row = document.createElement('span');
    row.className = 'boot-line';
    if (line.kind) row.dataset.kind = line.kind;
    const marker = document.createElement('span');
    marker.className = done ? 'boot-marker is-done' : 'boot-marker';
    marker.textContent = done ? '[ ok ]' : '[ .. ]';
    row.append(marker, document.createTextNode(` ${done ? line.done : line.text}\n`));
    return row;
  });
  $('#boot-log').replaceChildren(...lines);
  if (current.stopping) {
    if (complete) {
      clearInterval(current.bootTimer);
      bootScreen.dataset.state = 'off';
      $('#boot-log').replaceChildren();
      current.rebootTimer = setTimeout(() => {
        if (session === current) start();
      }, 750);
    }
  } else finishBoot(current);
}
function bootStep(current, index, state) {
  current.steps[index] = state;
  renderBoot(current);
}

async function reboot(current) {
  if (session !== current) return;
  current.ready = false;
  current.stopping = true;
  current.term.options.disableStdin = true;
  current.term.blur();
  clearTimeout(current.flushTimer);
  current.pending.length = 0;
  current.sequence = createShutdownSequence(performance.now());
  current.steps = ['running'];
  setStatus('Restarting…');
  terminalView.setAttribute('aria-busy', 'true');
  bootScreen.dataset.state = 'stopping';
  bootScreen.hidden = false;
  bootScreen.scrollTop = 0;
  $('#open-link').hidden = true;
  $('.topbar').classList.remove('has-guest-link');
  current.bootTimer = setInterval(() => renderBoot(current), 80);
  renderBoot(current);
  await current.vm.stop();
  if (session === current) bootStep(current, 0, 'done');
}

async function start() {
  if (starting) return;
  starting = true;
  const run = ++generation;
  setStatus('Starting…');
  bootScreen.hidden = false;
  bootScreen.dataset.state = 'loading';
  $('#boot-log').textContent = '[ .. ] Starting…';
  $('#boot-error').hidden = true;
  terminalView.setAttribute('aria-busy', 'true');
  await dispose();
  if (run !== generation) return;
  const imageFiles = ['seabios.bin', 'vgabios.bin', 'buildroot-bzimage68.bin', 'portfolio.cpio.gz', 'v86.wasm'];
  const current = {
    abort: new AbortController(), ready: false, pending: [], flushing: false,
    loginBuffer: createLoginBuffer(),
    sequence: createBootSequence(performance.now()), artReady: false,
    steps: bootSteps.map(() => 'waiting'),
  };
  session = current;
  $('#boot-error').hidden = true;
  bootScreen.hidden = false;
  terminalView.setAttribute('aria-busy', 'true');
  $('#open-link').hidden = true;
  $('.topbar').classList.remove('has-guest-link');
  $('#terminal-screen').replaceChildren();
  setStatus('Downloading…');
  bootStep(current, 0, 'running');
  bootStep(current, 1, 'running');
  current.bootTimer = setInterval(() => renderBoot(current), 120);
  let failed = false;
  async function fail(error) {
    if (run !== generation || failed) return;
    failed = true;
    current.failed = true;
    clearInterval(current.bootTimer);
    bootScreen.dataset.state = 'failed';
    starting = false;
    setStatus('Connection failed');
    $('#boot-error').textContent = 'Could not start your session. Refresh the page to try again, or Browse the portfolio.';
    $('#boot-error').hidden = false;
    bootScreen.hidden = false;
    terminalView.setAttribute('aria-busy', 'false');
    console.error('Portfolio VM:', error);
    await dispose();
  }
  current.timeout = setTimeout(() => fail(new Error('Guest boot timed out')), config.bootTimeoutMs);
  try {
    if (typeof WebAssembly === 'undefined') throw new Error('WebAssembly is unavailable');
    const load = async name => {
      const response = await fetch(config.base + name, { signal: current.abort.signal });
      if (!response.ok) throw new Error(`Could not load ${name}: HTTP ${response.status}`);
      return response.arrayBuffer();
    };
    const runtime = Promise.all([
      import(config.base + 'libv86.mjs'), import(config.base + 'xterm.mjs'),
      import(config.base + 'addon-fit.mjs'), import(config.base + 'addon-web-links.mjs')
    ]).then(modules => { bootStep(current, 0, 'done'); return modules; });
    const images = Promise.all(imageFiles.map(load)).then(files => { bootStep(current, 1, 'done'); return files; });
    const [[{ V86 }, { Terminal }, { FitAddon }, { WebLinksAddon }], [bios, vga, kernel, initrd, wasm]] = await Promise.all([runtime, images]);
    if (run !== generation || failed) return;
    bootStep(current, 2, 'running');
    setStatus('Preparing…');
    let module;
    try { module = await WebAssembly.compile(wasm); }
    catch { module = await WebAssembly.compile(await load('v86-fallback.wasm')); }
    if (run !== generation || failed) return;
    await document.fonts.ready;
    if (run !== generation || failed) return;
    const term = current.term = new Terminal({
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: matchMedia('(max-width: 650px)').matches ? 14 : 16, lineHeight: 1.2,
      cursorBlink: !reducedMotion.matches,
      cursorStyle: 'block', scrollback: 3000, screenReaderMode: true, disableStdin: true,
      theme: { background: '#0b0e0c', foreground: '#cdd6cf', cursor: '#9cdaa9', selectionBackground: '#31533b',
        black: '#0b0e0c', red: '#ecaa98', green: '#9cdaa9', yellow: '#d8c98b', blue: '#99b9ed', magenta: '#c3a6d9', cyan: '#91cccf', white: '#cdd6cf',
        brightBlack: '#90a095', brightRed: '#f7bbac', brightGreen: '#b7edc2', brightYellow: '#eddd9e', brightBlue: '#b4ceff', brightMagenta: '#dcc0ef', brightCyan: '#b2e3e4', brightWhite: '#eff5f0' },
      // Relative site links and mailto use the same strict URL validation as web links.
      linkHandler: { activate: activateLink, allowNonHttpProtocols: true }
    });
    const fit = current.fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon(activateLink));
    term.open($('#terminal-screen'));
    term.attachCustomKeyEventHandler(event => {
      if (event.key === 'Tab' && event.shiftKey) return false;
      const key = event.key.toLowerCase();
      if (!event.altKey && (event.ctrlKey || event.metaKey)) {
        // Let the browser deliver paste events instead of sending Ctrl+V to Linux.
        if (key === 'v') return false;
        if (key === 'c') {
          if (event.ctrlKey && event.shiftKey) {
            if (event.type === 'keydown') {
              event.preventDefault();
              // Use the native copy event, including on browsers without Clipboard API access.
              if (term.hasSelection()) document.execCommand('copy');
            }
            return false;
          }
          // With no selection, plain Ctrl+C remains the terminal interrupt key.
          if (term.hasSelection()) return false;
        }
      }
      return true;
    });
    // Clipboard actions require a browser gesture; no guest clipboard or arbitrary JS bridge.
    term.parser.registerOscHandler(777, data => {
      const message = bridgeMessage(data, location.origin);
      if (!message || session !== current || current.rebootRequested) return true;
      if (message.type === 'art' && !current.artReady) {
        current.artReady = true;
        clearTimeout(current.timeout);
        bootStep(current, 4, 'done');
      } else if (message.type === 'ready' && current.loginStage === 'printing') {
        current.loginStage = 'welcome';
        bootScreen.dataset.state = 'welcome';
        syncActivity();
      } else if (message.type === 'link') offerLink(message.value);
      else if (message.type === 'browse') { location.hash = 'portfolio'; }
      else if (message.type === 'reboot' && current.ready && !current.rebootRequested) {
        current.rebootRequested = true;
        // Begin shutdown after the terminal parser finishes this output batch.
        current.rebootTimer = setTimeout(() => {
          reboot(current);
        }, 0);
      }
      return true;
    });
    term.onData(data => { if (current.ready) current.vm.serial_send_bytes(0, new TextEncoder().encode(data)); });
    term.onBinary(data => { if (current.ready) current.vm.serial_send_bytes(0, Uint8Array.from(data, char => char.charCodeAt(0))); });
    fitTerminal();
    current.observer = new ResizeObserver(() => fitTerminal());
    current.observer.observe($('#terminal-screen'));
    bootStep(current, 2, 'done');
    bootStep(current, 3, 'running');
    setStatus('Starting…');
    const vm = current.vm = new V86({
      wasm_fn: imports => WebAssembly.instantiate(module, imports).then(instance => instance.exports),
      bios: { buffer: bios }, vga_bios: { buffer: vga }, bzimage: { buffer: kernel }, initrd: { buffer: initrd },
      memory_size: config.memoryMiB * 1024 * 1024,
      cmdline: `console=ttyS0 quiet tsc=reliable mitigations=off random.trust_cpu=on portfolio.size=${term.rows}x${term.cols}`,
      uart1: true, autostart: true, disable_keyboard: true, disable_mouse: true, disable_speaker: true
      // Deliberately no network backend, host filesystem, or remote execution.
    });
    vm.add_listener('download-error', error => fail(error));
    // Bound terminal rendering when programs produce output faster than the UI.
    const flush = () => {
      if (session !== current || current.rebootRequested || current.flushing || !current.pending.length) return;
      current.flushing = true;
      const bytes = Uint8Array.from(current.pending.splice(0, 32768));
      term.write(bytes, () => {
        if (session !== current || current.rebootRequested) return;
        current.flushing = false;
        if (current.backpressure && current.pending.length < 32768) { current.backpressure = false; if (!document.hidden && view === 'terminal') vm.run(); }
        if (current.pending.length) current.flushTimer = setTimeout(flush, 0);
      });
    };
    vm.add_listener('serial0-output-byte', byte => {
      if (session !== current || current.rebootRequested) return;
      if (current.steps[3] === 'running') {
        bootStep(current, 3, 'done');
        bootStep(current, 4, 'running');
        setStatus('Logging in…');
      }
      if (!current.loginBuffer.accept(byte)) return;
      current.pending.push(byte);
      if (current.pending.length === 1) current.flushTimer = setTimeout(flush, 0);
      if (current.pending.length > 131072 && !current.backpressure) { current.backpressure = true; vm.stop(); }
    });
  } catch (error) { await fail(error); }
}
addEventListener('pagehide', () => { generation++; starting = false; dispose(); });
addEventListener('pageshow', event => { if (event.persisted) followHash(); });
followHash();
