import { Link } from 'react-router-dom';

interface EmptyStateProps {
  projectId: string;
}

export function EmptyState({ projectId }: EmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <div className="max-w-sm mx-auto text-center empty-state-enter">
        <svg
          width="240"
          height="180"
          viewBox="0 0 240 180"
          fill="none"
          className="mx-auto mb-5 opacity-40"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="line-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
              <stop offset="50%" stopColor="currentColor" stopOpacity="0.6" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.8" />
            </linearGradient>
            <radialGradient id="dot-glow">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Dotted grid */}
          {Array.from({ length: 9 }).map((_, xi) =>
            Array.from({ length: 7 }).map((_, yi) => (
              <circle
                key={`g-${xi}-${yi}`}
                cx={40 + xi * 22}
                cy={12 + yi * 22}
                r="0.7"
                fill="currentColor"
                opacity="0.1"
              />
            )),
          )}

          {/* Axes */}
          <line x1="40" y1="155" x2="40" y2="12" stroke="currentColor" strokeWidth="1" opacity="0.25" />
          <line x1="32" y1="148" x2="216" y2="148" stroke="currentColor" strokeWidth="1" opacity="0.25" />

          {/* Curved chart line */}
          <path
            d="M50 138 Q90 130, 110 110 Q130 90, 155 72 Q180 54, 205 30"
            stroke="url(#line-grad)"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />

          {/* Data points with glow */}
          {[
            { cx: 50, cy: 138 },
            { cx: 110, cy: 110 },
            { cx: 155, cy: 72 },
            { cx: 205, cy: 30 },
          ].map((pt, i) => (
            <g key={`pt-${i}`}>
              <circle cx={pt.cx} cy={pt.cy} r="10" fill="url(#dot-glow)" />
              <circle cx={pt.cx} cy={pt.cy} r="3" fill="currentColor" opacity="0.6" />
              <circle cx={pt.cx} cy={pt.cy} r="1.5" fill="currentColor" opacity="0.9" />
            </g>
          ))}
        </svg>

        <p className="text-lg font-semibold text-foreground/80 mb-2">No models yet</p>
        <p className="text-sm text-muted-foreground mb-4">
          Train your first model to start comparing experiments and tracking performance.
        </p>
        <Link
          to={`/project/${projectId}/training`}
          className="inline-flex items-center gap-1.5 rounded-md bg-muted/30 px-3 py-1.5 text-sm text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
        >
          Go to Training
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    </div>
  );
}
