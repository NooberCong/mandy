// Generates assets/icon.ico and assets/icon.png — run once before building.
// Design: dark (#0d0d0d) rounded square, amber (#c9a84c) "M" lettermark.
// No external dependencies — uses only Node built-ins.

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const DARK  = [0x0d, 0x0d, 0x0d, 0xff];
const AMBER = [0xc9, 0xa8, 0x4c, 0xff];

// 5×7 M letterform
const M_ROWS = [
  [1,0,0,0,1],
  [1,1,0,1,1],
  [1,0,1,0,1],
  [1,0,0,0,1],
  [1,0,0,0,1],
  [1,0,0,0,1],
  [1,0,0,0,1],
];

function makePixels(size) {
  const buf = Buffer.alloc(size * size * 4);
  const r   = Math.round(size * 0.18); // corner radius

  function inRoundedSquare(x, y) {
    const cx = Math.min(x, size - 1 - x);
    const cy = Math.min(y, size - 1 - y);
    if (cx >= r || cy >= r) return true;
    return (cx - r) ** 2 + (cy - r) ** 2 <= r ** 2;
  }

  const cols = M_ROWS[0].length, rows = M_ROWS.length;
  const gW = size * 0.58, gH = size * 0.70;
  const gX = (size - gW) / 2, gY = (size - gH) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (!inRoundedSquare(x, y)) { buf.writeUInt32BE(0, i); continue; }

      const col = (x - gX) / (gW / cols);
      const row = (y - gY) / (gH / rows);
      const on  = col >= 0 && col < cols && row >= 0 && row < rows
                  && M_ROWS[Math.floor(row)][Math.floor(col)] === 1;

      const [r2, g2, b2, a2] = on ? AMBER : DARK;
      buf[i] = r2; buf[i+1] = g2; buf[i+2] = b2; buf[i+3] = a2;
    }
  }
  return buf;
}

// ---- CRC32 for PNG chunks ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(bufs) {
  let c = 0xffffffff;
  for (const buf of bufs) for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- PNG encoder ----
function encodePNG(size, rgba) {
  const sig = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);

  function chunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const lenBuf  = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length);
    const crcBuf  = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32([typeBuf, data]));
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  // Raw scanlines: filter byte 0 + RGBA row
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

// ---- ICO encoder (PNG-compressed entries, Windows Vista+) ----
function encodeICO(sizes) {
  const entries = sizes.map(sz => ({ sz, png: encodePNG(sz, makePixels(sz)) }));
  const count   = entries.length;

  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0);
  icoHeader.writeUInt16LE(1, 2); // ICO
  icoHeader.writeUInt16LE(count, 4);

  let offset = 6 + count * 16;
  const dirBufs = entries.map(({ sz, png }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(sz >= 256 ? 0 : sz, 0);
    e.writeUInt8(sz >= 256 ? 0 : sz, 1);
    e.writeUInt8(0, 2); e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });

  return Buffer.concat([icoHeader, ...dirBufs, ...entries.map(e => e.png)]);
}

// ---- Output ----
const assetsDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

fs.writeFileSync(path.join(assetsDir, 'icon.ico'), encodeICO([16, 32, 48, 256]));
console.log('Created assets/icon.ico  (16, 32, 48, 256 px)');

fs.writeFileSync(path.join(assetsDir, 'icon.png'), encodePNG(512, makePixels(512)));
console.log('Created assets/icon.png  (512x512)');
