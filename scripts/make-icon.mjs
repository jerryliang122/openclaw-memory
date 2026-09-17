// Generates assets/icon.png (256x256) with zero image dependencies:
// raw RGBA buffer -> zlib deflate -> PNG chunks. Re-run with `npm run assets`.
import { crc32, deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 256;
const BACKGROUND = [0x4f, 0x46, 0xe5]; // indigo
const FOREGROUND = [0xff, 0xff, 0xff];
const CORNER_RADIUS = 56;

// M strokes as line segments in normalized [0,1] coordinates.
const STROKES = [
  [0.26, 0.24, 0.26, 0.78],
  [0.74, 0.24, 0.74, 0.78],
  [0.26, 0.24, 0.5, 0.56],
  [0.5, 0.56, 0.74, 0.24],
];
const STROKE_WIDTH = 0.17;

function distanceToSegment(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function inRoundedSquare(x, y) {
  const cx = Math.abs(x - 0.5);
  const cy = Math.abs(y - 0.5);
  const inner = 0.5 - CORNER_RADIUS / SIZE;
  if (cx <= inner || cy <= inner) return true;
  return Math.hypot(cx - inner, cy - inner) <= CORNER_RADIUS / SIZE;
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1)); // +1 filter byte per scanline
for (let y = 0; y < SIZE; y++) {
  const row = y * (SIZE * 4 + 1);
  raw[row] = 0; // filter: none
  for (let x = 0; x < SIZE; x++) {
    const nx = x / (SIZE - 1);
    const ny = y / (SIZE - 1);
    const pixel = row + 1 + x * 4;
    const [r, g, b] =
      STROKES.some((s) => distanceToSegment(nx, ny, s) <= STROKE_WIDTH / 2)
        ? FOREGROUND
        : BACKGROUND;
    raw[pixel] = r;
    raw[pixel + 1] = g;
    raw[pixel + 2] = b;
    raw[pixel + 3] = inRoundedSquare(nx, ny) ? 0xff : 0x00;
  }
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "icon.png"), png);
console.log(`wrote assets/icon.png (${png.length} bytes)`);
