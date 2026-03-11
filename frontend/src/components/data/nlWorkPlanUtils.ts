import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Brain,
  FileCode2,
  Info,
  ShieldCheck,
  Sparkles,
  Wrench
} from 'lucide-react';

import type { NlModelWorkBlockState, NlWorkPhaseState } from '@/types/nlQuery';
import { getNlWorkPhaseLabel } from '@/types/nlQuery';

export type WarningTone = {
  container: string;
  accent: string;
};

export type BlockAppearance = {
  label: string;
  icon: LucideIcon;
  badge: string;
  card: string;
  dot: string;
};

export function toneForWarningLevel(level: 'high' | 'medium' | 'low' | 'none' | undefined): WarningTone {
  switch (level) {
    case 'high':
      return {
        container: 'border-destructive/55 bg-destructive/[0.08]',
        accent: 'bg-destructive'
      };
    case 'medium':
      return {
        container: 'border-amber-500/55 bg-amber-500/[0.08]',
        accent: 'bg-amber-500'
      };
    case 'low':
      return {
        container: 'border-border/85 bg-card/90',
        accent: 'bg-border'
      };
    case 'none':
    default:
      return {
        container: 'border-emerald-500/50 bg-emerald-500/[0.08]',
        accent: 'bg-emerald-500'
      };
  }
}

export function simplifyIntentSummary(intentSummary: string): string {
  const trimmed = intentSummary.trim();
  if (!trimmed) {
    return 'No intent summary was returned.';
  }

  return trimmed
    .replace(/^plan for query:\s*/i, '')
    .replace(/^repair plan for query:\s*/i, '');
}

export function phaseStatusCopy(status: NlWorkPhaseState['status']): string {
  switch (status) {
    case 'active':
      return 'In progress';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'pending':
    default:
      return 'Pending';
  }
}

export function liveSubtitle(active: NlWorkPhaseState): string {
  if (active.phaseId === 'done' && active.status === 'completed') {
    return active.lastSummary ?? 'Pipeline completed';
  }

  if (active.status === 'failed' && active.lastSummary) {
    return `${getNlWorkPhaseLabel(active.phaseId)} • ${active.lastSummary}`;
  }

  return `${getNlWorkPhaseLabel(active.phaseId)} • ${phaseStatusCopy(active.status).toLowerCase()}`;
}

export function pluralize(word: string, count: number): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function splitValidationNotes(validationNotes: string[]) {
  const nonDebug: string[] = [];
  const debug: string[] = [];

  for (const note of validationNotes) {
    if (note.toLowerCase().startsWith('debug:')) {
      debug.push(note.replace(/^debug:\s*/i, '').trim());
      continue;
    }
    nonDebug.push(note);
  }

  return {
    nonDebugValidationNotes: nonDebug,
    debugValidationNotes: debug
  };
}

export function blockAppearance(kind: NlModelWorkBlockState['kind']): BlockAppearance {
  switch (kind) {
    case 'thinking':
      return {
        label: 'Thinking',
        icon: Brain,
        badge: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
        card: 'border-sky-500/18 bg-sky-500/[0.04]',
        dot: 'bg-sky-500'
      };
    case 'tool':
      return {
        label: 'Tool call',
        icon: Wrench,
        badge: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
        card: 'border-amber-500/18 bg-amber-500/[0.04]',
        dot: 'bg-amber-500'
      };
    case 'sql':
      return {
        label: 'SQL',
        icon: FileCode2,
        badge: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
        card: 'border-emerald-500/18 bg-emerald-500/[0.04]',
        dot: 'bg-emerald-500'
      };
    case 'validation':
      return {
        label: 'Validation',
        icon: ShieldCheck,
        badge: 'bg-cyan-500/12 text-cyan-700 dark:text-cyan-300',
        card: 'border-cyan-500/18 bg-cyan-500/[0.04]',
        dot: 'bg-cyan-500'
      };
    case 'repair':
      return {
        label: 'Repair',
        icon: AlertTriangle,
        badge: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
        card: 'border-rose-500/18 bg-rose-500/[0.04]',
        dot: 'bg-rose-500'
      };
    case 'status':
      return {
        label: 'Status',
        icon: Info,
        badge: 'bg-muted text-foreground/80',
        card: 'border-border/70 bg-background/65',
        dot: 'bg-muted-foreground/60'
      };
    case 'plan':
    default:
      return {
        label: 'Plan',
        icon: Sparkles,
        badge: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
        card: 'border-violet-500/18 bg-violet-500/[0.04]',
        dot: 'bg-violet-500'
      };
  }
}

export function transcriptBodyClass(kind: NlModelWorkBlockState['kind']): string {
  if (kind === 'thinking') {
    return 'max-h-44';
  }
  if (kind === 'tool') {
    return 'max-h-40';
  }
  if (kind === 'sql') {
    return 'max-h-36';
  }
  return 'max-h-32';
}

export function distanceFromViewportBottom(element: HTMLElement): number {
  return element.scrollHeight - (element.scrollTop + element.clientHeight);
}

export function scrollElementToBottom(element: HTMLElement) {
  element.scrollTop = element.scrollHeight;
}

export function scheduleScrollToBottom(element: HTMLElement) {
  const run = () => {
    scrollElementToBottom(element);
  };

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(run);
    return;
  }

  run();
}

export function scrollViewportToBottom(element: HTMLElement, behavior: ScrollBehavior = 'auto') {
  if (typeof element.scrollTo === 'function') {
    element.scrollTo({
      top: element.scrollHeight,
      behavior
    });
    return;
  }

  scrollElementToBottom(element);
}
