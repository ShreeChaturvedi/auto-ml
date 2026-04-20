import path from "node:path";

import type { Locator, Page } from "playwright";

import type { AppDemoPreset } from "../../config/appDemo";
import type { CursorRecorder, DriverResult, MarkPacer, RafScroll } from "./types";

type DriverArgs = {
  page: Page;
  cursor: CursorRecorder;
  rafScroll: RafScroll;
  waitForMark: MarkPacer["waitForMark"];
  hasAlignment: boolean;
  beat: AppDemoPreset;
  fixturePaths: readonly string[];
};

const CURSOR_PARK = { x: 1500, y: 120 } as const;
const TYPE_DELAY_MS = 24;
const UPLOAD_ORDER = [
  "customers.csv",
  "subscriptions.csv",
  "support_tickets.csv",
  "usage_metrics.csv",
  "marketing_campaigns.csv",
  "novacraft_business_context.pdf",
] as const;

export async function drive(args: DriverArgs): Promise<DriverResult> {
  await args.page.waitForTimeout(500);
  await args.cursor.move(args.page, CURSOR_PARK.x, CURSOR_PARK.y, 10);
  await args.page.waitForTimeout(220);

  switch (args.beat) {
    case "ingest":
      await driveIngest(args);
      return {};
    case "explore":
      await driveExplore(args);
      return {};
    case "preprocess":
      await drivePreprocess(args);
      return {};
    case "engineer":
      await driveEngineer(args);
      return {};
    case "train":
      await driveTrain(args);
      return {};
    case "experiments":
      await driveExperiments(args);
      return {};
    case "deploy":
      await driveDeploy(args);
      return {};
    default: {
      const unreachable: never = args.beat;
      throw new Error(`[capture] unsupported app demo beat: ${unreachable}`);
    }
  }
}

async function driveIngest({
  page,
  cursor,
  fixturePaths,
}: DriverArgs): Promise<void> {
  const uploadArea = page.locator('[data-testid="upload-area"]');
  const uploadInput = page.locator("#data-upload-input");
  await uploadArea.waitFor({ state: "visible", timeout: 20_000 });

  await hoverLocator(page, cursor, uploadArea, 22);
  await page.waitForTimeout(180);
  await uploadInput.setInputFiles(sortFixturePaths(fixturePaths));

  await page.locator('[data-testid="processing-stage"]').waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await page.waitForTimeout(1050);

  await page.locator('[data-testid="planning-stage"]').waitFor({
    state: "visible",
    timeout: 30_000,
  });

  await typeIntoComposer(
    page,
    cursor,
    "Analyze every uploaded NovaCraft file and draft the fastest path to a deployable churn-risk model, including SQL exploration, preprocessing, feature engineering, training, experiments, and deployment.",
  );

  const firstQuestionOption = page.getByRole("radio").first();
  await firstQuestionOption.waitFor({ state: "visible", timeout: 20_000 });
  await clickLocator(page, cursor, firstQuestionOption);
  await page.waitForTimeout(220);
  await clickLocator(
    page,
    cursor,
    page.locator('[data-testid="question-submit-button"]'),
  );

  const approvePlanButton = page.getByRole("button", { name: "Approve Plan" });
  await approvePlanButton.waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(850);
  await clickLocator(page, cursor, approvePlanButton);
  await page.waitForTimeout(1400);
}

async function driveExplore({
  page,
  cursor,
}: DriverArgs): Promise<void> {
  await page.getByText("customers.csv").first().waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page.getByLabel("Natural language mode").waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page.waitForTimeout(850);

  await clickLocator(page, cursor, page.getByLabel("Natural language mode"));
  await page.waitForTimeout(180);

  const queryInput = page.getByLabel("Natural language query input");
  await typeIntoLocator(
    page,
    cursor,
    queryInput,
    "Show the 12 NovaCraft customers with the highest churn risk using revenue, feature adoption, and support pressure across the uploaded datasets.",
    TYPE_DELAY_MS,
  );
  await page.waitForTimeout(180);
  await page.keyboard.press("Control+Enter");

  await page.getByLabel("Generated SQL (revealing)").waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page.waitForTimeout(1050);

  const approveButton = page.getByLabel("Approve and run this SQL");
  await approveButton.waitFor({ state: "visible", timeout: 20_000 });
  await clickLocator(page, cursor, approveButton);

  await page.getByText("risk_score").first().waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page.waitForTimeout(1200);
}

