const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const site = path.resolve(__dirname, '../site');

module.exports = async function buildFavicons(output = path.join(site, '_site')) {
  await fs.mkdir(output, { recursive: true });
  const source = await fs.readFile(path.join(site, 'favicon.svg'));
  const sizes = [16, 32];
  const icons = await Promise.all(sizes.map(size => sharp(source).resize(size, size).png().toBuffer()));
  const header = Buffer.alloc(6 + 16 * icons.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(icons.length, 4);
  let offset = header.length;
  for (let i = 0; i < icons.length; i++) {
    const entry = 6 + i * 16;
    header[entry] = header[entry + 1] = sizes[i];
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(icons[i].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += icons[i].length;
  }
  await Promise.all([
    fs.writeFile(path.join(output, 'favicon.svg'), source),
    fs.writeFile(path.join(output, 'favicon.ico'), Buffer.concat([header, ...icons])),
    sharp(source).resize(180, 180).flatten({ background: '#0b0e0c' }).png().toFile(path.join(output, 'apple-touch-icon.png'))
  ]);
};
