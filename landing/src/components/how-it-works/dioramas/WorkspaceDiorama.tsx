import { useEffect, useRef, useState } from 'react';

import {
  WORKSPACE_PREVIEW_MESSAGE_TYPE,
  isWorkspacePreviewReadyMessage,
  type WorkspacePreviewMessage,
} from '@/lib/workspacePreviewMessaging';
import styles from './Diorama.module.css';

type Phase =
  | 'upload'
  | 'data-viewer'
  | 'preprocessing'
  | 'feature-engineering'
  | 'training'
  | 'experiments'
  | 'deployment';

interface WorkspaceDioramaProps {
  label: string;
  phase: Phase;
  preloadAll?: boolean;
}

export function WorkspaceDiorama({
  label,
  phase,
  preloadAll = true,
}: WorkspaceDioramaProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const latestPhaseRef = useRef<Phase>(phase);
  const [bootPhase, setBootPhase] = useState<Phase>(phase);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    latestPhaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!isWorkspacePreviewReadyMessage(event.data)) return;
      setBootPhase(latestPhaseRef.current);
      setIsReady(true);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const message: WorkspacePreviewMessage = {
      type: WORKSPACE_PREVIEW_MESSAGE_TYPE,
      phase,
    };
    iframeRef.current?.contentWindow?.postMessage(message, '*');
  }, [isReady, phase]);

  return (
    <div className={styles.frame}>
      <div className={styles.label}>{label}</div>
      <div className={styles.workspaceViewport}>
        <div
          className={`${styles.workspaceFallback} ${isReady ? styles.workspaceFallbackHidden : ''}`}
          aria-hidden={isReady}
        >
          <div className={styles.workspaceFallbackSidebar} />
          <div className={styles.workspaceFallbackMain}>
            <div className={styles.workspaceFallbackToolbar} />
            <div className={styles.workspaceFallbackPanel} />
            <div className={styles.workspaceFallbackGrid}>
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
        <iframe
          ref={iframeRef}
          className={`${styles.workspaceFrame} ${styles.workspaceFrameVisible}`}
          src={`/workspace-preview?phase=${encodeURIComponent(isReady ? bootPhase : phase)}`}
          title={`${label} preview`}
          loading={preloadAll ? 'eager' : 'lazy'}
          tabIndex={-1}
          onLoad={() => {
            // Wait for the child preview app to confirm that its message
            // listener is attached before treating the iframe as routable.
          }}
        />
      </div>
    </div>
  );
}
