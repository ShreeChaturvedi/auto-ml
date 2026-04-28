async (page) => {
  return await page.evaluate(() => {
    const results = {};
    for (let idx = 9; idx <= 14; idx++) {
      const p = document.querySelectorAll('.page')[idx];
      const R = p.getBoundingClientRect();
      const all = Array.from(p.querySelectorAll('*'));
      const regions = [];
      for (const el of all) {
        if (el.children.length > 0 && (el.textContent || '').trim().length === 0) continue;
        const r = el.getBoundingClientRect();
        const t = r.top - R.top, b = r.bottom - R.top;
        if (b > 0 && t < R.height) regions.push([Math.max(0, t), Math.min(R.height, b)]);
      }
      regions.sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const [a, b] of regions) {
        if (merged.length && merged[merged.length - 1][1] >= a - 2) {
          merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], b);
        } else merged.push([a, b]);
      }
      let maxGap = 0, at = 0;
      for (let i = 1; i < merged.length; i++) {
        const g = merged[i][0] - merged[i - 1][1];
        if (g > maxGap) { maxGap = g; at = merged[i - 1][1]; }
      }
      results['p' + (idx + 1)] = { h: R.height, gap: Math.round(maxGap), at: Math.round(at), pct: Math.round(maxGap / R.height * 100) };
    }
    return results;
  });
}
