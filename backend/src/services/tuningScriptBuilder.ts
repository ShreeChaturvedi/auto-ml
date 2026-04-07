import type { ModelTemplate, ModelTemplateParam } from '../types/model.js';

import {
  buildOutputDirSetup,
  buildPreprocessingLines,
  buildResultSaving,
  buildStandardImports,
  buildTrainTestSplitLines,
} from './pythonScriptUtils.js';

const METRIC_TO_SKLEARN_SCORING: Record<string, string> = {
  rmse: 'neg_root_mean_squared_error',
  mae: 'neg_mean_absolute_error',
  mse: 'neg_mean_squared_error',
  mean_squared_error: 'neg_mean_squared_error',
  mean_absolute_error: 'neg_mean_absolute_error',
  log_loss: 'neg_log_loss',
};

export interface BuildTuningScriptOptions {
  template: ModelTemplate;
  datasetPath: string;
  targetColumn: string;
  testSize: number;
  nTrials: number;
  metric: string;
  timeoutSeconds: number;
  outputDir: string;
  sampler?: 'tpe' | 'random';
}

export function toSklearnScoring(metric: string): string {
  return METRIC_TO_SKLEARN_SCORING[metric] ?? metric;
}

export function isNegatedScorer(sklearnScoring: string): boolean {
  return sklearnScoring.startsWith('neg_');
}

function suggestLine(param: ModelTemplateParam): string {
  const key = param.key;

  if (param.type === 'select') {
    const values = (param.options ?? []).map((option) => JSON.stringify(option.value)).join(', ');
    return `    ${JSON.stringify(key)}: trial.suggest_categorical(${JSON.stringify(key)}, [${values}])`;
  }

  if (param.type === 'boolean') {
    return `    ${JSON.stringify(key)}: trial.suggest_categorical(${JSON.stringify(key)}, [True, False])`;
  }

  const min = param.min ?? 0;
  const max = param.max ?? 100;
  const defaultValue = param.default;
  const isInt =
    Number.isInteger(defaultValue) &&
    Number.isInteger(min) &&
    Number.isInteger(max) &&
    (param.step === undefined || Number.isInteger(param.step));

  if (isInt) {
    const stepArg = Number.isInteger(param.step) ? `, step=${param.step}` : '';
    return `    ${JSON.stringify(key)}: trial.suggest_int(${JSON.stringify(key)}, ${min}, ${max}${stepArg})`;
  }

  const useLog = min > 0 && max / min > 100;
  if (useLog) {
    return `    ${JSON.stringify(key)}: trial.suggest_float(${JSON.stringify(key)}, ${min}, ${max}, log=True)`;
  }

  const stepArg = typeof param.step === 'number' ? `, step=${param.step}` : '';
  return `    ${JSON.stringify(key)}: trial.suggest_float(${JSON.stringify(key)}, ${min}, ${max}${stepArg})`;
}

