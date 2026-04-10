import { describe, expect, it } from 'vitest';

import { extractNormalizedPlanMarkdown, normalizePlanExitPayload } from './planValidation.js';

const structuredPlanWithoutTopHeading = [
  'SaaS Usage',
  '',
  '## Objective',
  'Find anomalies and train suitable models.',
  '',
  '## Data Summary',
  'One SaaS usage dataset was uploaded.',
  '',
  '## Approach',
  'Profile, clean, then compare modeling approaches.',
  '',
  '## Feature Engineering',
  'Create missingness flags and date features.',
  '',
  '## Evaluation',
  'Compare anomaly quality and supervised metrics.',
  '',
  '## Risks & Assumptions',
  'No explicit anomaly label is available.',
  '',
  '## Next Steps',
  'Review the plan and continue to preprocessing.'
].join('\n');

describe('planValidation', () => {
  it('recovers a missing top-level heading when the plan body is otherwise structured', () => {
    const normalized = extractNormalizedPlanMarkdown(structuredPlanWithoutTopHeading);

    expect(normalized).toContain('# Project Plan: SaaS Usage');
    expect(normalized).toContain('## Objective');
    expect(normalized).toContain('## Next Steps');
  });

  it('normalizes plan_exit payloads that omitted the top-level heading', () => {
    const normalized = normalizePlanExitPayload({
      planName: 'saas-usage-plan',
      planMarkdown: structuredPlanWithoutTopHeading
    });

    expect(normalized).toMatchObject({
      planName: 'saas-usage-plan.md'
    });
    expect(normalized?.planMarkdown.startsWith('# Project Plan: SaaS Usage')).toBe(true);
  });
});
