import React, { useEffect, useState } from "react";
import {
  continueRender,
  delayRender,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { z } from "zod";
import { REGULAR_FONT } from "../../../config/fonts";
import type { demoScene } from "../../../config/scenes";
import type { Theme } from "../../../config/themes";
import { COLORS, getChromeGradient } from "../../../config/themes";
import {
  BrowserChrome,
  ChromeTabStrip,
  ChromeTitleBar,
  CONTINUITY,
} from "../../helpers/BrowserChrome";
import { capturesPath, mainVideoPath } from "../../helpers/paths";
import { SceneVoiceover } from "../../helpers/SceneVoiceover";
import { useTimelineRunner } from "../../hooks/useTimelineRunner";
import { ClickRipple } from "../../primitives/ClickRipple";
import { PreviewCompatibleVideo } from "../../primitives/PreviewCompatibleVideo";
import { SfxTrigger } from "../../primitives/SfxTrigger";
import {
  SyntheticCursor,
  type CursorWaypoint,
} from "../../primitives/SyntheticCursor";
import { ZoomFrame } from "../../primitives/ZoomFrame";
import type { SceneWithMetadata } from "../../../config/scenes";
import { cursorJsonToWaypoints, type CursorTrackEntry } from "./cursorJson";
import {
  createSourceToViewportTransform,
  mapCursorPathToViewport,
  mapSourcePointToViewport,
  mapSourceRectToViewport,
  type SourceToViewportAlignX,
  type SourceToViewportAlignY,
  type SourceToViewportFit,
  type SourceToViewportTransform,
  type ViewportSize,
} from "./sourceToViewport";

type DemoSceneType = z.infer<typeof demoScene>;

type Props = {
  scene: DemoSceneType;
  theme: Theme;
  meta?: SceneWithMetadata;
};

// Composition dimensions — video wrappers transform against these when the
// chrome dismisses. Kept local so Demo doesn't need a full DIMENSIONS import.
const COMP_W = 1920;
const COMP_H = 1080;

const getCaptureSourceSize = (meta?: SceneWithMetadata): ViewportSize => ({
  width: meta?.captureSize?.width ?? COMP_W,
  height: meta?.captureSize?.height ?? COMP_H,
});

const getChromeContentRect = (hasTabs: boolean) => ({
  top:
    CONTINUITY.padding +
    CONTINUITY.frameBorderPx +
    CONTINUITY.titleBarHeight +
    CONTINUITY.headerDividerPx +
    (hasTabs
      ? CONTINUITY.tabStripHeight + CONTINUITY.headerDividerPx
      : 0),
  left: CONTINUITY.padding + CONTINUITY.frameBorderPx,
  width: COMP_W - CONTINUITY.padding * 2 - CONTINUITY.frameBorderPx * 2,
  height:
    COMP_H -
    CONTINUITY.padding * 2 -
    CONTINUITY.frameBorderPx * 2 -
    CONTINUITY.titleBarHeight -
    CONTINUITY.headerDividerPx -
    (hasTabs
      ? CONTINUITY.tabStripHeight + CONTINUITY.headerDividerPx
      : 0),
});

const getViewportSizeForScene = (
  scene: Pick<DemoSceneType, "chrome" | "tabs">,
): ViewportSize => {
  if (scene.chrome === "none") {
    return { width: COMP_W, height: COMP_H };
  }

  const contentRect = getChromeContentRect(Boolean(scene.tabs?.length));
  return {
    width: contentRect.width,
    height: contentRect.height,
  };
};

const getMediaFitForScene = (
  scene: Pick<DemoSceneType, "chrome">,
): SourceToViewportFit => {
  // App-demo captures are currently authored at 1600x1000 while the
  // composition is 1920x1080. Fullscreen scenes should preserve the whole
  // capture, even if that means pillarboxing instead of cropping.
  return scene.chrome === "none" ? "contain" : "cover";
};

const getMediaAlignForScene = (
  scene: Pick<DemoSceneType, "mediaAlignX" | "mediaAlignY">,
): {
  x: SourceToViewportAlignX;
  y: SourceToViewportAlignY;
} => ({
  x: scene.mediaAlignX ?? "center",
  y: scene.mediaAlignY ?? "center",
});

const getChromeOuterRect = () => ({
  top: CONTINUITY.padding,
  left: CONTINUITY.padding,
  width: COMP_W - CONTINUITY.padding * 2,
  height: COMP_H - CONTINUITY.padding * 2,
});

/**
 * Demo scene: plays a Playwright-captured screen recording inside an optional
 * window chrome, with synthetic cursor + click-ripple + zoom + sfx overlays.
 *
 * Capture output lives in `public/captures/<beat>.{webm,mp4,cursor.json,meta.json}`
 * (see `scripts/capture-demo.ts`). Studio preview prefers the `.mp4` mirror for
 * cross-browser playback while renders keep the authored source. Legacy
 * Open-Recorder clips still work via `videoRoot: "main"`.
 *
 * When `chromeDismissAt` is set, the chrome frame fades out over
 * `chromeDismissDurationFrames` while the video wrapper transforms from the
 * chrome's inner content rectangle to full-bleed — creating a "zoom out of
 * the browser" reveal into the capture.
 */
export const Demo: React.FC<Props> = ({ scene, theme, meta }) => {
  const { fps } = useVideoConfig();
  const startFrom =
    scene.startOffset > 0 ? Math.round(scene.startOffset * fps) : undefined;

  const videoSrc = staticFile(
    scene.videoRoot === "captures"
      ? capturesPath(scene.videoFile)
      : mainVideoPath(scene.videoFile),
  );

  const cursorPath = useCursorPath(scene.cursorFile, fps, scene.startOffset);

  if (scene.chromeDismissAt !== undefined || scene.chromeRestoreAtEnd) {
    return (
      <DemoWithDismiss
        scene={scene}
        dismissAt={scene.chromeDismissAt}
        theme={theme}
        meta={meta}
        videoSrc={videoSrc}
        startFrom={startFrom}
        cursorPath={cursorPath}
      />
    );
  }

  const viewportSize = getViewportSizeForScene(scene);
  const mediaFit = getMediaFitForScene(scene);
  const mediaAlign = getMediaAlignForScene(scene);
  const sourceTransform = createSourceToViewportTransform(
    getCaptureSourceSize(meta),
    viewportSize,
    mediaFit,
    mediaAlign.x,
    mediaAlign.y,
  );
  const mappedCursorPath = cursorPath
    ? mapCursorPathToViewport(cursorPath, sourceTransform)
    : null;

  return (
    <BrowserChrome
      variant={scene.chrome}
      url={scene.url}
      tabs={scene.tabs}
      outerBackground={getChromeGradient(theme)}
    >
      <TimelineOverlay
        scene={scene}
        meta={meta}
        sourceTransform={sourceTransform}
        viewportSize={viewportSize}
      >
        <PreviewCompatibleVideo
          src={videoSrc}
          startFrom={startFrom}
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: mediaFit,
            objectPosition: `${mediaAlign.x} ${mediaAlign.y}`,
            background: "#000",
            display: "block",
          }}
        />
      </TimelineOverlay>

      {mappedCursorPath ? (
        <SyntheticCursor path={mappedCursorPath} theme="dark" />
      ) : null}

      {scene.chapter ? (
        <ChapterBadge theme={theme} text={scene.chapter} />
      ) : null}

      <SceneVoiceover file={scene.voiceoverFile} />
    </BrowserChrome>
  );
};

