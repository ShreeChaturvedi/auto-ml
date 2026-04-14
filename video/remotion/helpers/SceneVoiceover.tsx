import React from "react";
import { Audio, staticFile } from "remotion";
import { voiceoverPath } from "./paths";

/**
 * Plays the VO MP3 for a scene when `file` is defined. Renders nothing
 * otherwise.
 *
 * Accepts an undefined `file` so callers don't have to guard — this lets
 * scene components pass `scene.voiceoverFile` directly from Zod-parsed
 * props (which may be optional).
 */
export const SceneVoiceover: React.FC<{ file: string | undefined }> = ({
  file,
}) => {
  if (!file) return null;
  return <Audio src={staticFile(voiceoverPath(file))} />;
};
