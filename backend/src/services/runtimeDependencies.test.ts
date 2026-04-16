import { describe, expect, it } from 'vitest';

import {
  getCandidateImportNamesForRequirement,
  inferRuntimeDependenciesFromModelType,
  inferSpecificModelType,
  resolvePackageRequirementForMissingModule,
} from './runtimeDependencies.js';

describe('runtimeDependencies', () => {
  it('recognizes specific advanced neural model types from free-form text', () => {
    expect(inferSpecificModelType('TabTransformer_TimeAware_Candidate')).toBe('tabtransformer');
    expect(inferSpecificModelType('FTTransformer baseline')).toBe('fttransformer');
    expect(inferSpecificModelType('tabnet classifier')).toBe('tabnet');
  });

  it('recognizes classic sklearn families from free-form text', () => {
    expect(inferSpecificModelType('DecisionTreeRegressor baseline')).toBe('decision_tree_regressor');
    expect(inferSpecificModelType('decision_tree_regressor_usage_count_depth8')).toBe('decision_tree_regressor');
    expect(inferSpecificModelType('random forest classifier')).toBe('random_forest_classifier');
    expect(inferSpecificModelType('KNeighborsClassifier')).toBe('knn_classifier');
    expect(inferSpecificModelType('svr with rbf kernel')).toBe('svr');
    expect(inferSpecificModelType('MLP Regressor')).toBe('mlp_regressor');
    expect(inferSpecificModelType('mlp_regressor_time_series_usage_count')).toBe('mlp_regressor');
    expect(inferSpecificModelType('KMeans clustering')).toBe('kmeans');
    expect(inferSpecificModelType('LogisticRegression')).toBe('logistic_regression');
    expect(inferSpecificModelType('lightgbm_regressor')).toBe('lightgbm');
    expect(inferSpecificModelType('lightgbm_usage_count_regression')).toBe('lightgbm');
    expect(inferSpecificModelType('xgboost_classifier')).toBe('xgboost');
    expect(inferSpecificModelType('catboost regressor')).toBe('catboost');
  });

  it('infers installable runtime dependencies for advanced neural model types', () => {
    expect(inferRuntimeDependenciesFromModelType('tabtransformer')).toEqual(['pytorch-tabular']);
    expect(inferRuntimeDependenciesFromModelType('fttransformer')).toEqual(['pytorch-tabular']);
    expect(inferRuntimeDependenciesFromModelType('tabnet')).toEqual(['pytorch-tabnet']);
  });

  it('maps missing neural modules to the right package requirements', () => {
    expect(resolvePackageRequirementForMissingModule('pytorch_tabular')).toBe('pytorch-tabular');
    expect(resolvePackageRequirementForMissingModule('pytorch_tabnet')).toBe('pytorch-tabnet');
  });

  it('maps install requirements to candidate import names for kernel verification', () => {
    expect(getCandidateImportNamesForRequirement('pytorch-tabular')).toEqual(['pytorch_tabular']);
    expect(getCandidateImportNamesForRequirement('pytorch-lightning')).toEqual(['pytorch_lightning', 'lightning']);
    expect(getCandidateImportNamesForRequirement('torch')).toEqual(['torch']);
  });
});
