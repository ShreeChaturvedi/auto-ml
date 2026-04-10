/**
 * StatusPill — capsule status badge for LLM tool cards and renderers.
 *
 * Thin wrapper around the shared `Pill` primitive defaulting to
 * `shape="pill"` + `size="xs"` and mapping a semantic `status` union
 * onto `tone` + default icon + default label.
 */

import * as React from 'react';
import {
  CheckCircle2, XCircle, Loader2, Clock, CircleDot, MinusCircle,
  AlertTriangle, Info,
  type LucideIcon,
} from 'lucide-react';
import { Pill, type PillProps } from '@/components/ui/pill';
import { cn } from '@/lib/utils';

export type StatusKind =
  | 'accepted'
  | 'success'
  | 'rejected'
  | 'failed'
  | 'running'
  | 'pending'
  | 'awaiting'
  | 'selected'
  | 'skipped'
  | 'warning'
  | 'info'
  | 'neutral';

interface StatusMeta {
  tone: NonNullable<PillProps['tone']>;
  icon: LucideIcon | null;
  label: string;
  spin?: boolean;
}

const STATUS_META: Record<StatusKind, StatusMeta> = {
  accepted: { tone: 'success',  icon: CheckCircle2, label: 'accepted'  },
  success:  { tone: 'success',  icon: CheckCircle2, label: 'success'   },
  rejected: { tone: 'failed',   icon: XCircle,      label: 'rejected'  },
  failed:   { tone: 'failed',   icon: XCircle,      label: 'failed'    },
  running:  { tone: 'running',  icon: Loader2,      label: 'running', spin: true },
  pending:  { tone: 'pending',  icon: Clock,        label: 'pending'   },
  awaiting: { tone: 'pending',  icon: Clock,        label: 'awaiting'  },
  selected: { tone: 'selected', icon: CircleDot,    label: 'selected'  },
  skipped:  { tone: 'skipped',  icon: MinusCircle,  label: 'skipped'   },
  warning:  { tone: 'warning',  icon: AlertTriangle, label: 'warning'  },
  info:     { tone: 'info',     icon: Info,         label: 'info'      },
  neutral:  { tone: 'info',     icon: null,         label: ''          },
};

export interface StatusPillProps
  extends Omit<PillProps, 'icon' | 'iconClassName' | 'tone' | 'shape' | 'size' | 'children'> {
  status: StatusKind;
  /** Override the default label text. Pass empty string to hide. */
  label?: string;
  /** Override the default icon. Pass `null` to hide. */
  icon?: LucideIcon | null;
  /** Pill size — defaults to `xs` (matches DimensionPill). */
  size?: 'xs' | 'sm';
  /** Extra class on the icon (e.g., `animate-spin`). */
  iconClassName?: string;
}

export const StatusPill = React.forwardRef<HTMLSpanElement, StatusPillProps>(
  ({ status, label, icon, size = 'xs', iconClassName, className, ...rest }, ref) => {
    const meta = STATUS_META[status];
    const IconComp = icon === undefined ? meta.icon : icon;
    const text = label ?? meta.label;

    return (
      <Pill
        ref={ref}
        shape="pill"
        size={size}
        tone={meta.tone}
        icon={IconComp ?? undefined}
        iconClassName={cn(meta.spin && 'animate-spin', iconClassName)}
        className={className}
        {...rest}
      >
        {text}
      </Pill>
    );
  },
);

StatusPill.displayName = 'StatusPill';
