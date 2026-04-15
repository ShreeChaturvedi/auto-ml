/**
 * LandingScreen — Beat 1.
 *
 * Composes the captured landing PNG (Playwright-driven, see
 * `video/scripts/capture-landing.ts`) inside a `ScrollViewport`, with 4
 * live React ports overlaid at the same positions the page would occupy
 * at rest. The ports drive the animated brand moments at scene frame 0:
 *
 *   - NavLive            wordmark long→short morph
 *   - HeroLive           pill trace + title deblur + agentically shimmer
 *   - FeaturesLiveChat   01 CHAT card (appears during zoom #2)
 *   - FooterAgentLive    giant AGENT wordmark (appears near the end)
 *
 * Timeline scroll + zoom events come from `LANDING_SCROLL`, keyed to the
 * voiceover marks in `LANDING_VOICEOVER`. A small `ZoomMultiplexer` below
 * picks the currently-active zoom (at most one at a time) and wraps the
 * whole scroll viewport in a single ZoomFrame.
 */
import React, { useMemo } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { ScrollViewport } from "../../../primitives/ScrollViewport";
import { ZoomFrame } from "../../../primitives/ZoomFrame";
import { SfxTrigger } from "../../../primitives/SfxTrigger";
import { NavLive } from "../../../app-mirror/landing/NavLive";
import { HeroLive } from "../../../app-mirror/landing/HeroLive";
import { FeaturesLiveChat } from "../../../app-mirror/landing/FeaturesLiveChat";
import { FooterAgentLive } from "../../../app-mirror/landing/FooterAgentLive";
import { useTimelineRunner, type ResolvedTimelineEvent } from "../useTimelineRunner";
import hotspotsJson from "../../../../public/landing/hotspots.json";
import type { AppScreenComponent } from "../screenRegistry";
import { LANDING_VOICEOVER } from "../../../../fixtures/timelines/landing-scroll";

// ---------------------------------------------------------------------------
// Coordinate system
// ---------------------------------------------------------------------------
// The landing was captured at a 1440-wide CSS viewport. Composition is 1920 ×
// 1080, so overlay positions, scroll offsets, and hotspot bboxes — all in
// CSS-px from the capture script — are scaled by COMP_WIDTH / 1440.

const COMP_WIDTH = 1920;
const LANDING_CSS_WIDTH = 1440;
const PNG_SCALE = COMP_WIDTH / LANDING_CSS_WIDTH;

type Hotspot = { x: number; y: number; w: number; h: number };
const hotspots = hotspotsJson as Record<string, Hotspot | undefined>;

// ---------------------------------------------------------------------------
// ZoomMultiplexer — activates one ZoomFrame at a time based on current frame.
// ---------------------------------------------------------------------------

const DEFAULT_ZOOM_DUR = 72;

type ZoomMultiplexerProps = {
  events: readonly ResolvedTimelineEvent[];
  children: React.ReactNode;
};

const ZoomMultiplexer: React.FC<ZoomMultiplexerProps> = ({ events, children }) => {
  const frame = useCurrentFrame();

  // Pick the active zoom — the one whose [start-engage, start+dur+release]
  // window contains the current frame. Sequential fixtures guarantee at
  // most one hit at any time.
  const active = useMemo(() => {
    for (const e of events) {
      const dur = e.durationFrames ?? DEFAULT_ZOOM_DUR;
      const engage = e.resolvedStart - 24;
      const release = e.resolvedStart + dur + 24;
      if (frame >= engage && frame <= release) return e;
    }
    return null;
  }, [events, frame]);

  if (!active) return <>{children}</>;

  const target = (active.payload.target as string | undefined) ?? "";
  const bbox = hotspots[target];
  if (!bbox) return <>{children}</>;

  const region = {
    x: bbox.x * PNG_SCALE,
    y: bbox.y * PNG_SCALE,
    w: bbox.w * PNG_SCALE,
    h: bbox.h * PNG_SCALE,
  };
  const at = active.resolvedStart;
  const dur = active.durationFrames ?? DEFAULT_ZOOM_DUR;

  return (
    <ZoomFrame at={at} release={at + dur} region={region}>
      {children}
    </ZoomFrame>
  );
};

// ---------------------------------------------------------------------------
// LandingScreen
// ---------------------------------------------------------------------------

