import { z } from 'zod';

import { PlanExitPayloadSchema } from '../../types/llm.js';

const REQUIRED_PLAN_SECTIONS = [
  {
    name: 'Objective',
    headingPattern: /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?(?:objective|goals?|purpose)\b[:\s-]*/im,
    labelPattern: /^(?:#{0,6}\s*)?(?:[-*]\s+|\d+\s*[.)-]\s*)?(?:\*\*)?(?:objective|goals?|purpose)(?:\*\*)?\b[:\s-]*/i
  },
  {
    name: 'Data Summary',
    headingPattern: /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?(?:data\s+summary|data\s+overview|data\s+analysis|data\s+description|dataset)\b[:\s-]*/im,
    labelPattern: /^(?:#{0,6}\s*)?(?:[-*]\s+|\d+\s*[.)-]\s*)?(?:\*\*)?(?:data\s+summary|data\s+overview|data\s+analysis|data\s+description|dataset)(?:\*\*)?\b[:\s-]*/i
  },
  {
    name: 'Approach',
    headingPattern: /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?(?:approach|methodology|strategy|method)\b[:\s-]*/im,
    labelPattern: /^(?:#{0,6}\s*)?(?:[-*]\s+|\d+\s*[.)-]\s*)?(?:\*\*)?(?:approach|methodology|strategy|method)(?:\*\*)?\b[:\s-]*/i
  },
  {
    name: 'Feature Engineering',
    headingPattern: /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?(?:feature\s+engineering(?:\s+strategy)?|features?)\b[:\s-]*/im,
    labelPattern: /^(?:#{0,6}\s*)?(?:[-*]\s+|\d+\s*[.)-]\s*)?(?:\*\*)?(?:feature\s+engineering(?:\s+strategy)?|features?)(?:\*\*)?\b[:\s-]*/i
  },
  {
    name: 'Evaluation',
    headingPattern: /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?(?:target\s*(?:&|and)\s*evaluation|evaluation|metrics|success\s+metrics|performance)\b[:\s-]*/im,
    labelPattern: /^(?:#{0,6}\s*)?(?:[-*]\s+|\d+\s*[.)-]\s*)?(?:\*\*)?(?:target\s*(?:&|and)\s*evaluation|evaluation|metrics|success\s+metrics|performance)(?:\*\*)?\b[:\s-]*/i
  },
  {
    name: 'Risks & Assumptions',
    headingPattern: /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?(?:risks?\s*(?:&|and)\s*assumptions?|assumptions?|considerations|caveats|limitations)\b[:\s-]*/im,
    labelPattern: /^(?:#{0,6}\s*)?(?:[-*]\s+|\d+\s*[.)-]\s*)?(?:\*\*)?(?:risks?\s*(?:&|and)\s*assumptions?|assumptions?|considerations|caveats|limitations)(?:\*\*)?\b[:\s-]*/i
  },
  {
    name: 'Next Steps',
    headingPattern: /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?(?:next\s+steps|action\s+items|recommendations|timeline)\b[:\s-]*/im,
    labelPattern: /^(?:#{0,6}\s*)?(?:[-*]\s+|\d+\s*[.)-]\s*)?(?:\*\*)?(?:next\s+steps|action\s+items|recommendations|timeline)(?:\*\*)?\b[:\s-]*/i
  },
];

function normalizeRecoveredPlanTitle(title: string | undefined): string {
  const trimmed = title?.trim() ?? '';
  if (!trimmed) {
    return '# Project Plan';
  }

  const withoutMarkdown = trimmed.replace(/^#+\s*/, '').trim();
  const withoutPlanPrefix = withoutMarkdown.replace(/^project\s+plan\s*:?\s*/i, '').trim();
  const finalTitle = withoutPlanPrefix || withoutMarkdown;
  return finalTitle ? `# Project Plan: ${finalTitle}` : '# Project Plan';
}

function recoverTopLevelHeading(unwrapped: string): string | null {
  const lines = unwrapped
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/, ''));

  const firstMeaningfulIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstMeaningfulIndex === -1) {
    return null;
  }

  const nestedHeadingIndex = lines.findIndex((line, index) => index >= firstMeaningfulIndex && /^#{2,6}\s+.+$/.test(line.trim()));

  if (nestedHeadingIndex === -1) {
    return null;
  }

  const nestedHeadingLine = lines[nestedHeadingIndex].trim();
  const prefaceLines = lines
    .slice(firstMeaningfulIndex, nestedHeadingIndex)
    .map((line) => line.trim())
    .filter(Boolean);
  const titleCandidate = prefaceLines.length === 1 && !prefaceLines[0].startsWith('#')
    ? prefaceLines[0]
    : undefined;

  const recoveredHeading = normalizeRecoveredPlanTitle(titleCandidate);
  const remainingLines = lines.slice(nestedHeadingIndex);
  const recovered = [recoveredHeading, '', ...remainingLines].join('\n').trim();

  // Guard against incorrectly wrapping arbitrary prose. Only recover when
  // the remaining body is already structured as a plan section sequence.
  const sectionMatches = REQUIRED_PLAN_SECTIONS
    .filter(({ headingPattern }) => headingPattern.test(recovered));
  if (sectionMatches.length < 2 && !/^##\s+/.test(nestedHeadingLine)) {
    return null;
  }

  return recovered;
}

function recoverStructuredPlanFromSectionLabels(unwrapped: string): string | null {
  const lines = unwrapped
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/, ''));
  const firstMeaningfulIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstMeaningfulIndex === -1) {
    return null;
  }

  const sectionMatchAt = (line: string) => REQUIRED_PLAN_SECTIONS.find((section) => section.labelPattern.test(line.trim()));
  const firstSectionIndex = lines.findIndex((line, index) => index >= firstMeaningfulIndex && Boolean(sectionMatchAt(line)));
  if (firstSectionIndex === -1) {
    return null;
  }

  const prefaceLines = lines
    .slice(firstMeaningfulIndex, firstSectionIndex)
    .map((line) => line.trim())
    .filter(Boolean);
  const titleCandidate = prefaceLines.length === 1 && !prefaceLines[0].startsWith('#')
    ? prefaceLines[0]
    : undefined;

  const recoveredLines: string[] = [normalizeRecoveredPlanTitle(titleCandidate)];
  let recoveredSectionCount = 0;

  for (const rawLine of lines.slice(firstSectionIndex)) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (recoveredLines.at(-1) !== '') {
        recoveredLines.push('');
      }
      continue;
    }

    const matchedSection = sectionMatchAt(trimmed);
    if (!matchedSection) {
      recoveredLines.push(rawLine);
      continue;
    }

    recoveredSectionCount += 1;
    const inlineContent = trimmed.replace(matchedSection.labelPattern, '').trim();
    if (recoveredLines.at(-1) !== '') {
      recoveredLines.push('');
    }
    recoveredLines.push(`## ${matchedSection.name}`);
    if (inlineContent) {
      recoveredLines.push(inlineContent);
    }
  }

  if (recoveredSectionCount < 3) {
    return null;
  }

  return recoveredLines.join('\n').trim();
}

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

  let candidateSource = unwrapped;
  let resolvedHeadingMatch = headingMatch;

  if (!resolvedHeadingMatch || resolvedHeadingMatch.index === undefined) {
    const recovered = recoverTopLevelHeading(unwrapped) ?? recoverStructuredPlanFromSectionLabels(unwrapped);
    if (!recovered) {
      return null;
    }
    candidateSource = recovered;
    resolvedHeadingMatch = candidateSource.match(/^#\s+.+$/m);
  }

  if (!resolvedHeadingMatch || resolvedHeadingMatch.index === undefined) {
    return null;
  }

  const candidate = candidateSource.slice(resolvedHeadingMatch.index).trim();
  if (!candidate.startsWith('#')) {
    return null;
  }

  const missingSections = REQUIRED_PLAN_SECTIONS
    .filter(({ headingPattern }) => !headingPattern.test(candidate));

  if (missingSections.length > 0) {
    console.warn(
      `[planValidation] Plan missing ${missingSections.length} sections: ${missingSections.map(s => s.name).join(', ')}`
    );
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