/**
 * Default chrome-dismiss tween length (750 ms @ 60 fps) when a scene sets
 * `chromeDismissAt` but omits the duration. Keeping the default here rather
 * than in the Zod schema lets existing demo scenes declare a single-field
 * dismiss without also populating a duration they don't care about.
 */
const DEFAULT_CHROME_DISMISS_DURATION_FRAMES = 45;
const DEFAULT_CHROME_RESTORE_HOLD_FRAMES = 120;

/**
 * Chrome-dismiss variant. Renders the video as a sibling of the chrome and
 * tweens both:
 *   1. video wrapper bounds: chrome's inner content rect → full-bleed
 *   2. chrome opacity: 1 → 0 (dark outer backdrop + card fade together)
 *
 * The chrome's card is transparent so the video shows through during the
 * tween rather than snapping visible at opacity 0.
 */
type DismissProps = {
  scene: DemoSceneType;
  dismissAt: number | undefined;
  theme: Theme;
  meta?: SceneWithMetadata;
  videoSrc: string;
  startFrom: number | undefined;
  cursorPath: readonly CursorWaypoint[] | null;
};

const DemoWithDismiss: React.FC<DismissProps> = ({
  scene,
  dismissAt,
  theme,
  meta,
  videoSrc,
  startFrom,
  cursorPath,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const dismissDur =
    scene.chromeDismissDurationFrames ?? DEFAULT_CHROME_DISMISS_DURATION_FRAMES;

  const dismissProgress =
    dismissAt === undefined
      ? 0
      : interpolate(
          frame,
          [dismissAt, dismissAt + dismissDur],
          [0, 1],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.inOut(Easing.cubic),
          },
        );

  const restoreDur = scene.chromeRestoreDurationFrames ?? dismissDur;
  const restoreHold =
    scene.chromeRestoreHoldFrames ?? DEFAULT_CHROME_RESTORE_HOLD_FRAMES;
  const restoreStart = durationInFrames - restoreHold - restoreDur;
  const restoreProgress = scene.chromeRestoreAtEnd
    ? interpolate(
        frame,
        [restoreStart, restoreStart + restoreDur],
        [0, 1],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.inOut(Easing.cubic),
        },
      )
    : 0;

  const progress = Math.max(0, Math.min(1, dismissProgress - restoreProgress));
  const chromeOpacity = 1 - progress;

  const hasTabs = Boolean(scene.tabs?.length);
  const tabStripBaseHeight = hasTabs ? CONTINUITY.tabStripHeight : 0;
  const titleBarHeight = interpolate(
    progress,
    [0, 1],
    [CONTINUITY.titleBarHeight, 0],
  );
  const tabStripHeight = interpolate(progress, [0, 1], [tabStripBaseHeight, 0]);

  // Chrome's outer window frame and its inner content rectangle stay coupled
  // during dismiss/restore so the window bar expands with the content instead
  // of fading as a static overlay over the fullscreen video.
  const startOuterRect = getChromeOuterRect();
  const endRect = { top: 0, left: 0, width: COMP_W, height: COMP_H };
  const outerRect = {
    top: interpolate(progress, [0, 1], [startOuterRect.top, endRect.top]),
    left: interpolate(progress, [0, 1], [startOuterRect.left, endRect.left]),
    width: interpolate(progress, [0, 1], [startOuterRect.width, endRect.width]),
    height: interpolate(progress, [0, 1], [startOuterRect.height, endRect.height]),
  };

  const videoRect = {
    top: outerRect.top + tabStripHeight + titleBarHeight,
    left: outerRect.left,
    width: outerRect.width,
    height: outerRect.height - tabStripHeight - titleBarHeight,
  };
  const mediaFit = getMediaFitForScene(scene);
  const mediaAlign = getMediaAlignForScene(scene);
  const sourceTransform = createSourceToViewportTransform(
    getCaptureSourceSize(meta),
    {
      width: videoRect.width,
      height: videoRect.height,
    },
    mediaFit,
    mediaAlign.x,
    mediaAlign.y,
  );
  const mappedCursorPath = cursorPath
    ? mapCursorPathToViewport(cursorPath, sourceTransform)
    : null;

  return (
    <>
      <AbsoluteChromeBackdrop
        opacity={chromeOpacity}
        theme={theme}
      />

      {/* Video wrapper — grows from chrome's inner rect to full-bleed. */}
      <div
        style={{
          position: "absolute",
          top: videoRect.top,
          left: videoRect.left,
          width: videoRect.width,
          height: videoRect.height,
          overflow: "hidden",
          background: "#000",
        }}
      >
        <TimelineOverlay
          scene={scene}
          meta={meta}
          sourceTransform={sourceTransform}
          viewportSize={{
            width: videoRect.width,
            height: videoRect.height,
          }}
        >
          <PreviewCompatibleVideo
            src={videoSrc}
            startFrom={startFrom}
            muted
            style={{
              width: "100%",
              height: "100%",
              objectFit: mediaFit,
              objectPosition: `${mediaAlign.x} ${mediaAlign.y}`,
              background: "#000",
              display: "block",
            }}
          />
        </TimelineOverlay>
      </div>

      <AnimatedChromeShell
        scene={scene}
        outerRect={outerRect}
        titleBarHeight={titleBarHeight}
        tabStripHeight={tabStripHeight}
        opacity={chromeOpacity}
      />

      {mappedCursorPath ? (
        <div
          style={{
            position: "absolute",
            top: videoRect.top,
            left: videoRect.left,
            width: videoRect.width,
            height: videoRect.height,
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          <SyntheticCursor path={mappedCursorPath} theme="dark" />
        </div>
      ) : null}

      {scene.chapter ? (
        <ChapterBadge theme={theme} text={scene.chapter} />
      ) : null}

      <SceneVoiceover file={scene.voiceoverFile} />
    </>
  );
};

const AbsoluteChromeBackdrop: React.FC<{ opacity: number; theme: Theme }> = ({
  opacity,
  theme,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: getChromeGradient(theme),
        opacity,
      }}
    />
  );
};