export function buildTuningScript(options: BuildTuningScriptOptions): string {
  const {
    template,
    datasetPath,
    targetColumn,
    testSize,
    nTrials,
    metric,
    timeoutSeconds,
    outputDir,
  } = options;

  const lines: string[] = [];
  lines.push(
    ...buildStandardImports([
      'import sys',
      'import joblib',
      'import optuna',
      'from sklearn.model_selection import train_test_split, cross_val_score',
      `from ${template.importPath} import ${template.modelClass}`,
    ])
  );
  lines.push('optuna.logging.set_verbosity(optuna.logging.WARNING)');
  lines.push(`sampler = optuna.samplers.TPESampler(seed=42) if '${options.sampler ?? 'tpe'}' == 'tpe' else optuna.samplers.RandomSampler(seed=42)`);
  lines.push('');

  lines.push(`dataset_path = ${JSON.stringify(datasetPath)}`);
  lines.push('df = pd.read_csv(dataset_path)');
  lines.push('');

  lines.push(...buildPreprocessingLines({
    targetColumn,
    validateColumnExists: true,
  }));
  lines.push('');
  lines.push(...buildTrainTestSplitLines({ taskType: template.taskType, testSize }));
  lines.push('');

  const sklearnScoring = toSklearnScoring(metric);
  const negated = isNegatedScorer(sklearnScoring);
  const direction = 'maximize';

  lines.push('def objective(trial):');
  const tunable = template.parameters.filter(
    (param) => param.min !== undefined || param.options !== undefined || param.type === 'boolean'
  );

  if (tunable.length > 0) {
    lines.push('    params = {');
    lines.push(tunable.map(suggestLine).join(',\n'));
    lines.push('    }');
  } else {
    lines.push('    params = {}');
  }

  const randomStateSuffix = 'random_state' in template.defaultParams ? ', random_state=42' : '';
  lines.push(`    model = ${template.modelClass}(**params${randomStateSuffix})`);
  lines.push(`    scores = cross_val_score(model, X_train, y_train, cv=5, scoring=${JSON.stringify(sklearnScoring)})`);
  lines.push('    return scores.mean()');
  lines.push('');

  lines.push(`DIRECTION = ${JSON.stringify(direction)}`);
  lines.push(`N_TRIALS = ${nTrials}`);
  lines.push("_best_tracker = {'value': None, 'since': 0}");
  if (negated) {
    lines.push('_negate = lambda v: abs(v) if v is not None else None');
  }
  lines.push('def stream_callback(study, trial):');
  lines.push('    _n_complete = len([t for t in study.trials if t.state == optuna.trial.TrialState.COMPLETE])');
  lines.push('    print(json.dumps({');
  lines.push("        'type': 'trial_result',");
  lines.push("        'trial_number': trial.number,");
  lines.push("        'state': trial.state.name,");
  lines.push(`        'value': ${negated ? '_negate(trial.value)' : 'trial.value'},`);
  lines.push("        'params': trial.params,");
  lines.push(`        'best_value': ${negated ? '_negate(study.best_value)' : 'study.best_value'},`);
  lines.push("        'best_params': study.best_params,");
  lines.push("        'n_complete': _n_complete,");
  lines.push(`        'n_total': ${nTrials}`);
  lines.push('    }), flush=True)');
  lines.push('    _cur_best = study.best_value if len(study.best_trials) > 0 else None');
  lines.push('    if _cur_best is not None:');
  lines.push("        if _best_tracker['value'] is None or _cur_best > _best_tracker['value']:");
  lines.push("            _best_tracker['since'] = 0");
  lines.push("            _best_tracker['value'] = _cur_best");
  lines.push('        else:');
  lines.push("            _best_tracker['since'] += 1");
  lines.push('        _patience = max(10, N_TRIALS // 5)');
  lines.push("        if _best_tracker['since'] == 0:");
  lines.push("            _conv_status = 'exploring'");
  lines.push("        elif _best_tracker['since'] < _patience:");
  lines.push("            _conv_status = 'narrowing'");
  lines.push('        else:');
  lines.push("            _conv_status = 'converging'");
  lines.push("        print(json.dumps({'type': 'convergence_update', 'status': _conv_status, 'trials_since_improvement': _best_tracker['since'], 'improvement_rate': 0.0}), flush=True)");
  lines.push('    if _n_complete in {10, 20, 30, 50, 75, 100, 150, 200} and _n_complete >= 10:');
  lines.push('        try:');
  lines.push('            _imp = optuna.importance.get_param_importances(study)');
  lines.push("            print(json.dumps({'type': 'importance_update', 'importances': dict(_imp), 'n_trials_used': _n_complete}), flush=True)");
  lines.push('        except Exception:');
  lines.push('            pass');
  lines.push('');

  lines.push(`study = optuna.create_study(direction=${JSON.stringify(direction)}, sampler=sampler)`);
  lines.push(`study.optimize(objective, n_trials=${nTrials}, timeout=${timeoutSeconds}, callbacks=[stream_callback])`);
  lines.push('');

  lines.push('best_params = study.best_params');
  lines.push(`best_model = ${template.modelClass}(**best_params${randomStateSuffix})`);
  lines.push('best_model.fit(X_train, y_train)');
  lines.push('');
  lines.push(...buildOutputDirSetup(outputDir));
  lines.push('joblib.dump(best_model, os.path.join(output_dir, "model.joblib"))');
  lines.push('');
  lines.push('param_importances = {}');
  lines.push('try:');
  lines.push('    imp = optuna.importance.get_param_importances(study)');
  lines.push('    param_importances = {"params": list(imp.keys()), "importances": list(imp.values())}');
  lines.push('except Exception:');
  lines.push('    pass');
  lines.push('');
  lines.push('optimization_history = {');
  lines.push('    "trial_numbers": [t.number for t in study.trials if t.state == optuna.trial.TrialState.COMPLETE],');
  lines.push('    "values": [t.value for t in study.trials if t.state == optuna.trial.TrialState.COMPLETE],');
  lines.push('    "best_values": []');
  lines.push('}');
  lines.push('running_best = None');
  lines.push('for t in study.trials:');
  lines.push('    if t.state == optuna.trial.TrialState.COMPLETE:');
  lines.push('        if running_best is None or t.value > running_best:');
  lines.push('            running_best = t.value');
  lines.push('        optimization_history["best_values"].append(running_best)');
  lines.push('');
  if (negated) {
    lines.push('optimization_history["values"] = [abs(v) for v in optimization_history["values"]]');
    lines.push('optimization_history["best_values"] = [abs(v) for v in optimization_history["best_values"]]');
  }
  lines.push('');
  lines.push('summary = {');
  lines.push('    "best_params": study.best_params,');
  lines.push(`    "best_value": ${negated ? 'abs(study.best_value)' : 'study.best_value'},`);
  lines.push('    "best_trial_number": study.best_trial.number,');
  lines.push('    "optimization_history": optimization_history,');
  lines.push('    "param_importances": param_importances');
  lines.push('}');
  lines.push(
    ...buildResultSaving('output_dir', {
      resultVar: 'summary',
      filename: 'tuning_summary.json',
    })
  );
  lines.push('print(json.dumps({"type": "done"}), flush=True)');

  return lines.join('\n');
}
