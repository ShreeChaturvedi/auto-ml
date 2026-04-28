/**
 * Voiceover generator.
 *
 * Reads narration scripts from `voiceover/scripts/*.txt`, synthesises each
 * via ElevenLabs' `/with-timestamps` endpoint, and writes:
 *   - MP3 audio → `public/voiceover/main/<basename>.mp3`
 *   - Alignment sidecar → `public/voiceover/main/<basename>.alignment.json`
 *
 * Scripts may embed inline `{{MARK_NAME}}` tokens. These are stripped from
 * the text sent to the API (otherwise the TTS voice would speak them) but
 * their character-position in the stripped text is recorded at runtime by
 * `resolveMarks()` → each mark → frame at which the following character
 * begins being spoken.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=... npm run voiceover
 *   ELEVENLABS_API_KEY=... npm run voiceover scene-intro scene-team  # subset
 *
 * Environment:
 *   ELEVENLABS_API_KEY   required
 *   ELEVENLABS_VOICE_ID  optional, defaults to Rachel (21m00Tcm4TlvDq8ikWAM)
 *   ELEVENLABS_MODEL_ID  optional, defaults to eleven_multilingual_v2
 *
 * Idempotent: existing outputs are only regenerated if the source .txt is
 * newer than BOTH the MP3 and the .alignment.json, or `--force` is passed.
 */

import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { walkScript } from "./resolveMarks";

const HERE = dirname(fileURLToPath(import.meta.url));
const VIDEO_ROOT = resolve(HERE, "..");
const SCRIPTS_DIR = join(VIDEO_ROOT, "voiceover", "scripts");
const OUTPUT_DIR = join(VIDEO_ROOT, "public", "voiceover", "main");

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "nPczCjzI2devNBz1zQrb"; // Brian
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2";

type CliFlags = { force: boolean; only: Set<string> | null };

type AlignmentBlock = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

type SynthesisResult = {
  audio: Buffer;
  alignment: AlignmentBlock;
};

/**
 * Max ElevenLabs requests in flight. Free tier allows 2 concurrent, Creator
 * ~5, Pro ~10. 3 is conservative enough to work across plans without
 * burning into rate limits. Override with ELEVENLABS_CONCURRENCY if your
 * plan supports more.
 */
const CONCURRENCY = Math.max(
  1,
  Math.min(10, Number(process.env.ELEVENLABS_CONCURRENCY ?? "3")),
);

const parseArgs = (argv: string[]): CliFlags => {
  const positional: string[] = [];
  let force = false;
  for (const arg of argv) {
    if (arg === "--force" || arg === "-f") force = true;
    else if (!arg.startsWith("-")) positional.push(arg);
  }
  return {
    force,
    only: positional.length > 0 ? new Set(positional) : null,
  };
};

/**
 * Run `workers` in parallel with `limit` in flight at a time.
 * Resolves when all workers have completed.
 */
const runWithConcurrency = async <T,>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> => {
  const results = new Array<T>(tasks.length);
  let nextIndex = 0;
  const runOne = async (): Promise<void> => {
    for (;;) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= tasks.length) return;
      const fn = tasks[i];
      if (!fn) return;
      results[i] = await fn();
    }
  };
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, runOne);
  await Promise.all(workers);
  return results;
};

