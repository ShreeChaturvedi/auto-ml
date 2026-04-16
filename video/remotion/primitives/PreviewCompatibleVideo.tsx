import React, { useEffect, useMemo, useState } from "react";
import {
  Html5Video,
  OffthreadVideo,
  useRemotionEnvironment,
} from "remotion";

import { getPreviewVideoCandidates } from "../helpers/demoMedia";

type PreviewCompatibleVideoProps = {
  src: string;
  startFrom?: number;
  muted?: boolean;
  style?: React.CSSProperties;
};

/**
 * Keep Studio preview on the browser's most compatible path while preserving
 * OffthreadVideo's frame extraction during renders. Preview prefers an `.mp4`
 * mirror for cross-browser decode stability and falls back to the authored src.
 */
export const PreviewCompatibleVideo: React.FC<PreviewCompatibleVideoProps> = ({
  src,
  startFrom,
  muted,
  style,
}) => {
  const env = useRemotionEnvironment();
  const candidates = useMemo(
    () => (env.isRendering ? [src] : getPreviewVideoCandidates(src)),
    [env.isRendering, src],
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    setCandidateIndex(0);
    setPreviewFailed(false);
  }, [src, env.isRendering]);

  if (env.isRendering) {
    return (
      <OffthreadVideo
        src={src}
        startFrom={startFrom}
        muted={muted}
        style={style}
      />
    );
  }

  if (previewFailed) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "grid",
          placeItems: "center",
          background: "#000",
          color: "rgba(255,255,255,0.88)",
          fontFamily: "system-ui, sans-serif",
          fontSize: 22,
          lineHeight: 1.4,
          textAlign: "center",
          padding: 32,
          ...style,
        }}
      >
        Preview could not play this capture.
      </div>
    );
  }

  const activeSrc = candidates[candidateIndex] ?? src;

  return (
    <Html5Video
      src={activeSrc}
      startFrom={startFrom}
      muted={muted}
      style={style}
      onError={() => {
        if (candidateIndex < candidates.length - 1) {
          setCandidateIndex(candidateIndex + 1);
          return;
        }
        setPreviewFailed(true);
        console.error(`[preview-video] Failed to play ${src}`);
      }}
    />
  );
};
