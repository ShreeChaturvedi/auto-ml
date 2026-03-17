import { z } from 'zod';

import { PlanExitPayloadSchema } from '../../types/llm.js';

const REQUIRED_PLAN_SECTION_PATTERNS = [
  /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?objective\b[:\s-]*/im,
  /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?(?:data\s+summary|data\s+overview)\b[:\s-]*/im,
  /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?approach\b[:\s-]*/im,
  /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?(?:feature\s+engineering\s+strategy|feature\s+engineering)\b[:\s-]*/im,
  /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?(?:target\s*(?:&|and)\s*evaluation|evaluation)\b[:\s-]*/im,
  /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?(?:risks?\s*(?:&|and)\s*assumptions?|assumptions?)\b[:\s-]*/im,
  /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?next\s+steps\b[:\s-]*/im
];

export function extractNormalizedPlanMarkdown(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return null;
  }

  const markdownFenceMatch = trimmed.match(/```(?:markdown|md)?\s*([\s\S]*?)```/i);
  const unwrapped = markdownFenceMatch?.[1]?.trim() || trimmed;

  const projectPlanHeading = unwrapped.match(/^#\s+Project Plan\b.*$/m);
  const firstHeading = unwrapped.match(/^#\s+.+$/m);
  const headingMatch = projectPlanHeading ?? firstHeading;

  if (!headingMatch || headingMatch.index === undefined) {
    return null;
  }

  const candidate = unwrapped.slice(headingMatch.index).trim();
  if (!candidate.startsWith('#')) {
    return null;
  }

  const hasAllRequiredSections = REQUIRED_PLAN_SECTION_PATTERNS.every((pattern) => pattern.test(candidate));
  if (!hasAllRequiredSections) {
    return null;
  }

  return candidate;
}

export function normalizePlanFilename(rawName?: string): string {
  const trimmed = rawName?.trim() ?? '';
  const withoutExtension = trimmed.replace(/\.md$/i, '');
  const slug = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9-\s_]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);

  const fallback = `project-plan-${new Date().toISOString().slice(0, 10)}`;
  return `${slug || fallback}.md`;
}

export function normalizePlanExitPayload(
  payload: z.infer<typeof PlanExitPayloadSchema>
): z.infer<typeof PlanExitPayloadSchema> | null {
  const planMarkdown = extractNormalizedPlanMarkdown(payload.planMarkdown);
  if (!planMarkdown) {
    return null;
  }

  const parsed = PlanExitPayloadSchema.safeParse({
    planName: normalizePlanFilename(payload.planName),
    planMarkdown
  });

  return parsed.success ? parsed.data : null;
}
