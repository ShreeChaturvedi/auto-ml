/**
 * Byte-reproducible side-effects for real-component rendering inside Remotion.
 *
 * Real frontend components reach for nondeterministic globals (Math.random,
 * Date.now, matchMedia, IntersectionObserver). Remotion renders each frame as
 * an isolated snapshot, so without pinning those we get pixel drift between
 * renders. This module patches all four once (idempotent) and is imported at
 * the top of `remotion/Root.tsx` and any scene that mounts real components.
 *
 * Seed: sum of char codes in "Ayush" = 89 + 121 + 117 + 115 + 104 = 546.
 * Frozen wall clock: 2026-04-15T15:30:00-04:00 — hits the "Good afternoon"
 * branch in HomePage.tsx's getGreeting().
 */

const FLAG = "__automlDeterminismApplied__";
const SEED = 89 + 121 + 117 + 115 + 104; // "Ayush" → 546
const FROZEN_EPOCH = Date.parse("2026-04-15T15:30:00-04:00");

/** Simple LCG — fast, pure, and stable across JS engines. */
function createLcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function applyDeterminism(): void {
  const g = globalThis as typeof globalThis & Record<string, unknown>;
  if (g[FLAG]) return;
  g[FLAG] = true;

  // --- Math.random → seeded LCG -------------------------------------------
  const rng = createLcg(SEED);
  Math.random = rng;

  // --- Date → frozen wall clock for no-arg constructor + Date.now() --------
  const RealDate = Date;
  class FrozenDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(FROZEN_EPOCH);
      } else {
        // @ts-expect-error spread into Date forwards to real parsing ctor
        super(...args);
      }
    }
    static override now(): number {
      return FROZEN_EPOCH;
    }
  }
  // Preserve parse/UTC/other statics
  Object.getOwnPropertyNames(RealDate).forEach((key) => {
    if (key in FrozenDate) return;
    const descriptor = Object.getOwnPropertyDescriptor(RealDate, key);
    if (descriptor) Object.defineProperty(FrozenDate, key, descriptor);
  });
  (globalThis as unknown as { Date: DateConstructor }).Date =
    FrozenDate as unknown as DateConstructor;

  // --- Browser-only globals below — guarded for Node SSR passes -----------
  if (typeof window === "undefined") return;

  // matchMedia → always-not-matching stub with the listener surface
  window.matchMedia = (media: string) => {
    const noop = () => undefined;
    return {
      matches: false,
      media,
      onchange: null,
      addListener: noop,
      removeListener: noop,
      addEventListener: noop,
      removeEventListener: noop,
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  };

  // IntersectionObserver → no-op class so hooks like react-intersection
  // can instantiate without throwing and never fire callbacks.
  class NoopIntersectionObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
    root: Element | Document | null = null;
    rootMargin = "0px";
    thresholds: ReadonlyArray<number> = [];
  }
  (
    window as unknown as { IntersectionObserver: typeof IntersectionObserver }
  ).IntersectionObserver =
    NoopIntersectionObserver as unknown as typeof IntersectionObserver;
}

applyDeterminism();
