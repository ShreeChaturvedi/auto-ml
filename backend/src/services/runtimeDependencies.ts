import { asRecord, asString } from '../utils/typeCoercion.js';

const MODULE_PACKAGE_ALIASES = new Map<string, string>([
  ['catboost', 'catboost'],
  ['cv2', 'opencv-python'],
  ['imblearn', 'imbalanced-learn'],
  ['lightgbm', 'lightgbm'],
  ['pil', 'pillow'],
  ['prophet', 'prophet'],
  ['pytorch', 'torch'],
  ['sklearn', 'scikit-learn'],
  ['statsmodels', 'statsmodels'],
  ['tensorflow', 'tensorflow'],
  ['torch', 'torch'],
  ['xgboost', 'xgboost'],
  ['yaml', 'pyyaml'],
]);

const MODEL_TYPE_DEPENDENCY_PATTERNS: Array<{ pattern: RegExp; requirement: string }> = [
  { pattern: /\bcatboost\b/i, requirement: 'catboost' },
  { pattern: /\bxgboost\b/i, requirement: 'xgboost' },
  { pattern: /\blightgbm\b/i, requirement: 'lightgbm' },
  { pattern: /\bstatsmodels?\b/i, requirement: 'statsmodels' },
  { pattern: /\bprophet\b/i, requirement: 'prophet' },
  { pattern: /\bimbalanced[-_ ]?learn\b|\bimblearn\b/i, requirement: 'imbalanced-learn' },
  { pattern: /\bcategory[-_ ]?encoders?\b/i, requirement: 'category-encoders' },
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
    dependencies.push(packageName);
  }

  return normalizeRuntimeDependencies(dependencies);
}

export function hasRuntimeDependency(dependencies: string[], requirement: string): boolean {
  const wanted = requirementBase(requirement);
  return dependencies.some((dependency) => requirementBase(dependency) === wanted);
}
