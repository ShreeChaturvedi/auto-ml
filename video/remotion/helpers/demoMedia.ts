type CaptureMediaDurationArgs = {
  durationMs: number;
  startOffsetSeconds: number;
  endOffsetSeconds: number;
  fps: number;
};

const WEBM_EXTENSION_RE = /\.webm(?=([?#].*)?$)/i;
const FILE_EXTENSION_RE = /\.[^.]+$/;

export const getPreviewVideoCandidates = (src: string): string[] => {
  const mp4Src = src.replace(WEBM_EXTENSION_RE, ".mp4");
  return mp4Src === src ? [src] : [mp4Src, src];
};

export const captureMetaFileForVideo = (videoFile: string): string =>
  videoFile.replace(FILE_EXTENSION_RE, ".meta.json");

export const previewMirrorFileForVideo = (videoFile: string): string =>
  videoFile.replace(/\.webm$/i, ".mp4");

export const getCaptureMediaDurationFrames = ({
  durationMs,
  startOffsetSeconds,
  endOffsetSeconds,
  fps,
}: CaptureMediaDurationArgs): number | null => {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  if (!Number.isFinite(startOffsetSeconds) || startOffsetSeconds < 0) return null;
  if (!Number.isFinite(endOffsetSeconds) || endOffsetSeconds < 0) return null;
  if (!Number.isFinite(fps) || fps <= 0) return null;

  const usableMs =
    durationMs - startOffsetSeconds * 1000 - endOffsetSeconds * 1000;
  if (usableMs <= 0) return 1;

  return Math.max(1, Math.ceil((usableMs * fps) / 1000));
};
