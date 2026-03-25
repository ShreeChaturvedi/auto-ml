import { Link } from 'react-router-dom';

interface EmptyStateProps {
  projectId: string;
}

export function EmptyState({ projectId }: EmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center relative">
      <div className="relative z-10 text-center space-y-3 px-4 empty-state-enter">
        <svg width="200" height="150" viewBox="0 0 200 150" fill="none" className="mx-auto opacity-40" aria-hidden="true">
          {Array.from({ length: 7 }).map((_, xi) =>
            Array.from({ length: 5 }).map((_, yi) => (
              <circle key={`${xi}-${yi}`} cx={40 + xi * 24} cy={15 + yi * 24} r="1" fill="currentColor" opacity="0.3" />
            ))
          )}
          <line x1="40" y1="130" x2="40" y2="10" stroke="currentColor" strokeWidth="1.5" />
          <polyline points="36,18 40,10 44,18" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <line x1="30" y1="120" x2="185" y2="120" stroke="currentColor" strokeWidth="1.5" />
          <polyline points="177,116 185,120 177,124" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="40" cy="120" r="3" fill="currentColor" opacity="0.6" />
        </svg>
        <p className="text-sm text-muted-foreground">
          Train your first model in the{' '}
          <Link
            to={`/project/${projectId}/training`}
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Training phase
          </Link>
        </p>
      </div>
    </div>
  );
}
