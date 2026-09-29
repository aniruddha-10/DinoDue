// Draws DinoDue's icon (a gold peak with a snow cap in front of a berry peak,
// on a UCalgary-red tile) and writes public/icons/icon-{16,32,48,128}.png.
// No image libraries: shapes are rasterized with 4x4 supersampling and
// encoded as PNG with node's zlib. Run with `npm run icons`.

import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const RED = [0xd6, 0x00, 0x1c];
const BERRY = [0x9c, 0x05, 0x34];
const GOLD = [0xff, 0xcd, 0x00];
const WHITE = [0xff, 0xff, 0xff];

// Shapes on a 128x128 canvas, drawn in order (later on top).
const tile = { kind: "roundRect", x: 4, y: 4, w: 120, h: 120, r: 26, color: RED };
const shapes = [
  { kind: "poly", pts: [[58, 100], [86, 46], [114, 100]], color: BERRY },
  { kind: "poly", pts: [[14, 100], [52, 28], [90, 100]], color: GOLD },
  { kind: "poly", pts: [[41.4, 48], [52, 28], [62.6, 48], [57, 44], [52, 50], [47, 44]], color: WHITE },
];

function inRoundRect(px, py, { x, y, w, h, r }) {
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r && px >= x && px <= x + w && py >= y && py <= y + h;
}

function inPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function render(size) {
  const S = 4;
  const scale = 128 / size;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const u = (x + (sx + 0.5) / S) * scale;
          const v = (y + (sy + 0.5) / S) * scale;
          if (!inRoundRect(u, v, tile)) continue;
          let c = tile.color;
          for (const s of shapes) if (inPoly(u, v, s.pts)) c = s.color;
          r += c[0]; g += c[1]; b += c[2]; a += 1;
        }
      }
      const i = (y * size + x) * 4;
      const n = S * S;
      if (a) {
        px[i] = Math.round(r / a);
        px[i + 1] = Math.round(g / a);
        px[i + 2] = Math.round(b / a);
      }
      px[i + 3] = Math.round((a / n) * 255);
    }
  }
  return px;
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("public/icons", { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(`public/icons/icon-${size}.png`, png(size, render(size)));
  console.log(`public/icons/icon-${size}.png`);
}