async function drivePreprocess({
  page,
  cursor,
}: DriverArgs): Promise<void> {
  const datasetDialogTitle = page.getByText("Select a dataset");
  await datasetDialogTitle.waitFor({ state: "visible", timeout: 20_000 });

  const datasetButton = page.getByRole("button", { name: /customers\.csv/i }).first();
  await clickLocator(page, cursor, datasetButton);
  await page.waitForTimeout(200);
  await clickLocator(
    page,
    cursor,
    page.getByRole("button", { name: "Start with this dataset" }),
  );

  await page.getByLabel("Message input").waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page.waitForTimeout(700);

  await typeIntoComposer(
    page,
    cursor,
    "Repair sparse usage signals, validate the row count, and commit the cleanest preprocessing step for retention modeling.",
  );

  await waitForOneOfTexts(page, [
    "Rows preserved",
    "Execution succeeded",
    "Committed",
  ]);
  await page.waitForTimeout(1150);
}

async function driveEngineer({
  page,
  cursor,
}: DriverArgs): Promise<void> {
  await page
    .getByText("Preparing feature notebook...")
    .waitFor({ state: "hidden", timeout: 20_000 })
    .catch(() => undefined);
  await page.getByLabel("Message input").waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page.waitForTimeout(700);

  await typeIntoComposer(
    page,
    cursor,
    "Generate two explainable churn features grounded in support pressure and expansion headroom.",
  );

  const detailsButton = page.getByRole("button", { name: "What this feature does" }).first();
  const enableButtons = page.getByRole("button", { name: "Enable" });
  const buildButton = page.getByRole("button", { name: /Generate Notebook Steps|Update Notebook Steps/ });

  const suggestionsAppeared = await detailsButton
    .waitFor({ state: "visible", timeout: 9_000 })
    .then(() => true)
    .catch(() => false);

  if (suggestionsAppeared) {
    await clickLocator(page, cursor, detailsButton);
    await page.waitForTimeout(220);

    const enableCount = await enableButtons.count();
    for (let index = 0; index < Math.min(2, enableCount); index += 1) {
      await clickLocator(page, cursor, enableButtons.nth(index));
      await page.waitForTimeout(220);
    }
  }
  await buildButton.waitFor({ state: "visible", timeout: 20_000 });
  await clickLocator(page, cursor, buildButton);

  const applyButton = page.getByRole("button", { name: "Apply" });
  await applyButton.waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(850);
  await clickLocator(page, cursor, applyButton);
  await page.waitForTimeout(1200);
}

