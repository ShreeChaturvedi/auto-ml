interface DemoWindow extends Window {
  __AGENTIC_DEMO_MODE__?: boolean;
}

export function isDemoMode(): boolean {
  return typeof window !== 'undefined'
    && (window as DemoWindow).__AGENTIC_DEMO_MODE__ === true;
}

export function enableDemoMode(): void {
  if (typeof window !== 'undefined') {
    (window as DemoWindow).__AGENTIC_DEMO_MODE__ = true;
  }
}
