import type { CalculateMetadataFunction } from "remotion";
import { staticFile } from "remotion";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import type { MainProps } from "../Main";
import type {
  ChapterMark,
  SceneAlignment,
  SceneWithMetadata,
  SelectableScene,
} from "../../config/scenes";
import { FPS } from "../../config/fps";
import { DIMENSIONS } from "../../config/layout";
import {
  captureMetaFileForVideo,
  getCaptureMediaDurationFrames,
} from "../helpers/demoMedia";
import { capturesPath, voiceoverPath } from "../helpers/paths";

const hasVoiceover = (
  scene: SelectableScene,
): scene is SelectableScene & { voiceoverFile: string } => {
  return "voiceoverFile" in scene && typeof scene.voiceoverFile === "string";
};

/**
 * Swap an MP3 basename for its alignment sidecar sibling.
 * `scene-intro.mp3` → `scene-intro.alignment.json`. Kept inline rather
 * than elevated to helpers/paths.ts since it's a single call site today.
 */
const alignmentFileFor = (mp3File: string): string =>
  mp3File.replace(/\.mp3$/i, ".alignment.json");

type SceneTimingData = {
  durationInFrames: number;
  captureSize?: {
    width: number;
    height: number;
  };
  alignment?: SceneAlignment;
  /** False when the scene declared a `voiceoverFile` but the MP3 failed to
   * load — used downstream to strip the filename so `<SceneVoiceover>` stays
   * silent instead of crashing the render on a 404. */
  voiceoverAvailable: boolean;
};

/**
 * Load alignment sidecar from `public/voiceover/main/<basename>.alignment.json`.
 * Absent / unreadable sidecars are silently tolerated — scenes without marks
 * still work, they just get no `alignment` field in their metadata.
 */
const loadAlignment = async (
  voiceoverFile: string,
): Promise<SceneAlignment | undefined> => {
  const url = staticFile(voiceoverPath(alignmentFileFor(voiceoverFile)));
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    return (await res.json()) as SceneAlignment;
  } catch {
    return undefined;
  }
};

const loadDuration = async (
  voiceoverFile: string,
): Promise<number | null> => {
  try {
    const seconds = await getAudioDurationInSeconds(
      staticFile(voiceoverPath(voiceoverFile)),
    );
    return Math.max(1, Math.ceil(seconds * FPS));
  } catch (err) {
    console.warn(
      `[calc-metadata] Failed to read voiceover "${voiceoverFile}" — falling back to capture metadata or scene.durationInFrames. Cause:`,
      err,
    );
    return null;
  }
};

type CaptureMeta = {
  durationMs?: number;
  width?: number;
  height?: number;
};

const loadCaptureData = async (
  scene: SelectableScene,
): Promise<{
  durationInFrames: number | null;
  captureSize?: {
    width: number;
    height: number;
  };
}> => {
  if (scene.type !== "demo") {
    return { durationInFrames: null };
  }

  const metaFile = captureMetaFileForVideo(scene.videoFile);
  const url = staticFile(capturesPath(metaFile));

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { durationInFrames: null };
    }
    const meta = (await res.json()) as CaptureMeta;
    const captureSize =
      Number.isFinite(meta.width) &&
      Number.isFinite(meta.height) &&
      (meta.width ?? 0) > 0 &&
      (meta.height ?? 0) > 0
        ? {
            width: Math.round(meta.width ?? 0),
            height: Math.round(meta.height ?? 0),
          }
        : undefined;

    return {
      durationInFrames: getCaptureMediaDurationFrames({
        durationMs: meta.durationMs ?? Number.NaN,
        startOffsetSeconds: scene.startOffset,
        endOffsetSeconds: scene.endOffset,
        fps: FPS,
      }),
      ...(captureSize ? { captureSize } : {}),
    };
  } catch {
    return { durationInFrames: null };
  }
};

