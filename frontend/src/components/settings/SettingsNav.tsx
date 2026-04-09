/**
 * SettingsNav — Left sidebar for the settings page (w-72 / 288 px).
 *
 * Renders a back button, the current user's avatar block,
 * and grouped navigation items that link to `/settings/{id}`.
 */

import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { SETTINGS_TABS } from './settingsConfig';

/** Derive initials from a display name (up to two characters). */
function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Unique ordered group keys. */
const GROUPS = [...new Set(SETTINGS_TABS.map((t) => t.group))];

export function SettingsNav({ activeTab }: { activeTab: string }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  return (
    <nav className="w-72 shrink-0 border-r border-border bg-card h-full flex flex-col">
      {/* Back button */}
      <div className="px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          onClick={() => navigate('/')}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      {/* Avatar block */}
      {user && (
        <div className="px-4 pt-3 pb-4">
          <div className="flex items-center gap-2.5">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="text-xs font-medium">
                {initials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </div>
      )}

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto pb-4">
        {GROUPS.map((group) => (
          <div key={group}>
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-4 pt-5 pb-1.5">
              {group}
            </h3>
            {SETTINGS_TABS.filter((t) => t.group === group).map((tab) => {
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => navigate(`/settings/${tab.id}`)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] cursor-pointer mx-2 transition-colors duration-150',
                    active
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted/50',
                  )}
                  style={{ maxWidth: 'calc(100% - 16px)' }}
                >
                  <tab.icon className={cn('h-4 w-4 shrink-0', active && 'text-accent-text')} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
