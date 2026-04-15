/**
 * make-placeholder-landing.ts — generates a placeholder PNG + empty
 * hotspots.json for `video/public/landing/`, so LandingScreen can render
 * SOMETHING in dev before the real Playwright capture has run.
 *
 * Produces a small solid-black PNG using only node built-ins (no `sharp`
 * dependency). The PNG is intentionally tiny — the LandingScreen will
 * stretch it to comp width. Run `npm run capture:landing` to replace
 * these placeholders with real landing content.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "public", "landing");
const SECTIONS_DIR = path.join(OUT_DIR, "sections");

// ---------------------------------------------------------------------------
// Minimal PNG encoder — solid-color, RGBA, no filters, deflate-compressed.
// Enough to satisfy `<Img>` loading in jsdom + Remotion's bundler.
// ---------------------------------------------------------------------------

function u32BE(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuf, data]);
  // CRC32 via a lookup table (standard PNG CRC algorithm).
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of crcInput) crc = (table[(crc ^ b) & 0xff]! ^ (crc >>> 8)) >>> 0;
  crc = (crc ^ 0xffffffff) >>> 0;
  return Buffer.concat([u32BE(data.length), typeBuf, data, u32BE(crc)]);
}

function encodePng(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.concat([
    u32BE(width),
    u32BE(height),
    Buffer.from([8, 6, 0, 0, 0]), // 8-bit, color-type 6 (RGBA), no interlace
  ]);
  // Raw image data: each scanline prefixed with filter byte 0 (None).
  const scanline = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(
      Array.from({ length: width }, () => [rgba[0], rgba[1], rgba[2], rgba[3]]).flat(),
    ),
  ]);
  const raw = Buffer.concat(Array.from({ length: height }, () => scanline));
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

async function main(): Promise<void> {
  await mkdir(SECTIONS_DIR, { recursive: true });

  const fullPath = path.join(OUT_DIR, "landing-full.png");
  const hotspotsPath = path.join(OUT_DIR, "hotspots.json");

  // Solid #0A0A0B background — the landing's --bg color.
  const png = encodePng(1440, 4000, [10, 10, 11, 255]);

  if (!existsSync(fullPath)) {
    await writeFile(fullPath, png);
    console.log(`[placeholder] wrote ${fullPath} (${png.length} bytes)`);
  } else {
    console.log(`[placeholder] ${fullPath} already exists, leaving alone`);
  }

  if (!existsSync(hotspotsPath)) {
    await writeFile(hotspotsPath, "{}\n");
    console.log(`[placeholder] wrote empty hotspots.json`);
  } else {
    console.log(`[placeholder] hotspots.json already exists, leaving alone`);
  }

  // Also write placeholder section crops so LandingScreen's zoom code doesn't
  // fail on missing files. Match the background color.
  const tiny = encodePng(64, 64, [10, 10, 11, 255]);
  for (const name of ["hero", "features", "footer"]) {
    const p = path.join(SECTIONS_DIR, `${name}.png`);
    if (!existsSync(p)) {
      await writeFile(p, tiny);
      console.log(`[placeholder] wrote ${p}`);
    }
  }

  // Sanity: hash the full PNG so reviewers can tell placeholder-vs-real at a glance.
  const hash = createHash("sha1").update(png).digest("hex").slice(0, 8);
  console.log(`[placeholder] landing-full.png sha1=${hash}…`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
