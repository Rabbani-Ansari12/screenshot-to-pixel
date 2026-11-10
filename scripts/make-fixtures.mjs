// Writes the small synthetic PNG fixtures used by supabase/functions/process-document/pipeline.test.ts.
// The images only need distinct bytes (and hashes); the test's mocked model decides what each "shows".
//   node scripts/make-fixtures.mjs
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

/** Grey "paper" with dark text-like bars; blur softens the edges. */
function png(seed, { blur = false } = {}) {
  const w = 240;
  const h = 160;
  const raw = Buffer.alloc((w + 1) * h);
  let s = seed;
  const rand = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const bars = Array.from({ length: 9 }, (_, i) => ({
    y: 14 + i * 15,
    x: 12,
    len: 60 + Math.floor(rand() * 150),
  }));
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0;
    for (let x = 0; x < w; x++) {
      let v = 236;
      for (const b of bars)
        if (y >= b.y && y < b.y + 6 && x >= b.x && x < b.x + b.len && (x + seed) % 7 !== 0) v = 40;
      if (blur) v = Math.round(v * 0.55 + 236 * 0.45 + (rand() - 0.5) * 40);
      raw[y * (w + 1) + 1 + x] = Math.max(0, Math.min(255, v));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const dir = "supabase/functions/process-document/fixtures";
const files = {
  "clean-unloading.png": png(1),
  "blurry.png": png(2, { blur: true }),
  "duplicate-of-clean.png": png(3), // different photo of the same slip (same slip no. + vehicle)
  "conflicting-weights.png": png(4),
  "no-match.png": png(5),
  "vehicle-mismatch.png": png(6),
};
for (const [name, bytes] of Object.entries(files)) writeFileSync(`${dir}/${name}`, bytes);
console.log("wrote", Object.keys(files).join(", "));