type AnimatedChromeShellProps = {
  scene: Pick<DemoSceneType, "chrome" | "url" | "tabs">;
  outerRect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  titleBarHeight: number;
  tabStripHeight: number;
  opacity: number;
};

const AnimatedChromeShell: React.FC<AnimatedChromeShellProps> = ({
  scene,
  outerRect,
  titleBarHeight,
  tabStripHeight,
  opacity,
}) => {
  if (scene.chrome === "none" || opacity <= 0.001) {
    return null;
  }

  const radius = interpolate(opacity, [0, 1], [0, CONTINUITY.radius]);
  const borderAlpha = interpolate(opacity, [0, 1], [0, 0.08]);
  const shellShadowAlpha = interpolate(opacity, [0, 1], [0, 0.6]);

  return (
    <div
      style={{
        position: "absolute",
        top: outerRect.top,
        left: outerRect.left,
        width: outerRect.width,
        height: outerRect.height,
        borderRadius: radius,
        border: `1px solid rgba(255,255,255,${borderAlpha})`,
        boxShadow: `0 40px 120px -20px rgba(0,0,0,${shellShadowAlpha})`,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {scene.tabs?.length ? (
        <ChromeSection height={tabStripHeight} opacity={opacity}>
          <ChromeTabStrip tabs={scene.tabs} />
        </ChromeSection>
      ) : null}
      <ChromeSection height={titleBarHeight} opacity={opacity}>
        <ChromeTitleBar variant={scene.chrome} url={scene.url} />
      </ChromeSection>
    </div>
  );
};

const ChromeSection: React.FC<{
  height: number;
  opacity: number;
  children: React.ReactNode;
}> = ({ height, opacity, children }) => {
  if (height <= 0.001 || opacity <= 0.001) {
    return null;
  }

  return (
    <div
      style={{
        height,
        overflow: "hidden",
        opacity,
      }}
    >
      {children}
    </div>
  );
};

/**
 * Loads `public/captures/<cursorFile>` at mount, converts `t_ms → frame`, and
 * returns a waypoint list for `SyntheticCursor`. Returns null when `cursorFile`
 * is undefined or the fetch fails — the scene falls through gracefully.
 *
 * `startOffsetSeconds` mirrors `scene.startOffset`: when the video is trimmed
 * via `<OffthreadVideo startFrom>`, cursor times must be rebased to scene-time
 * so the overlay tracks the trimmed content.
 */
function useCursorPath(
  cursorFile: string | undefined,
  fps: number,
  startOffsetSeconds: number,
): readonly CursorWaypoint[] | null {
  const [path, setPath] = useState<readonly CursorWaypoint[] | null>(null);

  useEffect(() => {
    if (!cursorFile) return;
    const handle = delayRender(`Loading cursor track: ${cursorFile}`);
    const url = staticFile(capturesPath(cursorFile));
    let cancelled = false;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`cursor fetch ${res.status}`);
        return res.json() as Promise<readonly CursorTrackEntry[]>;
      })
      .then((entries) => {
        if (cancelled) return;
        setPath(cursorJsonToWaypoints(entries, fps, startOffsetSeconds));
        continueRender(handle);
      })
      .catch(() => {
        // Capture not yet produced — skip overlay rather than failing the render.
        if (!cancelled) continueRender(handle);
      });

    return () => {
      cancelled = true;
    };
  }, [cursorFile, fps, startOffsetSeconds]);

  return path;
}

