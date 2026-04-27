#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { buildPreprocessingMockDatasetVariants } from '../support/preprocessingMockDatasets.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const API_BASE = process.env.AUTOML_API_BASE_URL ?? 'http://127.0.0.1:4000/api';
const PROMPT = 'Create a safe preprocessing checkpoint for this dataset and summarize the result.';
const OUT_DIR = path.resolve(ROOT, `tmp/preprocessing_mock_burn_in_${Date.now()}`);
const variantMap = new Map(buildPreprocessingMockDatasetVariants().map((variant) => [variant.name, variant]));
const AUTH_BYPASS = process.env.AUTOML_BENCHMARK_AUTH_BYPASS === 'true' || process.env.BENCHMARK_AUTH_BYPASS === 'true';

mkdirSync(OUT_DIR, { recursive: true });

function buildRunPlan(totalRuns) {
  const plan = [];
  const baselineTarget = totalRuns <= 20 ? Math.min(8, totalRuns) : 10;
  const parserTarget = totalRuns <= 20 ? Math.min(6, Math.max(0, totalRuns - baselineTarget)) : 10;
  const dirtyTarget = totalRuns <= 20
    ? Math.min(6, Math.max(0, totalRuns - baselineTarget - parserTarget))
    : 10;

  for (let index = 0; index < baselineTarget && plan.length < totalRuns; index += 1) {
    plan.push({ bucket: 'baseline', variant: 'clean' });
  }

  const parserVariants = ['bom', 'latin1', 'tsv', 'jsonl', 'schema_drift'];
  while (plan.filter((entry) => entry.bucket === 'parser').length < parserTarget && plan.length < totalRuns) {
    for (const variant of parserVariants) {
      if (plan.filter((entry) => entry.bucket === 'parser').length >= parserTarget || plan.length >= totalRuns) {
        break;
      }
      plan.push({ bucket: 'parser', variant });
    }
  }

  const dirtyVariants = ['ragged_rows', 'string_in_numeric', 'heavy_nan'];
  while (plan.filter((entry) => entry.bucket === 'dirty').length < dirtyTarget && plan.length < totalRuns) {
    for (const variant of dirtyVariants) {
      if (plan.filter((entry) => entry.bucket === 'dirty').length >= dirtyTarget || plan.length >= totalRuns) {
        break;
      }
      plan.push({ bucket: 'dirty', variant });
    }
  }

  while (plan.length < totalRuns) {
    plan.push({ bucket: 'extension', variant: 'clean' });
  }

  return plan;
}

function parseExplicitPlan(planText) {
  return planText
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [bucket, variant] = entry.includes(':') ? entry.split(':', 2) : ['custom', entry];
      return { bucket: bucket.trim() || 'custom', variant: variant.trim() };
    });
}

async function parseJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Expected JSON from ${response.url}, received: ${text.slice(0, 400)}`);
  }
}

async function registerUser() {
  if (AUTH_BYPASS) {
    const userId = randomUUID();
    const email = `${userId.slice(0, 12)}@benchmark.local`;
    return {
      accessToken: 'benchmark-bypass',
      refreshToken: 'benchmark-bypass',
      user: {
        user_id: userId,
        email,
        name: 'Preprocessing Burn-In',
        role: 'user',
        email_verified: true
      },
      headers: {
        Authorization: 'Bearer benchmark-bypass',
        'x-benchmark-user-id': userId,
        'x-benchmark-user-email': email,
        'x-benchmark-user-name': 'Preprocessing Burn-In'
      }
    };
  }

  const response = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `prep-burnin-${randomUUID()}@automl.test`,
      password: 'BurnIn2026!',
      name: 'Preprocessing Burn-In'
    })
  });

  if (!response.ok) {
    throw new Error(`Register failed: ${response.status} ${await response.text()}`);
  }

  const auth = await parseJson(response);
  return {
    ...auth,
    headers: {
      Authorization: `Bearer ${auth.accessToken}`
    }
  };
}

async function createProject(auth, runLabel) {
  const response = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: {
      ...auth.headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: `Preprocessing Burn-In ${runLabel}`,
      metadata: {
        unlockedPhases: ['upload', 'data-viewer', 'preprocessing', 'feature-engineering', 'training', 'experiments', 'deployment'],
        completedPhases: [],
        currentPhase: 'preprocessing'
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Create project failed: ${response.status} ${await response.text()}`);
  }

  const body = await parseJson(response);
  return body.project;
}

