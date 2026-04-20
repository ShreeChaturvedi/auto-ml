import { describe, it, expect } from 'vitest';

import { getModelTemplate, listModelTemplates } from './modelTemplates.js';

describe('modelTemplates', () => {
  it('returns supported templates with defaults', () => {
    const templates = listModelTemplates();

    expect(templates.length).toBeGreaterThan(0);

    templates.forEach((template) => {
      expect(template.id).toBeTruthy();
      expect(template.name).toBeTruthy();
      expect(template.metrics.length).toBeGreaterThan(0);

      template.parameters.forEach((param) => {
        expect(template.defaultParams).toHaveProperty(param.key);
      });

      const lookup = getModelTemplate(template.id);
      expect(lookup?.id).toBe(template.id);
    });
  });

  it('resolves legacy hyphenated IDs via aliases', () => {
    expect(getModelTemplate('random-forest-classifier')?.id).toBe('random_forest_classifier');
    expect(getModelTemplate('linear-regression')?.id).toBe('linear_regression');
    expect(getModelTemplate('knn-classifier')?.id).toBe('knn_classifier');
    expect(getModelTemplate('gradient-boosting-classifier')?.id).toBe('gradient_boosting_classifier');
    expect(getModelTemplate('logistic-regression')?.id).toBe('logistic_regression');
  });

  it('resolves supported llm-prefixed template IDs', () => {
    expect(getModelTemplate('llm-random_forest_regressor', 'regression')?.id).toBe('random_forest_regressor');
    expect(getModelTemplate('llm-logistic_regression', 'classification')?.id).toBe('logistic_regression');
    expect(getModelTemplate('llm-ridge', 'regression')?.id).toBe('ridge_regression');
  });

  it('uses taskType to disambiguate bare llm model families', () => {
    expect(getModelTemplate('llm-random_forest', 'classification')?.id).toBe('random_forest_classifier');
    expect(getModelTemplate('llm-random_forest', 'regression')?.id).toBe('random_forest_regressor');
    expect(getModelTemplate('llm-random_forest')?.id).toBeUndefined();
  });

  it('keeps unsupported llm-prefixed families unresolved', () => {
    expect(getModelTemplate('llm-lightgbm', 'regression')).toBeUndefined();
    expect(getModelTemplate('llm-catboost', 'regression')).toBeUndefined();
    expect(getModelTemplate('llm-decision_tree_regressor', 'regression')).toBeUndefined();
    expect(getModelTemplate('llm-mlp', 'classification')).toBeUndefined();
  });

  it('returns undefined for truly unknown IDs', () => {
    expect(getModelTemplate('nonexistent')).toBeUndefined();
  });
});
