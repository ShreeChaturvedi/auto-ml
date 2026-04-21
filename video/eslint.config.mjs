import { makeConfig } from "@remotion/eslint-config-flat";

const config = makeConfig({
  remotionDir: ["remotion/**", "presentation/**"],
});

export default [
  // Root-level `.cjs` files in this workspace are one-off capture diagnostics.
  { ignores: ["*.cjs"] },
  ...config,
];
