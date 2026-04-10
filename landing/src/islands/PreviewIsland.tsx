import { PreviewShell } from '@/preview/PreviewShell';

// Astro island entry point. The outer <div> is what Astro hydrates.
// We keep this thin so the shell can be imported in tests without Astro runtime.
export default function PreviewIsland() {
  return <PreviewShell />;
}
