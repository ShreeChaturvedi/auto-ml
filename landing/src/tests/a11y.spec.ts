import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Full-page axe audit against the built static landing site.
 *
 * Catches issues the static DOM tests can't: ARIA misuse, label mismatches,
 * landmark structure, focus order, and color contrast outside of aria-hidden
 * decorative elements (e.g. the sunken wordmark in the footer).
 */
test('landing page has no WCAG 2 AA violations', async ({ page }) => {
  await page.goto('/');

  // Wait for the interactive preview island to hydrate before auditing so
  // axe sees the fully-rendered DOM, not the SSR shell.
  await page.waitForSelector('[aria-label^="Interactive Agentic AutoML"]');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22a', 'wcag22aa'])
    .analyze();

  expect(
    results.violations,
    `axe reported ${results.violations.length} violation(s):\n${JSON.stringify(
      results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.map((n) => n.target),
      })),
      null,
      2,
    )}`,
  ).toEqual([]);
});
