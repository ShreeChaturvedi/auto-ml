import type { LlmToolDefinition } from '../llmClient.js';

export const PACKAGE_TOOL_DEFINITIONS: LlmToolDefinition[] = [
  {
    name: 'install_package',
    description: 'Install a Python package in the runtime environment. The package will be available in code cells.',
    parameters: {
      type: 'object',
      properties: {
        packageName: { type: 'string', description: 'The package name to install (e.g., "pandas", "scikit-learn>=1.0", "torch").' }
      },
      required: ['packageName']
    }
  },
  {
    name: 'uninstall_package',
    description: 'Uninstall a Python package from the runtime environment.',
    parameters: {
      type: 'object',
      properties: {
        packageName: { type: 'string', description: 'The package name to uninstall.' }
      },
      required: ['packageName']
    }
  },
  {
    name: 'list_packages',
    description: 'List all installed Python packages in the runtime environment.',
    parameters: {
      type: 'object',
      properties: {}
    }
  }
];
