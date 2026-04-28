/**
 * The booklet's page registry — single source of truth for ordering, parity,
 * and page-kind dispatch. Pure data: the validator script and the runtime
 * `Booklet.tsx` both consume this file, so it must stay JSX-free.
 *
 * Saddle-stitch parity (28-page book): page 01 is a recto (odd index + 1),
 * pages 02/03/04… alternate verso/recto. The validator in
 * `scripts/validate-parity.mjs` enforces this at PDF-export time.
 *
 * Two-page spreads (kind: "spread") MUST be a verso+recto pair on adjacent
 * indices so they face each other once bound.
 */

import type { SectionKey } from "./theme";

// Explicitly typed `kind` slots so a missing discriminant fails at build.
export type PageKind =
  | "cover"
  | "back-cover"
  | "endpaper"
  | "toc"
  | "divider"
  | "phase"
  | "body"
  | "spread";

/** Body-page kinds — one per unique body content module. */
export type BodyKey =
  | "eighty-percent"
  | "why-now"
  | "what-changed"
  | "three-pillars"
  | "preprocessing-fsm"
  | "mcp-registry"
  | "sandbox"
  | "speed"
  | "quality-guardrails"
  | "team"
  | "closing";

export type PageSpec =
  | { num: 1;  kind: "cover";      parity: "recto"; sectionKey: null }
  | { num: 2;  kind: "endpaper";   parity: "verso"; sectionKey: null }
  | { num: 3;  kind: "toc";        parity: "recto"; sectionKey: null }
  | {
      num: number;
      kind: "divider";
      parity: "recto" | "verso";
      sectionKey: SectionKey;
      chapterNum: string;
      chapterTitle: string;
      subtitle: string;
      artSlot: string;
      chapterIndex: number;
      chapterTotal: number;
    }
  | {
      num: number;
      kind: "phase";
      parity: "recto" | "verso";
      sectionKey: SectionKey;
      phaseIndex: number;
    }
  | {
      num: number;
      kind: "body";
      parity: "recto" | "verso";
      sectionKey: SectionKey;
      body: BodyKey;
    }
  | {
      num: number;
      kind: "spread";
      parity: "recto" | "verso";
      sectionKey: SectionKey;
      half: "left" | "right";
    }
  | { num: 28; kind: "back-cover"; parity: "verso"; sectionKey: null };

// ---------------------------------------------------------------------------
// Manifest — the 28 pages, in order.
// ---------------------------------------------------------------------------

