import { useCallback, useEffect, useRef, useState } from 'react';

import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';

import { getPreviewAsset } from './previewManifest';
import type { PreviewLoopId, PreviewPreloadStrategy } from './types';
import styles from './PreviewLoop.module.css';

const PHASE_LOOP_VISIBLE_START_SECONDS = 0.18;
const PHASE_LOOP_END_PADDING_SECONDS = 0.18;

interface PreviewLoopProps {
  previewId: PreviewLoopId;
  active?: boolean;
  className?: string;
  preload?: PreviewPreloadStrategy;
  posterOnly?: boolean;
  testId?: string;
}

export function PreviewLoop({
  previewId,
  active = true,
  className,
  preload,
  posterOnly = false,
  testId,
}: PreviewLoopProps) {
  const reducedMotion = usePrefersReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const asset = getPreviewAsset(previewId);
  const assetKey = `${asset.mp4Src}|${asset.posterSrc}|${asset.webmSrc}`;
  const [isInViewport, setIsInViewport] = useState(true);
  const [visibleFrameAssetKey, setVisibleFrameAssetKey] = useState<string | null>(null);
  const gatePlaybackByViewport = asset.slotKind === 'phase';
  const playbackVisible = !gatePlaybackByViewport || isInViewport;
  const isPhasePreview = asset.slotKind === 'phase';
  const hasVisibleFrame = visibleFrameAssetKey === assetKey;
  const showPosterOnly = reducedMotion || posterOnly;
  const effectivePreload = preload ?? asset.preloadStrategy;

  const alignPhaseLoopWindow = useCallback(() => {
    const video = videoRef.current;
    if (!video || !isPhasePreview) {
      return;
    }

    if (video.readyState < 1) {
      return;
    }

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const loopEnd = Math.max(
      PHASE_LOOP_VISIBLE_START_SECONDS,
      duration - PHASE_LOOP_END_PADDING_SECONDS,
    );

    if (video.currentTime >= loopEnd) {
      video.currentTime = PHASE_LOOP_VISIBLE_START_SECONDS;
      return;
    }

    if (video.currentTime < PHASE_LOOP_VISIBLE_START_SECONDS) {
      video.currentTime = PHASE_LOOP_VISIBLE_START_SECONDS;
    }
  }, [isPhasePreview]);

  const updateVisibleFrameState = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const visibleThreshold = isPhasePreview ? PHASE_LOOP_VISIBLE_START_SECONDS : 0.04;
    if (video.currentTime >= visibleThreshold) {
      setVisibleFrameAssetKey((currentAssetKey) =>
        currentAssetKey === assetKey ? currentAssetKey : assetKey,
      );
    }
  }, [assetKey, isPhasePreview]);

  useEffect(() => {
    if (!gatePlaybackByViewport || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const target = rootRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInViewport(entry.isIntersecting);
      },
      {
        threshold: 0.35,
      },
    );
    observer.observe(target);

    return () => observer.disconnect();
  }, [gatePlaybackByViewport]);

  const attemptPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || showPosterOnly || !active || !playbackVisible) {
      return;
    }

    video.defaultMuted = true;
    video.muted = true;
    video.playsInline = true;
    alignPhaseLoopWindow();

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      void playPromise.catch(() => {
        // Muted inline playback can still be delayed when the element mounts
        // offscreen. We intentionally retry on the next visibility/load event.
      });
    }
  }, [active, alignPhaseLoopWindow, playbackVisible, showPosterOnly]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || showPosterOnly) {
      return;
    }

    video.pause();
    video.currentTime = 0;
    video.load();
  }, [asset.mp4Src, asset.posterSrc, asset.webmSrc, showPosterOnly]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || showPosterOnly) return;

    if (!active) {
      video.pause();
      video.currentTime = 0;
      return;
    }

    if (!playbackVisible) {
      video.pause();
      return;
    }

    attemptPlayback();
  }, [active, attemptPlayback, playbackVisible, showPosterOnly]);

  if (showPosterOnly) {
    return (
      <div
        ref={rootRef}
        className={className ? `${styles.root} ${className}` : styles.root}
        role="img"
        aria-label={asset.ariaLabel}
        data-preview-id={previewId}
        data-preview-mode="poster"
        data-testid={testId}
      >
        <img
          src={asset.posterSrc}
          alt=""
          aria-hidden="true"
          className={styles.poster}
          loading={effectivePreload === 'none' ? 'lazy' : 'eager'}
          decoding="async"
        />
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={className ? `${styles.root} ${className}` : styles.root}
      data-preview-id={previewId}
      data-preview-mode="video"
      data-testid={testId}
    >
      <video
        ref={videoRef}
        className={styles.media}
        aria-label={asset.ariaLabel}
        autoPlay={active}
        loop={!isPhasePreview}
        muted
        playsInline
        preload={effectivePreload}
        poster={asset.posterSrc}
        onLoadedMetadata={() => {
          alignPhaseLoopWindow();
        }}
        onCanPlay={attemptPlayback}
        onLoadedData={() => {
          alignPhaseLoopWindow();
          updateVisibleFrameState();
          attemptPlayback();
        }}
        onPlaying={updateVisibleFrameState}
        onTimeUpdate={() => {
          alignPhaseLoopWindow();
          updateVisibleFrameState();
        }}
      >
        <source src={asset.mp4Src} type="video/mp4" />
        <source src={asset.webmSrc} type="video/webm" />
      </video>
      {!hasVisibleFrame ? (
        <img
          src={asset.posterSrc}
          alt=""
          aria-hidden="true"
          className={styles.posterOverlay}
          loading={effectivePreload === 'none' ? 'lazy' : 'eager'}
          decoding="async"
        />
      ) : null}
    </div>
  );
}
