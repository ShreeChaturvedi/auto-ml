import type { CalculateMetadataFunction } from "remotion";
import { staticFile } from "remotion";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import type { MainProps } from "../Main";
import type {
  ChapterMark,
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
 * Resolve a scene's duration in frames.
 *
 * Priority: voiceover MP3 length → scene.durationInFrames.
 * VO durations drive total composition length, so scene content determines
 * pacing rather than hardcoded numbers. Every scene variant defines
 * `durationInFrames` with a default (see config/scenes.ts), so the
 * fallback branch is always safe.
 */
const resolveDuration = async (scene: SelectableScene): Promise<number> => {
  if (hasVoiceover(scene)) {
    try {
      const seconds = await getAudioDurationInSeconds(
        staticFile(voiceoverPath(scene.voiceoverFile)),
      );
      return Math.max(1, Math.ceil(seconds * FPS));
    } catch (err) {
      console.warn(
        `[calc-metadata] Failed to read voiceover "${scene.voiceoverFile}" for scene type "${scene.type}" — falling back to scene.durationInFrames. Cause:`,
        err,
      );
    }
  }
  return scene.durationInFrames;
};

const getChapterTitle = (scene: SelectableScene): string | null => {
  if (scene.type === "demo" && scene.chapter) return scene.chapter;
  if (scene.type === "title") return scene.title;
  return null;
};

const computeScenesWithMetadata = async (
  scenes: SelectableScene[],
): Promise<SceneWithMetadata[]> => {
  const durations = await Promise.all(scenes.map(resolveDuration));
  let cursor = 0;
  return scenes.map((scene, i) => {
    const durationInFrames = durations[i] ?? 0;
    const from = cursor;
    cursor += durationInFrames;
    return {
      scene,
      from,
      durationInFrames,
      chapter: getChapterTitle(scene),
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
