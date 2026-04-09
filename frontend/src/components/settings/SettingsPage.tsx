/**
 * SettingsPage — Root shell for the Cursor-style settings experience.
 *
 * Two-panel layout: a 240 px left sidebar (`SettingsNav`) and a
 * scrollable content area that renders the active tab. Reads the
 * current tab from the `:tab` URL param and redirects to `general`
 * when the value is missing or invalid.
 */

import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { SettingsNav } from './SettingsNav';
import { SETTINGS_TABS, SETTINGS_TAB_IDS, DEFAULT_SETTINGS_TAB } from './settingsConfig';
import { GeneralTab } from './tabs/GeneralTab';
import { AiModelsTab } from './tabs/AiModelsTab';
import { EditorTab } from './tabs/EditorTab';
import { DataQueriesTab } from './tabs/DataQueriesTab';
import { ExecutionTab } from './tabs/ExecutionTab';
import { ProfileTab } from './tabs/ProfileTab';

/* ------------------------------------------------------------------ */
/*  Tab descriptions                                                   */
/* ------------------------------------------------------------------ */

const TAB_DESCRIPTIONS: Record<string, string> = {
  general:   'Manage appearance, navigation, and behavior preferences.',
  'ai-models': 'Configure default AI model, reasoning effort, and chat behavior.',
  editor:    'Customize code editor font, display, and behavior.',
  data:      'Configure query limits, data display, and visualization defaults.',
  execution: 'Set resource limits and notebook output preferences.',
  profile:   'Update your account information and security settings.',
};

/* ------------------------------------------------------------------ */
/*  Tab content resolver                                               */
/* ------------------------------------------------------------------ */

function renderTab(tab: string) {
  switch (tab) {
    case 'general':    return <GeneralTab />;
    case 'ai-models':  return <AiModelsTab />;
    case 'editor':     return <EditorTab />;
    case 'data':       return <DataQueriesTab />;
    case 'execution':  return <ExecutionTab />;
    case 'profile':    return <ProfileTab />;
    default:           return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export function SettingsPage() {
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const DEV_BYPASS_AUTH = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';

  /* ---------- Auth guard ---------- */

  if (!user) {
    if (DEV_BYPASS_AUTH) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-6">
          <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm dark:shadow-none">
            <h1 className="text-lg font-semibold tracking-tight">Dev Auth Bypass Active</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Settings need a signed-in account. Disable{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">VITE_DEV_BYPASS_AUTH</code>{' '}
              or sign in to access settings.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <Button variant="outline" onClick={() => navigate('/')}>
                Back to Projects
              </Button>
              <Button onClick={() => navigate('/login')}>Go to Login</Button>
            </div>
          </div>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading...</span>
          </div>
        </div>
      );
    }

    return <Navigate to="/login" replace />;
  }

  /* ---------- Tab validation ---------- */

  const activeTab = tab && SETTINGS_TAB_IDS.includes(tab) ? tab : null;
  if (!activeTab) {
    return <Navigate to={`/settings/${DEFAULT_SETTINGS_TAB}`} replace />;
  }

  const currentTab = SETTINGS_TABS.find((t) => t.id === activeTab)!;

  /* ---------- Render ---------- */

  return (
    <div className="flex h-screen bg-background">
      <SettingsNav activeTab={activeTab} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-10 py-10">
          <h1 className="text-xl font-semibold tracking-tight">{currentTab.label}</h1>
          <p className="text-sm text-muted-foreground mt-1 mb-8">
            {TAB_DESCRIPTIONS[activeTab]}
          </p>

          <div key={activeTab} className="animate-in fade-in-0 duration-200">
            {renderTab(activeTab)}
          </div>
        </div>
      </div>
    </div>
  );
}
