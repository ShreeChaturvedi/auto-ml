/** Relative path (inside `public/`) where ElevenLabs VO MP3s live. */
export const VOICEOVER_FOLDER = "voiceover/main";

/** Relative path (inside `public/`) where screen recordings land. */
export const MAIN_VIDEO_FOLDER = "main";

export const voiceoverPath = (file: string): string =>
  `${VOICEOVER_FOLDER}/${file}`;

export const mainVideoPath = (file: string): string =>
  `${MAIN_VIDEO_FOLDER}/${file}`;