/**
 * Resolve a scene's duration (in frames) and its optional alignment sidecar.
 *
 * Duration priority: voiceover MP3 length → capture meta duration →
 * scene.durationInFrames. VO durations drive total composition length so scene
 * content determines pacing rather than hardcoded numbers. When a capture beat
 * exists but the MP3 does not, `.meta.json` keeps demo scenes aligned to the
 * trimmed clip length instead of holding on a dead last frame.
 *
 * MP3 duration, alignment JSON, and capture metadata are loaded **in parallel**
 * per scene, so metadata resolution across many scenes parallelises fully via
 * the outer `Promise.all` in computeScenesWithMetadata.
 */
const resolveSceneData = async (
  scene: SelectableScene,
): Promise<SceneTimingData> => {
  const [voiceoverDuration, alignment, captureData] = await Promise.all([
    hasVoiceover(scene) ? loadDuration(scene.voiceoverFile) : Promise.resolve(null),
    hasVoiceover(scene)
      ? loadAlignment(scene.voiceoverFile)
      : Promise.resolve(undefined),
    loadCaptureData(scene),
  ]);

  return {
    durationInFrames:
      voiceoverDuration ?? captureData.durationInFrames ?? scene.durationInFrames,
    voiceoverAvailable:
      hasVoiceover(scene) && voiceoverDuration !== null,
    ...(captureData.captureSize ? { captureSize: captureData.captureSize } : {}),
    ...(alignment ? { alignment } : {}),
  };
};

const getChapterTitle = (scene: SelectableScene): string | null => {
  if (scene.type === "demo" && scene.chapter) return scene.chapter;
  if (scene.type === "title") return scene.title;
  return null;
};

const computeScenesWithMetadata = async (
  scenes: SelectableScene[],
): Promise<SceneWithMetadata[]> => {
  const timings = await Promise.all(scenes.map(resolveSceneData));
  let cursor = 0;
  return scenes.map((scene, i) => {
    const timing = timings[i] ?? {
      durationInFrames: 0,
      voiceoverAvailable: false,
    };
    const from = cursor;
    cursor += timing.durationInFrames;
    // When the scene claims a VO file but the MP3 can't be resolved (not yet
    // generated, path typo, network hiccup), drop `voiceoverFile` from the
    // resolved scene so `<SceneVoiceover>` renders nothing instead of feeding
    // a 404 URL to `<Audio>`, which would crash the renderer. The scene's
    // `durationInFrames` has already fallen back to its own declared value.
    const resolvedScene: SelectableScene =
      hasVoiceover(scene) && !timing.voiceoverAvailable
        ? ({ ...scene, voiceoverFile: undefined } as SelectableScene)
        : scene;
    return {
      scene: resolvedScene,
      from,
      durationInFrames: timing.durationInFrames,
      chapter: getChapterTitle(resolvedScene),
      ...(timing.captureSize ? { captureSize: timing.captureSize } : {}),
      ...(timing.alignment ? { alignment: timing.alignment } : {}),
    };
  });
};

const computeChapters = (scenes: SceneWithMetadata[]): ChapterMark[] => {
  const chapters: ChapterMark[] = [];
  scenes.forEach((s) => {
    if (!s.chapter) return;
    // Dedupe consecutive identical chapter titles so demo scenes sharing a
    // chapter label don't create multiple ToC entries.
    const last = chapters[chapters.length - 1];
    if (last && last.title === s.chapter) return;
    chapters.push({
      index: chapters.length,
      title: s.chapter,
      start: s.from,
    });
  });
  return chapters;
};

export const calcMetadata: CalculateMetadataFunction<MainProps> = async ({
  props,
}) => {
  const scenesAndMetadata = await computeScenesWithMetadata(props.scenes);
  const chapters = computeChapters(scenesAndMetadata);

  const totalDurationInFrames = scenesAndMetadata.reduce(
    (sum, s) => sum + s.durationInFrames,
    0,
  );

  const { width, height } = DIMENSIONS[props.canvasLayout];

  return {
    durationInFrames: Math.max(1, totalDurationInFrames),
    width,
    height,
    fps: FPS,
    props: {
      ...props,
      scenesAndMetadata,
      chapters,
    },
  };
};
