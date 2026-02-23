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
});
