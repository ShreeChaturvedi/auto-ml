/**
 * Remotion Lambda render driver.
 *
 * This is an opt-in fast path for rendering the final video on AWS Lambda
 * (~1–3 min, ~$0.30 per run vs. 1–3 h locally). It is NOT required — the
 * local `npm run build` path is the primary option.
 *
 * Prerequisites (run once per AWS account):
 *   1. `npm i -D @remotion/lambda` in this workspace.
 *   2. Export AWS credentials (REMOTION_AWS_ACCESS_KEY_ID,
 *      REMOTION_AWS_SECRET_ACCESS_KEY, AWS_REGION).
 *   3. `npx remotion lambda policies user` → attach the printed policy.
 *   4. `npx remotion lambda functions deploy` → deploys the render function.
 *   5. `npx remotion lambda sites create remotion/index.ts --site-name=capstone`
 *      → bundles and uploads the composition.
 *   6. Set REMOTION_LAMBDA_SITE_URL and REMOTION_LAMBDA_FUNCTION_NAME.
 *
 * Then:  `npm run render:lambda`
 *
 * NOTE on types: `@remotion/lambda` is intentionally NOT in the default
 * dependencies — see note above. Because of that, we import it dynamically
 * with a `Record<string, unknown>` cast rather than strict types, so the
 * rest of the workspace still typechecks when Lambda isn't installed. When
 * you adopt Lambda, feel free to tighten these types.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const REGION = process.env.AWS_REGION ?? "us-east-1";
const SITE_URL = process.env.REMOTION_LAMBDA_SITE_URL;
const FUNCTION_NAME = process.env.REMOTION_LAMBDA_FUNCTION_NAME;
const COMPOSITION = process.env.REMOTION_LAMBDA_COMPOSITION ?? "main";

const guard = (name: string, val: unknown): string => {
  if (typeof val === "string" && val.trim() !== "") return val;
  console.error(
    `[render-lambda] Missing env var ${name}. See the header of this file ` +
      `for one-time Lambda setup.`,
  );
  process.exit(1);
};

const loadLambda = async (): Promise<Record<string, any>> => {
  // Use a dynamic name to avoid TypeScript's static module resolution, so
  // typecheck passes when `@remotion/lambda` isn't installed.
  const moduleName = "@remotion/lambda/client";
  try {
    return (await import(moduleName)) as unknown as Record<string, any>;
  } catch {
    console.error(
      "[render-lambda] @remotion/lambda is not installed. Run:\n" +
        "  npm i -D @remotion/lambda",
    );
    process.exit(1);
  }
};

const main = async () => {
  const site = guard("REMOTION_LAMBDA_SITE_URL", SITE_URL);
  const functionName = guard("REMOTION_LAMBDA_FUNCTION_NAME", FUNCTION_NAME);

  const lambda = await loadLambda();
  const { renderMediaOnLambda, getRenderProgress } = lambda;

  console.log(`[render-lambda] starting render on ${REGION} (fn=${functionName})`);

  const { renderId, bucketName } = await renderMediaOnLambda({
    region: REGION,
    functionName,
    serveUrl: site,
    composition: COMPOSITION,
    codec: "h264",
    crf: 18,
    privacy: "public",
  });

  console.log(`[render-lambda] renderId=${renderId} bucket=${bucketName}`);

  for (;;) {
    const progress = await getRenderProgress({
      renderId,
      bucketName,
      functionName,
      region: REGION,
    });
    if (progress.fatalErrorEncountered) {
      console.error("[render-lambda] fatal error:", progress.errors);
      process.exit(1);
    }
    if (progress.done) {
      console.log(`[render-lambda] done → ${progress.outputFile}`);
      return;
    }
    process.stdout.write(
      `\r[render-lambda] ${(progress.overallProgress * 100).toFixed(1)}%   `,
    );
    await new Promise((r) => setTimeout(r, 2000));
  }
};

main().catch((err) => {
  console.error("[render-lambda] failed:", err);
  process.exit(1);
});
