/**
 * Voiceover generator.
 *
 * Reads narration scripts from `voiceover/scripts/*.txt`, synthesises each
 * with ElevenLabs, and writes the resulting MP3s to
 * `public/voiceover/main/<basename>.mp3`.
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
 * Idempotent: existing MP3s are only regenerated if the source .txt is
 * newer or the --force flag is passed.
 */

import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const VIDEO_ROOT = resolve(HERE, "..");
const SCRIPTS_DIR = join(VIDEO_ROOT, "voiceover", "scripts");
const OUTPUT_DIR = join(VIDEO_ROOT, "public", "voiceover", "main");

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM"; // Rachel
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2";

type CliFlags = { force: boolean; only: Set<string> | null };

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

const isOlder = async (outputPath: string, sourcePath: string): Promise<boolean> => {
  try {
    const [outStat, srcStat] = await Promise.all([stat(outputPath), stat(sourcePath)]);
    return outStat.mtimeMs < srcStat.mtimeMs;
  } catch {
    return true; // missing output → treat as stale
  }
};

const synthesize = async (text: string): Promise<Buffer> => {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY as string,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.7,
        style: 0.15,
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

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
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
    const dst = join(OUTPUT_DIR, `${base}.mp3`);

    if (!force && !(await isOlder(dst, src))) {
      console.log(`[voiceover] skip ${base} (output is newer than source)`);
      skipped += 1;
      return;
    }

    const text = (await readFile(src, "utf8")).trim();
    if (!text) {
      console.warn(`[voiceover] skip ${base} (empty script)`);
      skipped += 1;
      return;
    }

    console.log(`[voiceover] synthesise ${base} (${text.length} chars)...`);
    const audio = await synthesize(text);
    await writeFile(dst, audio);
    console.log(`[voiceover]   → ${dst} (${(audio.length / 1024).toFixed(1)} KB)`);
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
