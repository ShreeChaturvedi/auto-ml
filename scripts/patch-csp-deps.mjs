import fs from 'node:fs';
import path from 'node:path';

const repoRoot = new URL('..', import.meta.url);

const patches = [
  {
    file: 'frontend/node_modules/plotly.js/stackgl_modules/index.js',
    replacements: [
      {
        from: "return this || new Function('return this')();",
        to: 'return this || globalThis;',
      },
    ],
  },
  {
    file: 'frontend/node_modules/plotly.js/dist/plotly.js',
    replacements: [
      {
        from: 'return this || new Function("return this")();',
        to: 'return this || globalThis;',
      },
    ],
  },
  {
    file: 'frontend/node_modules/zod/v4/core/util.js',
    replacements: [
      {
        from: `export const allowsEval = cached(() => {
    // @ts-ignore
    if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
        return false;
    }
    try {
        const F = Function;
        new F("");
        return true;
    }
    catch (_) {
        return false;
    }
});`,
        to: `export const allowsEval = cached(() => false);`,
      },
    ],
  },
  {
    file: 'frontend/node_modules/zod/v4/core/util.cjs',
    replacements: [
      {
        from: `exports.allowsEval = cached(() => {
    // @ts-ignore
    if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
        return false;
    }
    try {
        const F = Function;
        new F("");
        return true;
    }
    catch (_) {
        return false;
    }
});`,
        to: `exports.allowsEval = cached(() => false);`,
      },
    ],
  },
  {
    file: 'frontend/node_modules/pdfjs-dist/build/pdf.mjs',
    replacements: [
      {
        from: `function isEvalSupported() {\n  try {\n    new Function("");\n    return true;\n  } catch {\n    return false;\n  }\n}`,
        to: `function isEvalSupported() {\n  return false;\n}`,
      },
    ],
  },
];

for (const patch of patches) {
  const absolutePath = path.join(repoRoot.pathname, patch.file);
  if (!fs.existsSync(absolutePath)) {
    continue;
  }

  let source = fs.readFileSync(absolutePath, 'utf8');
  let changed = false;

  for (const replacement of patch.replacements) {
    if (source.includes(replacement.to)) {
      continue;
    }

    if (!source.includes(replacement.from)) {
      throw new Error(`Expected patch target not found in ${patch.file}`);
    }

    source = source.replace(replacement.from, replacement.to);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(absolutePath, source);
  }
}
