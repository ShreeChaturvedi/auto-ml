import { asRecord, asString } from '../utils/typeCoercion.js';

const MODULE_PACKAGE_ALIASES = new Map<string, string>([
  ['catboost', 'catboost'],
  ['cv2', 'opencv-python'],
  ['imblearn', 'imbalanced-learn'],
  ['lightgbm', 'lightgbm'],
  ['lightning', 'lightning'],
  ['pil', 'pillow'],
  ['prophet', 'prophet'],
  ['pytorch', 'torch'],
  ['pytorch-lightning', 'pytorch-lightning'],
  ['pytorch_tabnet', 'pytorch-tabnet'],
  ['pytorch_tabular', 'pytorch-tabular'],
  ['sklearn', 'scikit-learn'],
  ['statsmodels', 'statsmodels'],
  ['tensorflow', 'tensorflow'],
  ['torch', 'torch'],
  ['xgboost', 'xgboost'],
  ['yaml', 'pyyaml'],
]);

const PACKAGE_IMPORT_CANDIDATES = new Map<string, string[]>([
  ['catboost', ['catboost']],
  ['lightgbm', ['lightgbm']],
  ['opencv-python', ['cv2']],
  ['pillow', ['PIL']],
  ['prophet', ['prophet']],
  ['pytorch-lightning', ['pytorch_lightning', 'lightning']],
  ['pytorch-tabnet', ['pytorch_tabnet']],
  ['pytorch-tabular', ['pytorch_tabular']],
  ['pyyaml', ['yaml']],
  ['scikit-learn', ['sklearn']],
  ['statsmodels', ['statsmodels']],
  ['tensorflow', ['tensorflow']],
  ['torch', ['torch']],
  ['xgboost', ['xgboost']],
]);

const MODEL_TYPE_DEPENDENCY_PATTERNS: Array<{ pattern: RegExp; requirement: string }> = [
  { pattern: /\bcatboost\b/i, requirement: 'catboost' },
  { pattern: /\bxgboost\b/i, requirement: 'xgboost' },
  { pattern: /\blightgbm\b/i, requirement: 'lightgbm' },
  { pattern: /\bstatsmodels?\b/i, requirement: 'statsmodels' },
  { pattern: /\bprophet\b/i, requirement: 'prophet' },
  { pattern: /tab[-_ ]?transformer|ft[-_ ]?transformer/i, requirement: 'pytorch-tabular' },
  { pattern: /\btabnet\b/i, requirement: 'pytorch-tabnet' },
  { pattern: /\bpytorch[-_ ]?lightning\b|\blightning\b/i, requirement: 'pytorch-lightning' },
  { pattern: /\bimbalanced[-_ ]?learn\b|\bimblearn\b/i, requirement: 'imbalanced-learn' },
  { pattern: /\bcategory[-_ ]?encoders?\b/i, requirement: 'category-encoders' },
];

const SPECIFIC_MODEL_TYPE_PATTERNS: Array<{ pattern: RegExp; modelType: string }> = [
  { pattern: /tab[-_ ]?transformer/i, modelType: 'tabtransformer' },
  { pattern: /ft[-_ ]?transformer/i, modelType: 'fttransformer' },
  { pattern: /\btabnet\b/i, modelType: 'tabnet' },
  { pattern: /\brandom[-_ ]?forest[-_ ]?(?:classifier)\b|\bRandomForestClassifier\b/i, modelType: 'random_forest_classifier' },
  { pattern: /\brandom[-_ ]?forest[-_ ]?(?:regressor)\b|\bRandomForestRegressor\b/i, modelType: 'random_forest_regressor' },
  { pattern: /\brandom[-_ ]?forest\b/i, modelType: 'random_forest' },
  { pattern: /\bgradient[-_ ]?boost(?:ing)?[-_ ]?(?:classifier)\b|\bGradientBoostingClassifier\b/i, modelType: 'gradient_boosting_classifier' },
  { pattern: /\bgradient[-_ ]?boost(?:ing)?[-_ ]?(?:regressor)\b|\bGradientBoostingRegressor\b/i, modelType: 'gradient_boosting_regressor' },
  { pattern: /\bgradient[-_ ]?boost(?:ing)?\b/i, modelType: 'gradient_boosting' },
  { pattern: /\bdecision[-_ ]?tree[-_ ]?(?:classifier)\b|\bDecisionTreeClassifier\b/i, modelType: 'decision_tree_classifier' },
  { pattern: /\bdecision[-_ ]?tree[-_ ]?(?:regressor)\b|\bDecisionTreeRegressor\b/i, modelType: 'decision_tree_regressor' },
  { pattern: /\bdecision[-_ ]?tree\b/i, modelType: 'decision_tree' },
  { pattern: /\blogistic[-_ ]?regression\b|\bLogisticRegression\b/i, modelType: 'logistic_regression' },
  { pattern: /\blinear[-_ ]?regression\b|\bLinearRegression\b/i, modelType: 'linear_regression' },
  { pattern: /\bridge(?:[-_ ]?regression)?\b|\bRidge\b/i, modelType: 'ridge' },
  { pattern: /\blasso(?:[-_ ]?regression)?\b|\bLasso\b/i, modelType: 'lasso' },
  { pattern: /\belastic[-_ ]?net\b|\bElasticNet\b/i, modelType: 'elasticnet' },
  { pattern: /\bk[-_ ]?nearest[-_ ]?neighbors?[-_ ]?(?:classifier)\b|\bKNeighborsClassifier\b|\bknn[-_ ]?classifier\b/i, modelType: 'knn_classifier' },
  { pattern: /\bk[-_ ]?nearest[-_ ]?neighbors?[-_ ]?(?:regressor)\b|\bKNeighborsRegressor\b|\bknn[-_ ]?regressor\b/i, modelType: 'knn_regressor' },
  { pattern: /\bk[-_ ]?nearest[-_ ]?neighbors?\b|\bKNN\b/i, modelType: 'knn' },
  { pattern: /\bMLPClassifier\b|\bmlp[-_ ]?classifier\b/i, modelType: 'mlp_classifier' },
  { pattern: /\bMLPRegressor\b|\bmlp[-_ ]?regressor\b/i, modelType: 'mlp_regressor' },
  { pattern: /\bMLP\b|\bmulti[-_ ]?layer[-_ ]?perceptron\b/i, modelType: 'mlp' },
  { pattern: /\bSVR\b|\bsvm[-_ ]?regressor\b/i, modelType: 'svr' },
  { pattern: /\b(?:LinearSVC|SVC)\b|\bsvm[-_ ]?classifier\b/i, modelType: 'svc' },
  { pattern: /\bk[-_ ]?means\b|\bKMeans\b/i, modelType: 'kmeans' },
  { pattern: /\bcatboost(?:[-_ ]?(?:classifier|regressor))?\b/i, modelType: 'catboost' },
  { pattern: /\b(?:xgboost|xgb)(?:[-_ ]?(?:classifier|regressor))?\b/i, modelType: 'xgboost' },
  { pattern: /\b(?:lightgbm|lgbm)(?:[-_ ]?(?:classifier|regressor))?\b/i, modelType: 'lightgbm' },
  { pattern: /\bprophet\b/i, modelType: 'prophet' },
  { pattern: /\bstatsmodels?\b/i, modelType: 'statsmodels' },
];

