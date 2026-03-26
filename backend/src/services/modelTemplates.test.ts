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

  it('returns undefined for truly unknown IDs', () => {
    expect(getModelTemplate('nonexistent')).toBeUndefined();
  });
});
