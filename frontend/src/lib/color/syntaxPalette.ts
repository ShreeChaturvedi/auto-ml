/**
 * Adaptive Syntax Palette
 *
 * OKLCH-based syntax highlighting that adapts to any project accent color.
 * Pipeline: OKLCH -> OKLab -> LMS -> linear sRGB -> sRGB -> hex
 * Uses Ottosson's exact D65 matrices with binary-search gamut clamping.
 */

export interface SyntaxPalette {
  keyword: string;
  function: string;
  string: string;
  number: string;
  type: string;
  operator: string;
  comment: string;
  identifier: string;
  punctuation: string;
  cursor: string;
  selectionBg: string;
  lineHighlight: string;
}

// ── OKLCH -> hex pipeline ─────────────────────────────────────────────────

function oklchToOklab(L: number, C: number, h: number): [number, number, number] {
  const hRad = (h * Math.PI) / 180;
  return [L, C * Math.cos(hRad), C * Math.sin(hRad)];
}

function oklabToLinearSrgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function inGamut(r: number, g: number, b: number): boolean {
  return r >= -0.001 && r <= 1.001 && g >= -0.001 && g <= 1.001 && b >= -0.001 && b <= 1.001;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function oklchToHex(L: number, C: number, h: number): string {
  let rgb = oklabToLinearSrgb(...oklchToOklab(L, C, h));
  if (!inGamut(...rgb)) {
    let lo = 0, hi = C;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      rgb = oklabToLinearSrgb(...oklchToOklab(L, mid, h));
      if (inGamut(...rgb)) lo = mid; else hi = mid;
    }
    rgb = oklabToLinearSrgb(...oklchToOklab(L, lo, h));
  }
  const [r, g, b] = rgb.map(c => Math.round(clamp01(linearToSrgb(c)) * 255));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ── Token definitions ─────────────────────────────────────────────────────

interface TokenDef {
  hueOffset: number;
  darkL: number; darkC: number;
  lightL: number; lightC: number;
}

type SyntaxTokenKey = 'keyword' | 'function' | 'string' | 'number' | 'type' | 'operator' | 'comment' | 'identifier' | 'punctuation';

const TOKEN_DEFS: Record<SyntaxTokenKey, TokenDef> = {
  keyword:     { hueOffset: 0,   darkL: 0.80, darkC: 0.14, lightL: 0.38, lightC: 0.14 },
  function:    { hueOffset: 120, darkL: 0.74, darkC: 0.14, lightL: 0.42, lightC: 0.14 },
  string:      { hueOffset: 200, darkL: 0.74, darkC: 0.14, lightL: 0.42, lightC: 0.14 },
  number:      { hueOffset: 280, darkL: 0.74, darkC: 0.14, lightL: 0.42, lightC: 0.14 },
  type:        { hueOffset: 60,  darkL: 0.74, darkC: 0.13, lightL: 0.43, lightC: 0.13 },
  operator:    { hueOffset: 0,   darkL: 0.65, darkC: 0.05, lightL: 0.52, lightC: 0.05 },
  comment:     { hueOffset: 0,   darkL: 0.52, darkC: 0.03, lightL: 0.50, lightC: 0.03 },
  identifier:  { hueOffset: 0,   darkL: 0.82, darkC: 0.00, lightL: 0.20, lightC: 0.00 },
  punctuation: { hueOffset: 0,   darkL: 0.55, darkC: 0.02, lightL: 0.55, lightC: 0.02 },
};

// ── Public API ────────────────────────────────────────────────────────────

export function computeSyntaxPalette(hue: number, isDark: boolean): SyntaxPalette {
  const tokens = {} as Record<SyntaxTokenKey, string>;
  for (const [token, def] of Object.entries(TOKEN_DEFS) as [SyntaxTokenKey, TokenDef][]) {
    const h = (hue + def.hueOffset) % 360;
    tokens[token] = oklchToHex(isDark ? def.darkL : def.lightL, isDark ? def.darkC : def.lightC, h);
  }
  return {
    ...tokens,
    cursor: oklchToHex(isDark ? 0.75 : 0.45, 0.15, hue),
    selectionBg: oklchToHex(isDark ? 0.35 : 0.85, 0.06, hue) + '44',
    lineHighlight: isDark ? '#121212' : '#fafafa',
  };
}

export const STATIC_SYNTAX_PALETTE: { dark: SyntaxPalette; light: SyntaxPalette } = {
  dark: {
    keyword: '#ff7b72', function: '#d2a8ff', string: '#a5d6ff', number: '#79c0ff',
    type: '#ffa657', operator: '#ff7b72', comment: '#8b949e',
    identifier: '#e6edf3', punctuation: '#8b949e',
    cursor: '#58a6ff', selectionBg: '#264f7844', lineHighlight: '#121212',
  },
  light: {
    keyword: '#cf222e', function: '#8250df', string: '#0a3069', number: '#0550ae',
    type: '#953800', operator: '#cf222e', comment: '#6e7781',
    identifier: '#1f2328', punctuation: '#6e7781',
    cursor: '#0969da', selectionBg: '#0969da22', lineHighlight: '#fafafa',
  },
};

export type SyntaxThemeId = 'adaptive-dark' | 'adaptive-light' | 'static-dark' | 'static-light';

// ── Adaptive preference persistence ───────────────────────────────────────

const PREF_KEY = 'automl-adaptive-syntax';

export function getAdaptiveSyntaxPref(): boolean {
  return localStorage.getItem(PREF_KEY) !== 'false';
}

export function setAdaptiveSyntaxPref(v: boolean): void {
  localStorage.setItem(PREF_KEY, String(v));
  window.dispatchEvent(new StorageEvent('storage', { key: PREF_KEY, newValue: String(v) }));
}

export function subscribeAdaptivePref(cb: () => void): () => void {
  const handler = (e: StorageEvent) => { if (e.key === PREF_KEY) cb(); };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

// ── CSS variable helpers ──────────────────────────────────────────────────

function hexToHslVar(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `0 0% ${Math.round(l * 100)}%`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const SYN_TOKENS = ['keyword', 'function', 'string', 'number', 'type', 'operator', 'comment', 'identifier', 'punctuation'] as const;

export function setSynVarsFromPalette(root: HTMLElement, palette: SyntaxPalette): void {
  for (const token of SYN_TOKENS) {
    root.style.setProperty(`--syn-${token}`, hexToHslVar(palette[token]));
  }
}