const listScripts = async (): Promise<string[]> => {
  try {
    const entries = await readdir(SCRIPTS_DIR);
    return entries.filter((f) => f.endsWith(".txt")).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
};

/**
 * Strip `{{MARK_NAME}}` tokens AND markdown emphasis (`**bold**`, `*em*`,
 * `__bold__`, `_em_`) from the script. Delegates to `walkScript` from
 * `resolveMarks` so the TTS payload is byte-identical to what the
 * runtime alignment walker produces. Drift between the two would cause
 * `resolveMarks: stripped text length does not match...` at render time.
 */
const stripMarks = (text: string): string => walkScript(text).strippedText;

/**
 * True when `target` is missing or older than `source`. Used to decide
 * whether to regenerate a sidecar file.
 */
const isStaleAgainst = async (
  target: string,
  source: string,
): Promise<boolean> => {
  try {
    const [t, s] = await Promise.all([stat(target), stat(source)]);
    return t.mtimeMs < s.mtimeMs;
  } catch {
    return true; // missing target → stale
  }
};

const synthesize = async (text: string): Promise<SynthesisResult> => {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY as string,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: {
        // Tuned for a confident, non-AI-sounding technical-launch narrator.
        // - stability ↑ 0.55 evens out phrasing and kills bullet-point staccato.
        // - similarity_boost ↑ 0.85 locks to the voice's natural timbre.
        // - style 0 removes dramatic reading — pure declarative delivery.
        stability: 0.55,
        similarity_boost: 0.85,
        style: 0,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `ElevenLabs request failed (${res.status} ${res.statusText}): ${body.slice(0, 400)}`,
    );
  }

  const json = (await res.json()) as {
    audio_base64?: string;
    alignment?: AlignmentBlock;
  };

  if (!json.audio_base64 || !json.alignment) {
    throw new Error(
      `ElevenLabs response missing audio_base64 or alignment: ${JSON.stringify(json).slice(0, 200)}`,
    );
  }

  return {
    audio: Buffer.from(json.audio_base64, "base64"),
    alignment: json.alignment,
  };
};

const run = async () => {
  if (!API_KEY) {
    console.error(
      "[voiceover] ELEVENLABS_API_KEY is not set. Export it or add to .env.local.",
    );
    process.exit(1);
  }

  const { force, only } = parseArgs(process.argv.slice(2));

  await mkdir(OUTPUT_DIR, { recursive: true });

  const files = await listScripts();
  if (files.length === 0) {
    console.error(
      `[voiceover] No .txt scripts found in ${SCRIPTS_DIR}. Create files like ` +
        `"scene-intro.txt" with narration text.`,
    );
    process.exit(1);
  }

  const targets = only
    ? files.filter((f) => only.has(f.replace(/\.txt$/, "")))
    : files;

  if (only && targets.length === 0) {
    console.error(
      `[voiceover] No scripts matched: ${Array.from(only).join(", ")}. Available: ${files
        .map((f) => f.replace(/\.txt$/, ""))
        .join(", ")}`,
    );
    process.exit(1);
  }

  let generated = 0;
  let skipped = 0;

  const tasks = targets.map((file) => async () => {
    const base = file.replace(/\.txt$/, "");
    const src = join(SCRIPTS_DIR, file);
    const dstAudio = join(OUTPUT_DIR, `${base}.mp3`);
    const dstAlignment = join(OUTPUT_DIR, `${base}.alignment.json`);

    if (!force) {
      const [audioStale, alignStale] = await Promise.all([
        isStaleAgainst(dstAudio, src),
        isStaleAgainst(dstAlignment, src),
      ]);
      if (!audioStale && !alignStale) {
        console.log(`[voiceover] skip ${base} (outputs newer than source)`);
        skipped += 1;
        return;
      }
    }

    const raw = (await readFile(src, "utf8")).trim();
    if (!raw) {
      console.warn(`[voiceover] skip ${base} (empty script)`);
      skipped += 1;
      return;
    }

    const text = stripMarks(raw);
    if (!text) {
      console.warn(`[voiceover] skip ${base} (script is all marks, no text)`);
      skipped += 1;
      return;
    }

    console.log(
      `[voiceover] synthesise ${base} (${text.length} chars, ${raw.length - text.length} mark chars stripped)...`,
    );
    const { audio, alignment } = await synthesize(text);
    await Promise.all([
      writeFile(dstAudio, audio),
      writeFile(dstAlignment, JSON.stringify(alignment)),
    ]);
    console.log(
      `[voiceover]   → ${dstAudio} (${(audio.length / 1024).toFixed(1)} KB) + alignment (${alignment.characters.length} chars)`,
    );
    generated += 1;
  });

  await runWithConcurrency(tasks, CONCURRENCY);

  console.log(
    `[voiceover] done. generated=${generated} skipped=${skipped} concurrency=${CONCURRENCY}`,
  );
};

run().catch((err) => {
  console.error("[voiceover] failed:", err);
  process.exit(1);
});
