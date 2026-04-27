import { Player, type PlayerRef } from "@remotion/player";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FPS } from "../config/fps";
import { DIMENSIONS } from "../config/layout";
import { DEFAULT_THEME } from "../config/themes";
import { PresenterComposition } from "./PresenterComposition";
import { PresenterOverlay } from "./PresenterOverlay";
import {
  FULL_ANIMATION_IDS,
  PRESENTATION_SCENES,
  settleFrameFor,
} from "./slides";

/** Milliseconds between accepted nav keystrokes. Prevents a button-mashed
 *  ArrowRight from firing `setIndex` faster than `<Player>` can remount. */
const NAV_DEBOUNCE_MS = 120;

/**
 * Presenter shell.
 *
 * Slide-deck semantics with dramatic bookends:
 *   - Intermediate slides land on their settled final composition, wrapped
 *     in a 200ms CSS fade-in (keyed on `scene.id`, so remount re-triggers
 *     the animation) for a minimal entry feel without replaying the full
 *     7–72s Remotion narrative animations.
 *   - First slide (`title`) and last (`thank-you`) play the FULL Remotion
 *     animation from frame 0 via `autoPlay` — see `FULL_ANIMATION_IDS`.
 *
 * Manual controls on every slide: `P` replays the entry animation from
 * frame 0, `R` rewinds to 0 paused, `E` seeks to the settled frame.
 *
 * Implementation: Player is mounted once per slide (keyed on `scene.id`).
 * On each remount for intermediate slides, the scene-change effect
 * pauses + seeks to the settled frame. The initial transient render at
 * frame 0 exists for one tick before the seek lands; imperceptible at
 * 60fps and masked by the fade-in wrapper.
 */
export const App: React.FC = () => {
  const [index, setIndex] = useState(0);
  const [showUi, setShowUi] = useState(true);
  const [speed, setSpeed] = useState(1);
  const playerRef = useRef<PlayerRef>(null);
  // Fullscreen target is the OUTER wrapper (not the Player), because the
  // Player is key'd on `scene.id` and unmounts on every navigation — if
  // fullscreen were requested on the Player, the browser would auto-exit
  // fullscreen the moment the Player element is removed from the DOM on
  // the next ArrowRight. The wrapper is stable across navigation, so
  // fullscreen persists for the whole presenter session.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const lastNavRef = useRef(0);

  // Safe because PRESENTATION_SCENES is non-empty and index is clamped by `go`.
  const scene = PRESENTATION_SCENES[index]!;
  const playsFullAnimation = FULL_ANIMATION_IDS.has(scene.id);

  const go = useCallback((delta: number) => {
    const now = Date.now();
    if (now - lastNavRef.current < NAV_DEBOUNCE_MS) return;
    lastNavRef.current = now;
    setIndex((i) =>
      Math.min(PRESENTATION_SCENES.length - 1, Math.max(0, i + delta)),
    );
  }, []);

  // Land on the settled composition. Fires on mount (new Player instance
  // per `key={scene.id}`) and any time the scene changes underneath it.
  // Most slides settle on `durationInFrames - 1`; a few (`hook`, etc.)
  // override via `SLIDE_SETTLE_FRAMES` in slides.ts.
  //
  // Skipped for `FULL_ANIMATION_IDS` slides — those play from frame 0 via
  // `autoPlay` so the dramatic bookends run their full timeline.
  useEffect(() => {
    if (playsFullAnimation) return;
    const p = playerRef.current;
    if (!p) return;
    p.pause();
    p.seekTo(settleFrameFor(scene));
  }, [scene, playsFullAnimation]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      switch (e.key) {
        case "ArrowRight":
        case " ":
        case "PageDown":
          e.preventDefault();
          go(1);
          return;
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          go(-1);
          return;
        case "Home":
          setIndex(0);
          return;
        case "End":
          setIndex(PRESENTATION_SCENES.length - 1);
          return;
        case "f":
        case "F":
          // Toggle: exit if already fullscreen, else request on the
          // wrapper (NOT the Player — see `wrapperRef` comment above).
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          } else {
            wrapperRef.current?.requestFullscreen().catch(() => {});
          }
          return;
        case "h":
        case "H":
          setShowUi((v) => !v);
          return;
        case "p":
        case "P":
          // Play the entry animation from frame 0 — opt-in because
          // default behavior lands on the settled final frame.
          playerRef.current?.seekTo(0);
          playerRef.current?.play();
          return;
        case "r":
        case "R":
          // Rewind to frame 0, paused.
          playerRef.current?.pause();
          playerRef.current?.seekTo(0);
          return;
        case "e":
        case "E":
          // Jump to the slide's settled frame (same as default landing
          // state; exposed for muscle memory after a P-triggered play).
          playerRef.current?.pause();
          playerRef.current?.seekTo(settleFrameFor(scene));
          return;
        case "2":
          setSpeed((s) => (s === 1 ? 2 : 1));
          return;
      }
    };
    // Listen on `document` (not `window`) with capture: true so we receive
    // keydowns when the Remotion Player is fullscreen. In fullscreen, the
    // browser dispatches keyboard events to the fullscreen element; with
    // capture-phase listening on `document`, we intercept them before any
    // Player-internal handler can stop propagation, and we avoid the known
    // browser quirk where events sometimes fail to bubble to `window` from
    // a non-focusable fullscreen element.
    document.addEventListener("keydown", onKey, { capture: true });
    return () =>
      document.removeEventListener("keydown", onKey, { capture: true });
  }, [go, scene]);

  const inputProps = useMemo(
    () => ({ scene, theme: DEFAULT_THEME }),
    [scene],
  );

  return (
    <div
      ref={wrapperRef}
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Match the light-theme slide background so the 220ms Player
        // fade-in (opacity 0.6 → 1) reveals WHITE behind the Player,
        // not a dark wrapper. Without this, every slide change looked
        // like a brief dimming/flash-to-black.
        background: "#FFFFFF",
      }}
    >
      <Player
        // Remount-per-slide: key'd on `scene.id` so every ArrowRight/
        // ArrowLeft unmounts and re-mounts the Player. The mount effect
        // above then seeks to the settled final frame (for intermediate
        // slides) or lets `autoPlay` roll from frame 0 (for bookend
        // slides). No cross-scene state leakage; no timeline scrubbing
        // UI exposed to the user. Fresh DOM node per key also re-triggers
        // the `presenter-slide-fade-in` keyframe animation below.
        key={scene.id}
        ref={playerRef}
        component={PresenterComposition}
        inputProps={inputProps}
        durationInFrames={scene.durationInFrames}
        fps={FPS}
        compositionWidth={DIMENSIONS.landscape.width}
        compositionHeight={DIMENSIONS.landscape.height}
        style={{
          width: "100vw",
          height: "100vh",
          maxWidth: "100vw",
          maxHeight: "100vh",
          animation: "presenter-slide-fade-in 220ms ease-out both",
        }}
        // Bookend slides (`title`, `thank-you`) autoPlay from frame 0 so
        // the full Remotion animation runs. Intermediate slides start
        // paused; the mount effect seeks them to the settled frame.
        autoPlay={playsFullAnimation}
        controls={false}
        clickToPlay={false}
        spaceKeyToPlayOrPause={false}
        // Still muted in case any future slide adds an <Audio> element —
        // prevents autoplay policy from blocking a P-triggered play().
        initiallyMuted
        playbackRate={speed}
        acknowledgeRemotionLicense
      />
      {showUi && (
        <PresenterOverlay
          index={index}
          total={PRESENTATION_SCENES.length}
          sceneId={scene.id}
          speed={speed}
        />
      )}
    </div>
  );
};
