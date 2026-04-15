import { test, expect } from '@playwright/test';

/**
 * End-to-end verification of the reduced-motion policy.
 *
 * The landing page enforces `prefers-reduced-motion` in two layers:
 *   1. Global CSS (`@media (prefers-reduced-motion: reduce)`) kills animations
 *      and transitions site-wide.
 *   2. Per-component JS (HowItWorks swaps to a static <ol>, marquee pauses,
 *      pulse dot becomes inert).
 *
 * This spec forces the media query via Playwright's `reducedMotion` context
 * option and asserts each fallback is actually in effect. It catches the case
 * where CSS and JS drift apart — e.g. the marquee keyframe still running even
 * though the wrapping section has `animation: none` applied to child elements.
 */

// `reducedMotion` lives under `contextOptions` in @playwright/test's public
// type surface (even though the docs/examples often show it at the top level).
// Using `contextOptions` keeps this file strictly typed against our pinned
// Playwright version.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

test('how-it-works renders static fallback under reduced motion', async ({ page }) => {
  await page.goto('/');
  const list = page.locator('#how-it-works ol');
  await expect(list).toBeVisible();
  await expect(list.locator('li')).toHaveCount(7);
});

test('marquee rows are paused under reduced motion', async ({ page }) => {
  await page.goto('/');

  // `.marquee-row` is the animated element (see IntegrationsMarquee.astro).
  const marqueeSelector = '.marquee-row';
  await page.waitForSelector(marqueeSelector, { state: 'attached' });

  const marqueeStates = await page.$$eval(marqueeSelector, (rows) =>
    rows.map((row) => {
      const style = window.getComputedStyle(row);
      return {
        animationName: style.animationName,
        animationPlayState: style.animationPlayState,
        animationDuration: style.animationDuration,
      };
    }),
  );

  expect(marqueeStates.length).toBeGreaterThan(0);
  for (const state of marqueeStates) {
    // Either the keyframes are stripped entirely (animation: none) OR the
    // animation exists but is paused. Both satisfy the reduced-motion contract.
    const isInert =
      state.animationName === 'none' ||
      state.animationPlayState === 'paused' ||
      state.animationDuration === '0s';
    expect(
      isInert,
      `marquee row still animating: ${JSON.stringify(state)}`,
    ).toBe(true);
  }
});

test('pulse dot has no running animation under reduced motion', async ({ page }) => {
  await page.goto('/');

  // `.hero-pulse-dot` runs the `hero-pulse` keyframes in Hero.astro.
  const pulseSelector = '.hero-pulse-dot';
  await page.waitForSelector(pulseSelector, { state: 'attached' });

  const animationName = await page.$eval(pulseSelector, (el) => {
    return window.getComputedStyle(el).animationName;
  });

  expect(animationName).toBe('none');
});
