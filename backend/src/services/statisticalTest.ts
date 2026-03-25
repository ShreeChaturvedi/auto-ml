/**
 * Statistical testing utilities for model comparison
 */

/**
 * Welch's t-test for comparing two sets of cross-validation scores.
 * Returns two-tailed p-value.
 */
export function welchTTest(a: number[], b: number[]): number {
  const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = (arr: number[], m: number) =>
    arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);

  const mA = mean(a);
  const mB = mean(b);
  const vA = variance(a, mA);
  const vB = variance(b, mB);
  const nA = a.length;
  const nB = b.length;
  const se = Math.sqrt(vA / nA + vB / nB);
  if (se === 0) return 1;

  const t = Math.abs(mA - mB) / se;
  // Welch-Satterthwaite degrees of freedom
  const num = (vA / nA + vB / nB) ** 2;
  const den = (vA / nA) ** 2 / (nA - 1) + (vB / nB) ** 2 / (nB - 1);
  const df = num / den;
  // Approximate two-tailed p-value via regularized incomplete beta function
  return tDistPValue(t, df);
}

/**
 * Approximate two-tailed p-value for Student's t-distribution using the incomplete beta function.
 */
function tDistPValue(t: number, df: number): number {
  const x = df / (df + t * t);
  return regularizedIncompleteBeta(x, df / 2, 0.5);
}

/**
 * Regularized incomplete beta function I_x(a,b) via continued fraction (Lentz's method).
 */
function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta) / a;

  // Lentz continued fraction
  const maxIter = 200;
  const eps = 1e-14;
  let f = 1;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < eps) d = eps;
  d = 1 / d;
  f = d;

  for (let i = 1; i <= maxIter; i++) {
    const m = i;
    // even step
    let num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + num * d;
    if (Math.abs(d) < eps) d = eps;
    d = 1 / d;
    c = 1 + num / c;
    if (Math.abs(c) < eps) c = eps;
    f *= d * c;
    // odd step
    num = (-(a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d;
    if (Math.abs(d) < eps) d = eps;
    d = 1 / d;
    c = 1 + num / c;
    if (Math.abs(c) < eps) c = eps;
    f *= d * c;

    if (Math.abs(d * c - 1) < eps) break;
  }

  return front * f;
}

/**
 * Lanczos approximation for ln(Gamma(x)).
 */
function lnGamma(x: number): number {
  const g = 7;
  const coef = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  }
  x -= 1;
  let a = coef[0];
  for (let i = 1; i < g + 2; i++) a += coef[i] / (x + i);
  const t = x + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
