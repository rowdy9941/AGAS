import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ui = path.join(root, 'foundations/aionui');
const sharp = createRequire(path.join(ui, 'package.json'))('sharp');
const source = path.join(root, 'brand/AGAS_Logo.jpg');
const assets = { 'resources/app.png': 1024, 'resources/app_dev.png': 1024, 'resources/icon.png': 256, 'packages/desktop/src/renderer/assets/logos/brand/app.png': 512, 'public/pwa/icon-192.png': 192, 'public/pwa/icon-512.png': 512, 'public/pwa/icon-180.png': 180 };
for (const [file, size] of Object.entries(assets)) {
  const destination = path.join(ui, file);
  mkdirSync(path.dirname(destination), { recursive: true });
  await sharp(source).resize(size, size, { fit: 'contain', background: '#000000' }).png().toFile(destination);
}
const png = await sharp(source).resize(256, 256, { fit: 'contain', background: '#000000' }).png().toBuffer();
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
writeFileSync(path.join(ui, 'resources/app.ico'), Buffer.concat([ico, png]));
const mac = await sharp(source).resize(1024, 1024, { fit: 'contain', background: '#000000' }).png().toBuffer();
const icns = Buffer.alloc(16); icns.write('icns'); icns.writeUInt32BE(16 + mac.length, 4); icns.write('ic10', 8); icns.writeUInt32BE(8 + mac.length, 12);
writeFileSync(path.join(ui, 'resources/app.icns'), Buffer.concat([icns, mac]));
console.log('AGAS artwork applied to desktop and browser icon assets.');
