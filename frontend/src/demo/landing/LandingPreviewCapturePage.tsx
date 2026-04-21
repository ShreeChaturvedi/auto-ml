import { useMemo, useRef } from 'react';

import { DemoWorkspace } from './DemoWorkspace';
import { useLandingPreviewCaptureScenario } from './captureScenarios';
import { getLandingPreviewCaptureConfig } from './previewCapturePresets';

const THEME_STORAGE_KEY = 'automl-ui-theme';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'automl-sidebar-collapsed';
const SIDEBAR_ACCORDION_STORAGE_KEY = 'automl-sidebar-accordion';

export function LandingPreviewCapturePage() {
  const searchParams = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );
  const config = useMemo(
    () => getLandingPreviewCaptureConfig(searchParams.get('preset')),
    [searchParams],
  );
  const initializedRef = useRef(false);

  useLandingPreviewCaptureScenario(config.preset);

  if (!initializedRef.current) {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      JSON.stringify(config.sidebarCollapsed),
    );
    window.localStorage.setItem(
      SIDEBAR_ACCORDION_STORAGE_KEY,
      JSON.stringify(false),
    );
    initializedRef.current = true;
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground">
      <DemoWorkspace
        initialPhase={config.phase}
        initialEntry={config.initialEntry}
      />
    </div>
  );
}

export default LandingPreviewCapturePage;
