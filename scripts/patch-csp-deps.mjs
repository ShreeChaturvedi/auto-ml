import fs from 'node:fs';
import path from 'node:path';

const repoRoot = new URL('..', import.meta.url);
const workspaces = ['frontend', 'landing'];

const patchSpecs = [
  {
    relativeFile: 'node_modules/plotly.js/stackgl_modules/index.js',
    replacements: [
      {
        from: "return this || new Function('return this')();",
        to: 'return this || globalThis;',
      },
    ],
  },
  {
    relativeFile: 'node_modules/plotly.js/dist/plotly.js',
    replacements: [
      {
        from: 'return this || new Function("return this")();',
        to: 'return this || globalThis;',
      },
    ],
  },
  {
    relativeFile: 'node_modules/zod/v4/core/util.js',
    replacements: [
      {
        pattern: /export const allowsEval = cached\(\(\) => \{[\s\S]*?\n\}\);/,
        to: `export const allowsEval = cached(() => false);`,
      },
    ],
  },
  {
    relativeFile: 'node_modules/zod/v4/core/util.cjs',
    replacements: [
      {
        pattern: /exports\.allowsEval = cached\(\(\) => \{[\s\S]*?\n\}\);/,
        to: `exports.allowsEval = cached(() => false);`,
      },
    ],
  },
  {
    relativeFile: 'node_modules/pdfjs-dist/build/pdf.mjs',
    replacements: [
      {
        from: `function isEvalSupported() {\n  try {\n    new Function("");\n    return true;\n  } catch {\n    return false;\n  }\n}`,
        to: `function isEvalSupported() {\n  return false;\n}`,
      },
    ],
  },
];

for (const workspace of workspaces) {
  for (const patchSpec of patchSpecs) {
    const relativePath = `${workspace}/${patchSpec.relativeFile}`;
    const absolutePath = path.join(repoRoot.pathname, relativePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    let source = fs.readFileSync(absolutePath, 'utf8');
    let changed = false;

    for (const replacement of patchSpec.replacements) {
      if (source.includes(replacement.to)) {
        continue;
      }

      if ('pattern' in replacement) {
        if (!replacement.pattern.test(source)) {
          throw new Error(`Expected patch target not found in ${relativePath}`);
        }
        source = source.replace(replacement.pattern, replacement.to);
        changed = true;
        continue;
      }

      if (!source.includes(replacement.from)) {
        throw new Error(`Expected patch target not found in ${relativePath}`);
      }

      source = source.replace(replacement.from, replacement.to);
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(absolutePath, source);
    }
  }
}