type TimelineOverlayProps = {
  scene: DemoSceneType;
  meta?: SceneWithMetadata;
  sourceTransform: SourceToViewportTransform;
  viewportSize: ViewportSize;
  children: React.ReactNode;
};

/**
 * Wraps children in zero-or-more `ZoomFrame`s and renders scene-level overlays
 * (currently SFX + auto-emitted click ripples). When no `timeline` or no `meta`
 * is provided (Studio preview before metadata resolves), the children pass
 * through untouched.
 */
const TimelineOverlay: React.FC<TimelineOverlayProps> = ({
  scene,
  meta,
  sourceTransform,
  viewportSize,
  children,
}) => {
  if (!scene.timeline || scene.timeline.length === 0 || !meta) {
    return <>{children}</>;
  }
  return (
    <TimelineInner
      scene={scene}
      meta={meta}
      sourceTransform={sourceTransform}
      viewportSize={viewportSize}
    >
      {children}
    </TimelineInner>
  );
};

/**
 * Separated from TimelineOverlay so `useTimelineRunner` only runs when we have
 * a timeline + meta — hook rules require consistent call counts, so the guard
 * must happen at a component boundary.
 */
const TimelineInner: React.FC<Required<TimelineOverlayProps>> = ({
  scene,
  meta,
  sourceTransform,
  viewportSize,
  children,
}) => {
  // `null` rawScript: demo scenes have no `{{MARK}}` annotations — only
  // absolute-frame starts and `{after}` chain refs are supported here.
  const { byKind } = useTimelineRunner(scene, meta, null);

  const zoomed = byKind.zoom.reduce<React.ReactNode>(
    (inner, evt) => {
      const p = evt.payload as {
        x?: number;
        y?: number;
        w?: number;
        h?: number;
        scale?: number;
      };
      const region = {
        x: p.x ?? 0,
        y: p.y ?? 0,
        w: p.w ?? 400,
        h: p.h ?? 300,
      };
      const dur = evt.durationFrames ?? 60;
      return (
        <ZoomFrame
          at={evt.resolvedStart}
          release={evt.resolvedStart + dur}
          region={mapSourceRectToViewport(region, sourceTransform)}
          scale={p.scale}
          frameSize={viewportSize}
          durationFrames={24}
        >
          {inner}
        </ZoomFrame>
      );
    },
    children,
  );

  return (
    <>
      {zoomed}
      {/* Use timeline `click` events for clicks NOT represented in `cursorFile` —
          e.g. synthetic clicks on overlaid UI. Clicks already in the cursor JSON
          render their own ripple via `SyntheticCursor`, so listing them here
          would double up. */}
      {byKind.click.map((evt) => {
        const p = evt.payload as { x?: number; y?: number };
        if (p.x === undefined || p.y === undefined) return null;
        const point = mapSourcePointToViewport(
          { x: p.x, y: p.y },
          sourceTransform,
        );
        return (
          <ClickRipple
            key={evt.id}
            at={evt.resolvedStart}
            x={point.x}
            y={point.y}
            theme="dark"
          />
        );
      })}
      {byKind.sfx.map((evt) => {
        const p = evt.payload as {
          file?: string;
          volume?: number;
          durationInFrames?: number;
        };
        if (!p.file) return null;
        return (
          <SfxTrigger
            key={evt.id}
            at={evt.resolvedStart}
            src={`sfx/${p.file}`}
            volume={p.volume}
            durationInFrames={p.durationInFrames}
          />
        );
      })}
    </>
  );
};

const ChapterBadge: React.FC<{ theme: Theme; text: string }> = ({ theme, text }) => {
  const c = COLORS[theme];
  return (
    <div
      style={{
        position: "absolute",
        top: 24,
        left: 24,
        ...REGULAR_FONT,
        fontSize: 20,
        color: c.WORD_COLOR_ON_BG_APPEARED,
        background: `${c.BACKGROUND}E6`,
        border: `1px solid ${c.BORDER_COLOR}`,
        borderRadius: 999,
        padding: "6px 14px",
        backdropFilter: "blur(12px)",
      }}
    >
      {text}
    </div>
  );
};