async function uploadDataset(auth, projectId, variant) {
  const form = new FormData();
  form.append('projectId', projectId);
  form.append('file', new Blob([variant.buffer], { type: variant.mimeType }), variant.fileName);

  const response = await fetch(`${API_BASE}/upload/dataset`, {
    method: 'POST',
    headers: auth.headers,
    body: form
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status} ${await response.text()}`);
  }

  const body = await parseJson(response);
  return body.dataset;
}

function parseNdjson(bodyText) {
  return bodyText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function collectToolSequence(events) {
  return events
    .filter((event) => event.type === 'tool_executed')
    .map((event) => event.call?.tool)
    .filter(Boolean);
}

function extractRunId(events) {
  return events
    .filter((event) => event.type === 'tool_executed')
    .flatMap((event) => [event.result?.output?.runId, event.call?.args?.runId, event.state?.phaseContext?.controller?.runId])
    .find((runId) => typeof runId === 'string' && runId.startsWith('prep-'))
    ?? events
      .filter((event) => event.type === 'workflow_state')
      .map((event) => event.state?.phaseContext?.controller?.runId)
    .find((runId) => typeof runId === 'string' && runId.length > 0);
}

function assertWorkflowEvents(events, runLabel) {
  const finalState = events
    .filter((event) => event.type === 'workflow_state')
    .map((event) => event.state?.status)
    .filter(Boolean)
    .at(-1);
  if (finalState !== 'completed') {
    const workflowError = events.find((event) => event.type === 'workflow_error');
    throw new Error(`${runLabel}: workflow did not complete (status=${finalState ?? 'missing'} error=${workflowError?.message ?? 'none'})`);
  }

  const tools = collectToolSequence(events);
  const requiredTools = [
    'propose_transformation_step',
    'materialize_step_code',
    'write_cell',
    'run_cell',
    'execute_transformation_step',
    'validate_step_result',
    'commit_transformation_step'
  ];
  for (const tool of requiredTools) {
    if (!tools.includes(tool)) {
      throw new Error(`${runLabel}: missing required tool event ${tool}`);
    }
  }

  const runCellCount = tools.filter((tool) => tool === 'run_cell').length;
  if (runCellCount < 2) {
    throw new Error(`${runLabel}: expected multi-cell execution, saw ${runCellCount} run_cell events`);
  }

  if (events.some((event) => event.type === 'workflow_error')) {
    const workflowError = events.find((event) => event.type === 'workflow_error');
    throw new Error(`${runLabel}: workflow_error emitted: ${workflowError?.message ?? 'unknown'}`);
  }
}

async function streamWorkflow(auth, projectId, datasetId) {
  const response = await fetch(`${API_BASE}/workflows/turns/stream`, {
    method: 'POST',
    headers: {
      ...auth.headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      projectId,
      phase: 'preprocessing',
      datasetId,
      prompt: PROMPT
    })
  });

  if (!response.ok) {
    throw new Error(`Workflow stream failed: ${response.status} ${await response.text()}`);
  }

  return response.text();
}

async function listDatasets(auth, projectId) {
  const response = await fetch(`${API_BASE}/datasets?projectId=${encodeURIComponent(projectId)}`, {
    headers: auth.headers
  });
  if (!response.ok) {
    throw new Error(`Dataset list failed: ${response.status} ${await response.text()}`);
  }
  const body = await parseJson(response);
  return Array.isArray(body) ? body : (body.datasets ?? []);
}

async function getDatasetSample(auth, datasetId) {
  const response = await fetch(`${API_BASE}/datasets/${datasetId}/sample`, {
    headers: auth.headers
  });
  if (!response.ok) {
    throw new Error(`Dataset sample failed: ${response.status} ${await response.text()}`);
  }
  return parseJson(response);
}

async function listRuns(auth, projectId) {
  const response = await fetch(`${API_BASE}/preprocessing/runs?projectId=${encodeURIComponent(projectId)}`, {
    headers: auth.headers
  });
  if (!response.ok) {
    throw new Error(`Preprocessing runs failed: ${response.status} ${await response.text()}`);
  }
  const body = await parseJson(response);
  return body.runs ?? [];
}

async function getRunSnapshot(auth, projectId, runId) {
  const response = await fetch(
    `${API_BASE}/preprocessing/runs/${encodeURIComponent(runId)}?projectId=${encodeURIComponent(projectId)}`,
    {
      headers: auth.headers
    }
  );
  if (!response.ok) {
    throw new Error(`Preprocessing run snapshot failed: ${response.status} ${await response.text()}`);
  }
  const body = await parseJson(response);
  return body.run;
}

async function runScenario(planEntry, index) {
  const variant = variantMap.get(planEntry.variant);
  if (!variant) {
    throw new Error(`Unknown dataset variant ${planEntry.variant}`);
  }

  const runLabel = `run-${String(index + 1).padStart(2, '0')}-${planEntry.bucket}-${planEntry.variant}`;
  const auth = await registerUser();
  const project = await createProject(auth, runLabel);
  const uploadedDataset = await uploadDataset(auth, project.id, variant);
  const ndjson = await streamWorkflow(auth, project.id, uploadedDataset.datasetId);
  const events = parseNdjson(ndjson);
  writeFileSync(path.join(OUT_DIR, `${runLabel}.ndjson`), ndjson);

  assertWorkflowEvents(events, runLabel);
  const runId = extractRunId(events);
  if (!runId) {
    throw new Error(`${runLabel}: workflow stream did not expose a preprocessing runId`);
  }

  const datasets = await listDatasets(auth, project.id);
  const derivedDataset = datasets.find((dataset) => dataset.metadata?.derivedFrom === uploadedDataset.datasetId);
  if (!derivedDataset?.datasetId) {
    throw new Error(`${runLabel}: no derived dataset found`);
  }

  const sample = await getDatasetSample(auth, derivedDataset.datasetId);
  const sampleRows = sample.sampleRows ?? sample.sample ?? sample.rows ?? [];
  if (!Array.isArray(sampleRows) || sampleRows.length === 0) {
    throw new Error(`${runLabel}: derived dataset sample is empty`);
  }

  const runs = await listRuns(auth, project.id);
  const runSummary = runs.find((run) => run.runId === runId);
  if (!runSummary) {
    throw new Error(`${runLabel}: preprocessing run summary missing for ${runId}`);
  }
  if (!['checkpoint_created', 'step_committed'].includes(runSummary.latestEventType)) {
    throw new Error(`${runLabel}: unexpected preprocessing run summary event ${runSummary.latestEventType ?? 'missing'}`);
  }

  const runSnapshot = await getRunSnapshot(auth, project.id, runId);
  const appliedStep = runSnapshot?.steps?.find((step) => step.title === 'Create preprocessing test checkpoint');
  if (!appliedStep || appliedStep.status !== 'applied') {
    throw new Error(`${runLabel}: preprocessing snapshot did not persist an applied step`);
  }
  if (!appliedStep.lastExecuteSucceeded || !appliedStep.lastValidateSucceeded) {
    throw new Error(`${runLabel}: preprocessing snapshot step did not retain successful execute/validate markers`);
  }
  if (!Array.isArray(runSnapshot.derivedDatasetIds) || !runSnapshot.derivedDatasetIds.includes(derivedDataset.datasetId)) {
    throw new Error(`${runLabel}: preprocessing snapshot is missing the committed derived dataset`);
  }

  return {
    runLabel,
    bucket: planEntry.bucket,
    variant: planEntry.variant,
    runId,
    uploadedDatasetId: uploadedDataset.datasetId,
    derivedDatasetId: derivedDataset.datasetId,
    toolSequence: collectToolSequence(events),
    runCount: runs.length
  };
}

async function main() {
  const explicitPlan = process.env.PREPROCESSING_BURNIN_PLAN
    ? parseExplicitPlan(process.env.PREPROCESSING_BURNIN_PLAN)
    : null;
  const initialPlan = explicitPlan && explicitPlan.length > 0
    ? explicitPlan
    : buildRunPlan(Number(process.env.PREPROCESSING_BURNIN_TOTAL ?? 20));
  const results = [];
  const failures = [];

  for (let index = 0; index < initialPlan.length; index += 1) {
    const planEntry = initialPlan[index];
    try {
      const result = await runScenario(planEntry, index);
      results.push({ status: 'pass', ...result });
      console.log(`PASS ${result.runLabel}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ run: index + 1, bucket: planEntry.bucket, variant: planEntry.variant, message });
      results.push({
        status: 'fail',
        runLabel: `run-${String(index + 1).padStart(2, '0')}-${planEntry.bucket}-${planEntry.variant}`,
        bucket: planEntry.bucket,
        variant: planEntry.variant,
        message
      });
      console.error(`FAIL run-${String(index + 1).padStart(2, '0')}-${planEntry.bucket}-${planEntry.variant}: ${message}`);
    }
  }

  if (!explicitPlan && failures.length > 0) {
    const extensionPlan = buildRunPlan(30).slice(20);
    for (let offset = 0; offset < extensionPlan.length; offset += 1) {
      const planEntry = extensionPlan[offset];
      const runIndex = 20 + offset;
      try {
        const result = await runScenario(planEntry, runIndex);
        results.push({ status: 'pass', ...result });
        console.log(`PASS ${result.runLabel} (extension)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ run: runIndex + 1, bucket: planEntry.bucket, variant: planEntry.variant, message });
        results.push({
          status: 'fail',
          runLabel: `run-${String(runIndex + 1).padStart(2, '0')}-${planEntry.bucket}-${planEntry.variant}`,
          bucket: planEntry.bucket,
          variant: planEntry.variant,
          message
        });
        console.error(`FAIL run-${String(runIndex + 1).padStart(2, '0')}-${planEntry.bucket}-${planEntry.variant}: ${message}`);
      }
    }
  }

  const summary = {
    apiBase: API_BASE,
    outDir: OUT_DIR,
    totalRuns: results.length,
    failures
  };
  writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify({ summary, results }, null, 2));

  console.log(JSON.stringify(summary, null, 2));
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

await main();
