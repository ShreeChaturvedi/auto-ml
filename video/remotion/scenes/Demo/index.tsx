import React, { useEffect, useState } from "react";
import {
  continueRender,
  delayRender,
  OffthreadVideo,
  staticFile,
  useVideoConfig,
} from "remotion";
import type { z } from "zod";
import { REGULAR_FONT } from "../../../config/fonts";
import type { demoScene } from "../../../config/scenes";
import type { Theme } from "../../../config/themes";
import { COLORS, getChromeGradient } from "../../../config/themes";
import { BrowserChrome } from "../../helpers/BrowserChrome";
import { capturesPath, mainVideoPath } from "../../helpers/paths";
import { SceneVoiceover } from "../../helpers/SceneVoiceover";
import { useTimelineRunner } from "../../hooks/useTimelineRunner";
import { ClickRipple } from "../../primitives/ClickRipple";
import { SfxTrigger } from "../../primitives/SfxTrigger";
import {
  SyntheticCursor,
  type CursorWaypoint,
} from "../../primitives/SyntheticCursor";
import { ZoomFrame } from "../../primitives/ZoomFrame";
import type { SceneWithMetadata } from "../../../config/scenes";
import { cursorJsonToWaypoints, type CursorTrackEntry } from "./cursorJson";

type DemoSceneType = z.infer<typeof demoScene>;

type Props = {
  scene: DemoSceneType;
  theme: Theme;
  meta?: SceneWithMetadata;
};

/**
 * Demo scene: plays a Playwright-captured screen recording inside an optional
 * window chrome, with synthetic cursor + click-ripple + zoom + sfx overlays.
 *
 * Capture output lives in `public/captures/<beat>.{webm,cursor.json,meta.json}`
 * (see `scripts/capture-demo.ts`). Legacy Open-Recorder clips still work via
 * `videoRoot: "main"`.
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

  const cursorPath = useCursorPath(scene.cursorFile, fps);

  return (
    <BrowserChrome
      variant={scene.chrome}
      url={scene.url}
      outerBackground={getChromeGradient(theme)}
    >
      <TimelineOverlay scene={scene} meta={meta}>
        <OffthreadVideo
          src={videoSrc}
          startFrom={startFrom}
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </TimelineOverlay>

      {cursorPath ? <SyntheticCursor path={cursorPath} theme="dark" /> : null}

      {scene.chapter ? (
        <ChapterBadge theme={theme} text={scene.chapter} />
      ) : null}

      <SceneVoiceover file={scene.voiceoverFile} />
    </BrowserChrome>
  );
};

/**
 * Loads `public/captures/<cursorFile>` at mount, converts `t_ms → frame`, and
 * returns a waypoint list for `SyntheticCursor`. Returns null when `cursorFile`
 * is undefined or the fetch fails — the scene falls through gracefully.
 */
function useCursorPath(
  cursorFile: string | undefined,
  fps: number,
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
        setPath(cursorJsonToWaypoints(entries, fps));
        continueRender(handle);
      })
      .catch(() => {
        // Capture not yet produced — skip overlay rather than failing the render.
        if (!cancelled) continueRender(handle);
      });

    return () => {
      cancelled = true;
    };
  }, [cursorFile, fps]);

  return path;
}

type TimelineOverlayProps = {
  scene: DemoSceneType;
  meta?: SceneWithMetadata;
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
  children,
}) => {
  if (!scene.timeline || scene.timeline.length === 0 || !meta) {
    return <>{children}</>;
  }
  return <TimelineInner scene={scene} meta={meta}>{children}</TimelineInner>;
};

/**
 * Separated from TimelineOverlay so `useTimelineRunner` only runs when we have
 * a timeline + meta — hook rules require consistent call counts, so the guard
 * must happen at a component boundary.
 */
const TimelineInner: React.FC<Required<TimelineOverlayProps>> = ({
  scene,
  meta,
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
          region={region}
          scale={p.scale}
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
        return (
          <ClickRipple
            key={evt.id}
            at={evt.resolvedStart}
            x={p.x}
            y={p.y}
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