function requirementBase(requirement: string): string {
  const trimmed = requirement.trim().toLowerCase().replace(/_/g, '-');
  const match = trimmed.match(/^[a-z0-9][a-z0-9.-]*/);
  return match?.[0] ?? trimmed;
}

export function normalizeRuntimeDependencies(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const deduped = new Map<string, string>();
  for (const value of input) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const normalized = trimmed.toLowerCase().replace(/_/g, '-');
    deduped.set(requirementBase(normalized), normalized);
  }
  return Array.from(deduped.values());
}

export function inferSpecificModelType(input: string | undefined): string | null {
  if (!input?.trim()) {
    return null;
  }

  const candidates = Array.from(new Set([
    input,
    input.replace(/[_-]+/g, ' '),
  ]));

  for (const candidate of candidates) {
    for (const { pattern, modelType } of SPECIFIC_MODEL_TYPE_PATTERNS) {
      if (pattern.test(candidate)) {
        return modelType;
      }
    }
  }

  return null;
}

export function inferRuntimeDependenciesFromModelType(modelType: string | undefined): string[] {
  if (!modelType?.trim()) {
    return [];
  }

  const matches = MODEL_TYPE_DEPENDENCY_PATTERNS
    .filter(({ pattern }) => pattern.test(modelType))
    .map(({ requirement }) => requirement);

  return normalizeRuntimeDependencies(matches);
}

export function inferRuntimeDependenciesFromCode(code: string | undefined): string[] {
  if (!code?.trim()) {
    return [];
  }

  const matches = MODEL_TYPE_DEPENDENCY_PATTERNS
    .filter(({ pattern }) => pattern.test(code))
    .map(({ requirement }) => requirement);

  return normalizeRuntimeDependencies(matches);
}

export function extractMissingModuleName(message: string | undefined): string | null {
  if (!message?.trim()) {
    return null;
  }

  const patterns = [
    /(?:ModuleNotFoundError|ImportError):\s+No module named ['"]([^'"]+)['"]/i,
    /(?:ModuleNotFoundError|ImportError):\s+No module named ([A-Za-z0-9_.-]+)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

export function resolvePackageRequirementForMissingModule(moduleName: string | undefined): string | null {
  if (!moduleName?.trim()) {
    return null;
  }

  const normalizedModule = moduleName.trim().toLowerCase().replace(/_/g, '-');
  const rootModule = normalizedModule.split('.')[0] ?? normalizedModule;
  return MODULE_PACKAGE_ALIASES.get(rootModule) ?? rootModule;
}

export function extractSuccessfulRuntimeDependenciesFromHistory(
  toolCalls: unknown,
  toolResults: unknown,
): string[] {
  if (!Array.isArray(toolCalls) || !Array.isArray(toolResults)) {
    return [];
  }

  const dependencies: string[] = [];
  const pairCount = Math.min(toolCalls.length, toolResults.length);

  for (let index = 0; index < pairCount; index += 1) {
    const call = asRecord(toolCalls[index]);
    const result = asRecord(toolResults[index]);
    if (asString(call?.tool) !== 'install_package') {
      continue;
    }

    const output = asRecord(result?.output);
    const succeeded = result?.error == null && output?.success === true;
    if (!succeeded) {
      continue;
    }

    const packageName = asString(asRecord(call?.args)?.packageName);
    if (!packageName?.trim()) {
      continue;
    }
    dependencies.push(...packageName.split(/[,\s]+/).filter(Boolean));
  }

  return normalizeRuntimeDependencies(dependencies);
}

export function hasRuntimeDependency(dependencies: string[], requirement: string): boolean {
  const wanted = requirementBase(requirement);
  return dependencies.some((dependency) => requirementBase(dependency) === wanted);
}

export function getCandidateImportNamesForRequirement(requirement: string | undefined): string[] {
  if (!requirement?.trim()) {
    return [];
  }

  const normalized = requirementBase(requirement);
  const candidates = PACKAGE_IMPORT_CANDIDATES.get(normalized);
  if (candidates && candidates.length > 0) {
    return candidates;
  }

  return [normalized.replace(/-/g, '_')];
}
