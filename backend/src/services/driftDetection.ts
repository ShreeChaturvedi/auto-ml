/**
 * Drift Detection Service
 *
 * Runs statistical drift detection against a deployed model's recent predictions
 * by executing a Python script inside the live inference container via docker exec.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { env } from '../config.js';
import { appLogger } from '../logging/logger.js';
import { createDeploymentRepository } from '../repositories/deploymentRepository.js';
import type { DeploymentRecord, DriftReport } from '../types/deployment.js';

import { execDockerWithStdin } from './dockerUtils.js';

const logger = appLogger.child({ service: 'driftDetection' });

// Reuse a single repository instance across calls
let _driftRepo: ReturnType<typeof createDeploymentRepository> | null = null;
function getDriftRepo() {
  if (!_driftRepo) _driftRepo = createDeploymentRepository();
  return _driftRepo;
}

export async function runDriftDetection(deployment: DeploymentRecord): Promise<DriftReport> {
  // 1. Check container is running
  if (!deployment.containerId) {
    return { available: false, reason: 'no_container' };
  }

  // 2. Load baseline.json
  const baselinePath = join(env.modelStorageDir, deployment.modelId, 'baseline.json');
  let baselineRaw: string;
  try {
    baselineRaw = await readFile(baselinePath, 'utf8');
  } catch {
    return { available: false, reason: 'no_baseline' };
  }

  // 3. Load recent predictions from DB
  const { logs } = await getDriftRepo().getPredictionLogs(deployment.deploymentId, { limit: 500 });

  if (logs.length < 10) {
    return { available: false, reason: 'insufficient_predictions' };
  }

  // 4. Build drift detection Python script
  const script = buildDriftScript();

  // 5. Prepare stdin data (baseline + predictions)
  const stdinData = JSON.stringify({
    baseline: JSON.parse(baselineRaw),
    predictions: logs.map(l => ({
      input: l.inputFeatures,
      output: l.prediction,
    })),
  });

  // 6. Execute via docker exec
  try {
    const { stdout, stderr } = await execDockerWithStdin(
      ['exec', '-i', deployment.containerId, 'python', '-c', script],
      stdinData,
      { timeout: 30_000 }
    );

    if (stderr && !stdout) {
      logger.error('Drift detection failed', { stderr });
      return { available: false, reason: 'execution_error' };
    }

    const result = JSON.parse(stdout) as DriftReport;
    return { ...result, available: true, timestamp: new Date().toISOString() };
  } catch (err) {
    logger.error('Drift detection error', { error: err });
    return { available: false, reason: 'execution_error' };
  }
}

function buildDriftScript(): string {
  return `
import json
import sys
import numpy as np
from scipy import stats

data = json.loads(sys.stdin.read())
baseline = data["baseline"]
predictions = data["predictions"]

# Extract current feature values from predictions
current_features = {}
for pred in predictions:
    for k, v in pred["input"].items():
        current_features.setdefault(k, []).append(v)

results = []

# Numeric features: KS test + PSI
for feat, stats_data in baseline.get("numeric", {}).items():
    if feat not in current_features:
        continue

    current_vals = [v for v in current_features[feat] if isinstance(v, (int, float)) and not (isinstance(v, float) and (v != v))]
    if len(current_vals) < 5:
        continue

    current_arr = np.array(current_vals)

    # Reconstruct baseline distribution from histogram
    hist = stats_data.get("histogram", {})
    bins = hist.get("bins", [])
    counts = hist.get("counts", [])

    if len(bins) < 2 or len(counts) < 1:
        continue

    # PSI calculation
    baseline_hist = np.array(counts, dtype=float)
    baseline_hist = baseline_hist / baseline_hist.sum() + 1e-10

    current_hist, _ = np.histogram(current_arr, bins=bins)
    current_hist = current_hist.astype(float) / current_hist.sum() + 1e-10

    psi = float(np.sum((current_hist - baseline_hist) * np.log(current_hist / baseline_hist)))

    # KS test using mean/std approximation
    baseline_mean = stats_data.get("mean", 0)
    baseline_std = stats_data.get("std", 1)
    baseline_samples = np.random.normal(baseline_mean, max(baseline_std, 1e-10), size=len(current_arr))
    ks_stat, ks_pvalue = stats.ks_2samp(baseline_samples, current_arr)

    status = "green" if psi < 0.1 else ("yellow" if psi < 0.25 else "red")

    results.append({
        "feature": feat,
        "type": "numeric",
        "psi": round(psi, 4),
        "status": status,
        "testStatistic": round(float(ks_stat), 4),
        "pValue": round(float(ks_pvalue), 4),
        "testType": "ks",
        "baselineDistribution": counts,
        "currentDistribution": current_hist.tolist()
    })

# Categorical features: Chi-squared + PSI
for feat, value_counts in baseline.get("categorical", {}).items():
    if feat not in current_features:
        continue

    current_vals = [str(v) for v in current_features[feat] if v is not None]
    if len(current_vals) < 5:
        continue

    from collections import Counter
    current_counts = Counter(current_vals)

    all_categories = sorted(set(list(value_counts.keys()) + list(current_counts.keys())))
    baseline_arr = np.array([value_counts.get(c, 0) for c in all_categories], dtype=float)
    current_arr = np.array([current_counts.get(c, 0) for c in all_categories], dtype=float)

    if baseline_arr.sum() == 0 or current_arr.sum() == 0:
        continue

    baseline_freq = baseline_arr / baseline_arr.sum() + 1e-10
    current_freq = current_arr / current_arr.sum() + 1e-10

    psi = float(np.sum((current_freq - baseline_freq) * np.log(current_freq / baseline_freq)))

    try:
        chi2_stat, chi2_p, _, _ = stats.chi2_contingency([baseline_arr + 1, current_arr + 1])
    except Exception:
        chi2_stat, chi2_p = 0.0, 1.0

    status = "green" if psi < 0.1 else ("yellow" if psi < 0.25 else "red")

    results.append({
        "feature": feat,
        "type": "categorical",
        "psi": round(psi, 4),
        "status": status,
        "testStatistic": round(float(chi2_stat), 4),
        "pValue": round(float(chi2_p), 4),
        "testType": "chi2",
        "baselineDistribution": dict(value_counts),
        "currentDistribution": dict(current_counts)
    })

# Overall status
statuses = [r["status"] for r in results]
if "red" in statuses:
    overall = "red"
elif "yellow" in statuses:
    overall = "yellow"
else:
    overall = "green"

output = {
    "overallStatus": overall,
    "features": results,
}

print(json.dumps(output))
`.trim();
}
