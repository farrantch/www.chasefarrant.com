// Deterministic Linux newc initramfs writer. No host root privileges or cpio required.
const fs = require('node:fs');
const path = require('node:path');

function archive(files) {
  const entries = new Map();
  for (const file of files) {
    if (!file.path || file.path.startsWith('/') || file.path.includes('\0') || file.path.split('/').some(part => part === '..' || part === '.' || !part)) throw new Error(`Invalid guest path: ${file.path}`);
    const parts = file.path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const directory = parts.slice(0, i).join('/');
      if (entries.has(directory) && (entries.get(directory).mode & 0o170000) !== 0o040000) throw new Error(`Guest path is not a directory: ${directory}`);
      const guestDirectory = directory === 'home/guest' || directory.startsWith('home/guest/');
      if (!entries.has(directory)) entries.set(directory, { path: directory, mode: 0o40755, uid: guestDirectory ? 1000 : 0, gid: guestDirectory ? 1000 : 0 });
    }
    if (entries.has(file.path)) throw new Error(`Duplicate guest path: ${file.path}`);
    entries.set(file.path, file);
  }
  const chunks = [];
  let inode = 1;
  for (const file of [...entries.values(), { path: 'TRAILER!!!', mode: 0 }]) {
    const name = Buffer.from(file.path + '\0');
    const data = Buffer.from(file.data || file.text || '');
    const fields = [inode++, file.mode ?? 0o100644, file.uid || 0, file.gid || 0, 1, 0, data.length, 0, 0, 0, 0, name.length, 0];
    const header = Buffer.from('070701' + fields.map(value => value.toString(16).padStart(8, '0')).join(''));
    chunks.push(header, name, Buffer.alloc((4 - (header.length + name.length) % 4) % 4), data, Buffer.alloc((4 - data.length % 4) % 4));
  }
  return Buffer.concat(chunks);
}

function readOverlay(root, relative = '') {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) return readOverlay(root, name);
    if (!entry.isFile()) throw new Error(`Unsupported overlay entry: ${name}`);
    const executable = name.startsWith('usr/local/bin/') || name.startsWith('etc/init.d/');
    return [{ path: name, data: fs.readFileSync(path.join(root, name)), mode: executable ? 0o100755 : name === 'etc/shadow' ? 0o100600 : 0o100644 }];
  });
}
module.exports = { archive, readOverlay };
