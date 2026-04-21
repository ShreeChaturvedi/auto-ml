import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import {
  APP_DEMO_PHASES,
  APP_DEMO_PRESETS,
  type AppDemoPreset,
  getAppDemoScenesForPresets,
} from "../config/appDemo";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_ROOT = path.resolve(__dirname, "..");
const REMOTION_BIN = path.join(VIDEO_ROOT, "node_modules", ".bin", "remotion");
const OUT_DIR = path.join(VIDEO_ROOT, "out", "app-demo");
const PROPS_DIR = path.join(OUT_DIR, ".props");
const FINAL_RENDER_ARGS = [
  "--codec=h264",
  "--image-format=png",
  "--pixel-format=yuv420p",
  "--x264-preset=slow",
  "--crf=15",
] as const;
const DRAFT_RENDER_ARGS = [
  "--codec=h264",
  "--image-format=jpeg",
  "--pixel-format=yuv420p",
  "--crf=28",
  "--scale=0.5",
  "--x264-preset=fast",
] as const;

type Args = {
  phaseSelection: "all" | readonly AppDemoPreset[];
  draft: boolean;
};

const usage = () => {
  console.error(
    `Usage: tsx scripts/render-app-demo-chunks.ts --phase=<all|${APP_DEMO_PRESETS.join("|")}[,preset...]> [--draft]`,
  );
  process.exit(2);
};

const parseArgs = (argv: readonly string[]): Args => {
  let phaseArg: string | undefined;
  let draft = false;

  for (const arg of argv) {
    if (arg.startsWith("--phase=")) {
      phaseArg = arg.slice("--phase=".length);
      continue;
    }
    if (arg === "--draft") {
      draft = true;
    }
  }

  if (!phaseArg) {
    usage();
    throw new Error("unreachable");
  }
  const requestedPhases = phaseArg;
  if (requestedPhases === "all") {
    return { phaseSelection: "all", draft };
  }

  const requested = requestedPhases
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (requested.length === 0) usage();

  const invalid = requested.filter(
    (value): value is string => !APP_DEMO_PRESETS.includes(value as AppDemoPreset),
  );
  if (invalid.length > 0) {
    console.error(`[render-app-demo-chunks] Unknown phase(s): ${invalid.join(", ")}`);
    usage();
  }

  return {
    phaseSelection: requested as readonly AppDemoPreset[],
    draft,
  };
};

const selectedPhases = (args: Args) =>
  args.phaseSelection === "all"
    ? [...APP_DEMO_PHASES]
    : APP_DEMO_PHASES.filter((phase) => args.phaseSelection.includes(phase.preset));

const renderOne = async (
  preset: AppDemoPreset,
  outFile: string,
  propsFile: string,
  draft: boolean,
) => {
  const renderArgs = [
    "render",
    "remotion/index.ts",
    "main",
    outFile,
    `--props=${propsFile}`,
  ];

  if (draft) {
    renderArgs.push(...DRAFT_RENDER_ARGS);
  } else {
    // PNG frame extraction avoids introducing a JPEG layer before H.264,
    // which is noticeable on the app demo's small text and thin dividers.
    renderArgs.push(...FINAL_RENDER_ARGS);
  }

  execFileSync(REMOTION_BIN, renderArgs, {
    cwd: VIDEO_ROOT,
    stdio: "inherit",
  });

  console.log(`[render-app-demo-chunks] rendered ${preset} -> ${path.relative(VIDEO_ROOT, outFile)}`);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const phases = selectedPhases(args);

  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(PROPS_DIR, { recursive: true });

  for (const [index, phase] of phases.entries()) {
    const propsPath = path.join(PROPS_DIR, `${phase.preset}.json`);
    const outPath = path.join(
      OUT_DIR,
      `${String(index + 1).padStart(2, "0")}-${phase.preset}${args.draft ? "-draft" : ""}.mp4`,
    );

    await writeFile(
      propsPath,
      JSON.stringify({ scenes: getAppDemoScenesForPresets([phase.preset]) }, null, 2) + "\n",
    );

    await renderOne(phase.preset, outPath, propsPath, args.draft);
  }
};

main().catch((error) => {
  console.error("[render-app-demo-chunks] failed:", error);
  process.exit(1);
});
