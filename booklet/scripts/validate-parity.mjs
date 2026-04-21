#!/usr/bin/env node
/**
 * Saddle-stitch parity validator. Run as the first step of `npm run pdf` so
 * a parity regression never reaches the print shop.
 *
 * Loads `src/manifest.ts` via regex-based parsing (rather than tsx / esbuild)
 * so the validator has zero dev-dependency overhead. The manifest is
 * deliberately data-only for this to work — see the module's top comment.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = resolve(__dirname, "..", "src", "manifest.ts");

function expectedParity(num) {
  return num % 2 === 1 ? "recto" : "verso";
}

function parseManifest(src) {
  // Grab every `{ num: N, kind: "K", parity: "P", ... }` record inside the
  // `PAGES` array literal. The regex is intentionally strict — the manifest
  // is hand-authored so every entry must include num/kind/parity up front.
  const arrMatch = src.match(
    /export const PAGES\s*:\s*readonly PageSpec\[\][^=]*=\s*\[([\s\S]*?)\]\s*as const;/,
  );
  if (!arrMatch) {
    throw new Error("could not find `export const PAGES` array in manifest.ts");
  }
  const body = arrMatch[1];
  const pages = [];
  const entryRe =
    /\{\s*num:\s*(\d+)\s*,\s*kind:\s*"([^"]+)"\s*,\s*parity:\s*"(recto|verso)"/g;
  let m;
  while ((m = entryRe.exec(body)) !== null) {
    pages.push({
      num: Number(m[1]),
      kind: m[2],
      parity: m[3],
    });
  }
  return pages;
}

function main() {
  const src = readFileSync(MANIFEST_PATH, "utf8");
  const pages = parseManifest(src);

  const errors = [];

  if (pages.length !== 28) {
    errors.push(`manifest must have 28 pages, got ${pages.length}`);
  }

  for (const p of pages) {
    const want = expectedParity(p.num);
    if (p.parity !== want) {
      errors.push(
        `page ${p.num}: expected parity=${want}, manifest says ${p.parity}`,
      );
    }
  }

  // Sequence check — pages must be 1..28 without gaps.
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].num !== i + 1) {
      errors.push(`page at index ${i}: expected num=${i + 1}, got ${pages[i].num}`);
    }
  }

  // Spread adjacency.
  const spreads = pages.filter((p) => p.kind === "spread");
  if (spreads.length !== 2) {
    errors.push(`expected 2 spread pages, got ${spreads.length}`);
  } else {
    const [l, r] = spreads;
    if (l.num + 1 !== r.num) {
      errors.push(
        `spread pages must be adjacent: found num=${l.num} and num=${r.num}`,
      );
    }
    if (l.parity !== "verso" || r.parity !== "recto") {
      errors.push(
        `spread pages must be verso+recto (for a facing pair); got ${l.parity}+${r.parity}`,
      );
    }
  }

  if (errors.length) {
    console.error("[validate-parity] FAILED:");
    for (const e of errors) console.error(`  · ${e}`);
    process.exit(1);
  }

  console.log(
    `[validate-parity] ok · ${pages.length} pages · parity invariants + spread adjacency hold`,
  );
}

main();
