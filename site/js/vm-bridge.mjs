export function safeLink(value, origin) {
  if (typeof value !== 'string' || value.length > 2048 || /[\x00-\x20\x7f\\]/.test(value) || /%0[ad0]/i.test(value)) return null;
  if (!/^(https?:\/\/|mailto:|\/(?!\/))/.test(value)) return null;
  try {
    const url = new URL(value, origin);
    if (!['https:', 'http:', 'mailto:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

export function bridgeMessage(data, origin) {
  if (typeof data !== 'string' || data.length > 4096) return null;
  if (data === 'art' || data === 'ready' || data === 'browse' || data === 'reboot') return { type: data };
  if (data.startsWith('open=')) {
    try {
      const raw = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(data.slice(5)), char => char.charCodeAt(0)));
      const url = safeLink(raw, origin);
      if (url) return { type: 'link', value: url };
    } catch { /* Invalid guest data is ignored. */ }
  }
  return null;
}
