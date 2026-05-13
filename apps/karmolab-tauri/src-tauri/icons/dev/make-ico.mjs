#!/usr/bin/env node
// make-ico.mjs — dev PNGs → dev/icon.ico (PNG-in-ICO, Vista+ format, TASK-KL-039)
// 의존성 없음 — built-in fs만.
// 실행: node apps/karmolab-tauri/src-tauri/icons/dev/make-ico.mjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));

// PNG-in-ICO: 32x32 + 128x128 두 해상도
const sizes = ['32x32.png', '128x128.png'];

const pngs = sizes.map(name => {
  const path = join(__dir, name);
  if (!existsSync(path)) throw new Error(`missing: ${path} — generate.ps1 먼저 실행`);
  return readFileSync(path);
});

function readPngSize(png) {
  // PNG signature: 8 bytes, then IHDR chunk: 4 len + 4 type + 4 width + 4 height
  return { w: png.readUInt32BE(16), h: png.readUInt32BE(20) };
}

// ICO format: ICONDIR(6) + ICONDIRENTRY*N(16 each) + PNG data
const count = pngs.length;
const headerSize = 6;
const dirSize = 16 * count;
let offset = headerSize + dirSize;

const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: 1 = .ico
header.writeUInt16LE(count, 4);

const dirs = pngs.map(png => {
  const { w, h } = readPngSize(png);
  const dir = Buffer.alloc(16);
  dir.writeUInt8(w >= 256 ? 0 : w, 0);  // 0 = 256px
  dir.writeUInt8(h >= 256 ? 0 : h, 1);
  dir.writeUInt8(0, 2);  // color count (0 = truecolor)
  dir.writeUInt8(0, 3);  // reserved
  dir.writeUInt16LE(1, 4);   // planes
  dir.writeUInt16LE(32, 6);  // bit count
  dir.writeUInt32LE(png.length, 8);
  dir.writeUInt32LE(offset, 12);
  offset += png.length;
  return dir;
});

const ico = Buffer.concat([header, ...dirs, ...pngs]);
const out = join(__dir, 'icon.ico');
writeFileSync(out, ico);
console.log(`[make-ico] ${out} (${ico.length} bytes, ${count} images)`);