export const PAGES: readonly PageSpec[] = [
  { num: 1,  kind: "cover",      parity: "recto", sectionKey: null },
  { num: 2,  kind: "endpaper",   parity: "verso", sectionKey: null },
  { num: 3,  kind: "toc",        parity: "recto", sectionKey: null },

  {
    num: 4, kind: "divider", parity: "verso", sectionKey: "01_WHY",
    chapterNum: "01", chapterTitle: "WHY",
    subtitle: "data science is mostly not data science",
    artSlot: "/art/div-01-why.svg",
    chapterIndex: 1, chapterTotal: 5,
  },
  { num: 5,  kind: "body", parity: "recto", sectionKey: "01_WHY", body: "eighty-percent" },
  { num: 6,  kind: "body", parity: "verso", sectionKey: "01_WHY", body: "why-now" },
  { num: 7,  kind: "body", parity: "recto", sectionKey: "01_WHY", body: "what-changed" },

  {
    num: 8, kind: "divider", parity: "verso", sectionKey: "02_HOW",
    chapterNum: "02", chapterTitle: "HOW",
    subtitle: "talk to it · plan with it · own the notebook",
    artSlot: "/art/div-02-how.svg",
    chapterIndex: 2, chapterTotal: 5,
  },
  { num: 9,  kind: "body",  parity: "recto", sectionKey: "02_HOW", body: "three-pillars" },
  { num: 10, kind: "phase", parity: "verso", sectionKey: "02_HOW", phaseIndex: 0 },
  { num: 11, kind: "phase", parity: "recto", sectionKey: "02_HOW", phaseIndex: 1 },
  { num: 12, kind: "phase", parity: "verso", sectionKey: "02_HOW", phaseIndex: 2 },
  { num: 13, kind: "phase", parity: "recto", sectionKey: "02_HOW", phaseIndex: 3 },
  { num: 14, kind: "phase", parity: "verso", sectionKey: "02_HOW", phaseIndex: 4 },
  { num: 15, kind: "phase", parity: "recto", sectionKey: "02_HOW", phaseIndex: 5 },

  {
    num: 16, kind: "divider", parity: "verso", sectionKey: "03_INSIDE",
    chapterNum: "03", chapterTitle: "INSIDE",
    subtitle: "the engine room",
    artSlot: "/art/div-03-inside.svg",
    chapterIndex: 3, chapterTotal: 5,
  },
  { num: 17, kind: "body", parity: "recto", sectionKey: "03_INSIDE", body: "preprocessing-fsm" },
  { num: 18, kind: "body", parity: "verso", sectionKey: "03_INSIDE", body: "mcp-registry" },
  { num: 19, kind: "body", parity: "recto", sectionKey: "03_INSIDE", body: "sandbox" },

  {
    num: 20, kind: "divider", parity: "verso", sectionKey: "04_PROOF",
    chapterNum: "04", chapterTitle: "PROOF",
    subtitle: "what we measured · how it landed",
    artSlot: "/art/div-04-proof.svg",
    chapterIndex: 4, chapterTotal: 5,
  },
  { num: 21, kind: "body", parity: "recto", sectionKey: "04_PROOF", body: "speed" },
  { num: 22, kind: "body", parity: "verso", sectionKey: "04_PROOF", body: "quality-guardrails" },

  {
    num: 23, kind: "divider", parity: "recto", sectionKey: "05_BUILD",
    chapterNum: "05", chapterTitle: "BUILD",
    subtitle: "eleven months · two engineers · 1,989 commits",
    artSlot: "/art/div-05-build.svg",
    chapterIndex: 5, chapterTotal: 5,
  },
  { num: 24, kind: "spread", parity: "verso", sectionKey: "05_BUILD", half: "left"  },
  { num: 25, kind: "spread", parity: "recto", sectionKey: "05_BUILD", half: "right" },
  { num: 26, kind: "body",   parity: "verso", sectionKey: "05_BUILD", body: "team"    },
  { num: 27, kind: "body",   parity: "recto", sectionKey: "05_BUILD", body: "closing" },

  { num: 28, kind: "back-cover", parity: "verso", sectionKey: null },
] as const;

// ---------------------------------------------------------------------------
// Invariants — enforced at validate-parity.mjs time. Keep as exported
// functions so both the validator script and runtime checks can share them.
// ---------------------------------------------------------------------------

/** Expected parity for a given 1-based page index: recto on odd, verso on even. */
export function expectedParity(num: number): "recto" | "verso" {
  return num % 2 === 1 ? "recto" : "verso";
}

/** Assert manifest invariants. Throws the first failure it encounters. */
export function assertManifestInvariants(): void {
  if (PAGES.length !== 28) {
    throw new Error(`manifest must have 28 pages, got ${PAGES.length}`);
  }
  for (const p of PAGES) {
    if (p.parity !== expectedParity(p.num)) {
      throw new Error(
        `page ${p.num}: expected ${expectedParity(p.num)}, manifest says ${p.parity}`,
      );
    }
  }
  // Every "spread" must be adjacent to its sibling half.
  const spreads = PAGES.filter((p) => p.kind === "spread");
  if (spreads.length !== 2) {
    throw new Error(`expected exactly 2 spread pages, got ${spreads.length}`);
  }
  const [l, r] = spreads;
  if (!l || !r) throw new Error("spread pages missing");
  if (l.num + 1 !== r.num) {
    throw new Error(
      `spread pages must be adjacent: got num=${l.num} and num=${r.num}`,
    );
  }
  // And must face each other (verso then recto).
  if (l.parity !== "verso" || r.parity !== "recto") {
    throw new Error(
      `spread pages must be verso+recto; got ${l.parity}+${r.parity}`,
    );
  }
}
