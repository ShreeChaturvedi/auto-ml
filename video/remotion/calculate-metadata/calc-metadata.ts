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
import { voiceoverPath } from "../helpers/paths";

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
  alignment?: SceneAlignment;
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
      `[calc-metadata] Failed to read voiceover "${voiceoverFile}" — falling back to scene.durationInFrames. Cause:`,
      err,
    );
    return null;
  }
};

/**
 * Resolve a scene's duration (in frames) and its optional alignment sidecar.
 *
 * Duration priority: voiceover MP3 length → scene.durationInFrames.
 * VO durations drive total composition length so scene content determines
 * pacing rather than hardcoded numbers. Every scene variant defines
 * `durationInFrames` with a default (see config/scenes.ts), so the
 * fallback branch is always safe.
 *
 * MP3 duration and alignment JSON are loaded **in parallel** per scene, so
 * metadata resolution across many scenes parallelises fully via the
 * outer `Promise.all` in computeScenesWithMetadata.
 */
const resolveSceneData = async (
  scene: SelectableScene,
): Promise<SceneTimingData> => {
  if (!hasVoiceover(scene)) {
    return { durationInFrames: scene.durationInFrames };
  }
  const [duration, alignment] = await Promise.all([
    loadDuration(scene.voiceoverFile),
    loadAlignment(scene.voiceoverFile),
  ]);
  return {
    durationInFrames: duration ?? scene.durationInFrames,
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
    const timing = timings[i] ?? { durationInFrames: 0 };
    const from = cursor;
    cursor += timing.durationInFrames;
    return {
      scene,
      from,
      durationInFrames: timing.durationInFrames,
      chapter: getChapterTitle(scene),
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