export const LandingScreen: AppScreenComponent = ({ scene, meta }) => {
  const { byKind } = useTimelineRunner(scene, meta, LANDING_VOICEOVER);

  // Scroll keyframes — VO-mark-relative y-offsets (landing CSS px → scaled).
  //
  // Fallback: when `meta.alignment` is undefined (no `scene-landing.mp3` yet,
  // local dev without captured voiceover), `useVoiceoverAlignment` degrades
  // every `{{MARK}}` ref to frame 0. All scroll events then resolve to the
  // same frame, collapsing ScrollViewport's keyframes to a single t=0 point
  // — the page never scrolls. Until the MP3 + alignment sidecar land we
  // substitute EVEN-SPACED numeric-frame keyframes so scroll still plays in
  // the Studio preview. The y-offsets match the original mark-anchored
  // payloads (0 → 800 → 1800 → 2800 → 3800 → 4800 landing CSS-px), and the
  // `at` values are spread linearly across `scene.durationInFrames` (minus
  // a trailing 120-frame hold so the final footer zoom isn't clipped).
  // Once real alignment ships, `byKind.scrollTo` resolves to non-zero frames
  // again and the fallback branch stops firing.
  const scrollKeyframes = useMemo(() => {
    const realKeyframes = byKind.scrollTo.map((e) => ({
      at: e.resolvedStart,
      y: ((e.payload.y as number) ?? 0) * PNG_SCALE,
    }));

    const allAtZero =
      realKeyframes.length > 1 && realKeyframes.every((k) => k.at === 0);

    if (!meta.alignment && (realKeyframes.length === 0 || allAtZero)) {
      const fallbackOffsets = [0, 800, 1800, 2800, 3800, 4800];
      const tail = 120;
      const span = Math.max(scene.durationInFrames - tail, fallbackOffsets.length);
      const step = span / (fallbackOffsets.length - 1);
      return fallbackOffsets.map((y, i) => ({
        at: Math.round(i * step),
        y: y * PNG_SCALE,
      }));
    }

    return realKeyframes;
  }, [byKind.scrollTo, meta.alignment, scene.durationInFrames]);

  // Hotspot-driven overlay positions (fall back to "near end of scroll" if
  // no real hotspots.json is available — see placeholder script).
  const featuresTop = (hotspots["chat-card"]?.y ?? 2800) * PNG_SCALE;
  const footerTop = (hotspots["agent-wordmark"]?.y ?? 4800) * PNG_SCALE;

  return (
    <AbsoluteFill style={{ background: "#0A0A0B", overflow: "hidden" }}>
      <ZoomMultiplexer events={byKind.zoom}>
        <ScrollViewport keyframes={scrollKeyframes}>
          {/* Captured landing PNG, scaled from 1440 CSS-px → 1920 comp-px. */}
          <div
            style={{
              width: COMP_WIDTH,
              position: "relative",
            }}
          >
            <Img
              src={staticFile("landing/landing-full.png")}
              style={{
                width: COMP_WIDTH,
                height: "auto",
                display: "block",
              }}
            />

            {/* Live overlays — positioned at CSS-px coordinates scaled to comp. */}
            <NavLive width={COMP_WIDTH} />
            <div
              style={{
                position: "absolute",
                top: 184 * PNG_SCALE,
                left: 0,
                width: COMP_WIDTH,
              }}
            >
              <HeroLive width={COMP_WIDTH} />
            </div>
            <div
              style={{
                position: "absolute",
                top: featuresTop,
                left: 0,
                width: COMP_WIDTH,
              }}
            >
              <FeaturesLiveChat width={COMP_WIDTH} />
            </div>
            <div
              style={{
                position: "absolute",
                top: footerTop,
                left: 0,
                width: COMP_WIDTH,
              }}
            >
              <FooterAgentLive width={COMP_WIDTH} />
            </div>
          </div>
        </ScrollViewport>
      </ZoomMultiplexer>

      {/* SFX — siblings of the zoom so they don't participate in its transform. */}
      {byKind.sfx.map((e) => (
        <SfxTrigger
          key={e.id}
          at={e.resolvedStart}
          src={(e.payload.file as string) ?? ""}
          volume={(e.payload.volume as number) ?? 1}
        />
      ))}
    </AbsoluteFill>
  );
};