async function driveTrain({
  page,
  cursor,
}: DriverArgs): Promise<void> {
  await page
    .getByText("Preparing training notebook...")
    .waitFor({ state: "hidden", timeout: 20_000 })
    .catch(() => undefined);
  await page.getByLabel("Message input").waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page.waitForTimeout(700);

  await typeIntoComposer(
    page,
    cursor,
    "Train the best churn classifier for NovaCraft and recommend the strongest explainable champion.",
  );

  const trainButton = page.getByRole("button", { name: /Train Selected Model/i });
  await trainButton.waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(900);
  await clickLocator(page, cursor, trainButton);

  await trainButton.waitFor({ state: "hidden", timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(1400);
}

async function driveExperiments({
  page,
  cursor,
}: DriverArgs): Promise<void> {
  await page.getByText("NovaForest Churn Champion").first().waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page.waitForTimeout(850);

  await clickLocator(page, cursor, page.getByRole("button", { name: "Leaderboard" }).first());
  await page.waitForTimeout(650);
  await clickLocator(page, cursor, page.getByText("NovaForest Churn Champion").first());
  await page.waitForTimeout(700);

  for (const label of ["Interpretability", "Errors", "Provenance"] as const) {
    const tab = page.getByLabel(label).first();
    await tab.waitFor({ state: "visible", timeout: 15_000 });
    await clickLocator(page, cursor, tab);
    await page.waitForTimeout(650);
  }
}

async function driveDeploy({
  page,
  cursor,
}: DriverArgs): Promise<void> {
  await page.getByLabel("Playground").waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page.waitForTimeout(800);

  await clickLocator(page, cursor, page.getByLabel("Playground"));
  await page.locator("#playground-json-input").waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page.waitForTimeout(350);
  await clickLocator(page, cursor, page.getByRole("button", { name: "Predict" }));
  await page.waitForTimeout(1200);

  await clickLocator(page, cursor, page.getByLabel("API"));
  const keyInput = page.locator("#key-name");
  await keyInput.waitFor({ state: "visible", timeout: 20_000 });
  await typeIntoLocator(page, cursor, keyInput, "Studio Demo Key", TYPE_DELAY_MS);
  await clickLocator(page, cursor, page.getByRole("button", { name: "Generate Key" }));
  await page.waitForTimeout(1100);

  await clickLocator(page, cursor, page.getByLabel("Logs"));
  await page.waitForTimeout(850);

  await clickLocator(page, cursor, page.getByLabel("Monitoring"));
  const driftButton = page.getByRole("button", { name: "Check Drift" });
  await driftButton.waitFor({ state: "visible", timeout: 20_000 });
  await clickLocator(page, cursor, driftButton);
  await page.waitForTimeout(1200);
}

async function typeIntoComposer(
  page: Page,
  cursor: CursorRecorder,
  prompt: string,
): Promise<void> {
  await typeIntoLocator(
    page,
    cursor,
    page.getByLabel("Message input"),
    prompt,
    TYPE_DELAY_MS,
  );
  await page.waitForTimeout(140);
  await clickLocator(page, cursor, page.locator('button[aria-label="Send message"]'));
}

async function typeIntoLocator(
  page: Page,
  cursor: CursorRecorder,
  locator: Locator,
  text: string,
  delayMs: number,
): Promise<void> {
  await clickLocator(page, cursor, locator);
  await page.waitForTimeout(120);
  await page.keyboard.type(text, { delay: delayMs });
}

async function hoverLocator(
  page: Page,
  cursor: CursorRecorder,
  locator: Locator,
  steps = 20,
): Promise<void> {
  const point = await centerOfLocator(locator);
  await cursor.move(page, point.x, point.y, steps);
}

async function clickLocator(
  page: Page,
  cursor: CursorRecorder,
  locator: Locator,
): Promise<void> {
  const point = await centerOfLocator(locator);
  await cursor.click(page, point.x, point.y);
}

async function centerOfLocator(locator: Locator): Promise<{ x: number; y: number }> {
  await locator.waitFor({ state: "visible", timeout: 20_000 });
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("[capture] locator is not visible enough for cursor capture.");
  }
  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
}

async function waitForOneOfTexts(page: Page, texts: readonly string[]): Promise<void> {
  await Promise.any(
    texts.map((text) =>
      page.getByText(text, { exact: false }).first().waitFor({
        state: "visible",
        timeout: 20_000,
      }),
    ),
  );
}

function sortFixturePaths(paths: readonly string[]): string[] {
  const priority = new Map<string, number>(
    UPLOAD_ORDER.map((filename, index) => [filename, index] as const),
  );
  return [...paths].sort((left, right) => {
    const leftName = path.basename(left).toLowerCase();
    const rightName = path.basename(right).toLowerCase();
    return (priority.get(leftName) ?? 999) - (priority.get(rightName) ?? 999);
  });
}
