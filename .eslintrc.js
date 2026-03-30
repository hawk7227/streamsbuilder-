/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    project: true,
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/strict-type-checked",
    "plugin:@typescript-eslint/stylistic-type-checked",
  ],
  rules: {
    // Hard no-any — no exceptions
    "@typescript-eslint/no-explicit-any":              "error",
    "@typescript-eslint/no-unsafe-assignment":         "error",
    "@typescript-eslint/no-unsafe-member-access":      "error",
    "@typescript-eslint/no-unsafe-call":               "error",
    "@typescript-eslint/no-unsafe-return":             "error",
    "@typescript-eslint/no-unsafe-argument":           "error",

    // Unused variables are build noise
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],

    // Enforce explicit return types on exported functions
    "@typescript-eslint/explicit-module-boundary-types": "error",

    // No floating promises — every async call must be awaited or void'd
    "@typescript-eslint/no-floating-promises": "error",

    // Require consistent type assertions
    "@typescript-eslint/consistent-type-assertions": [
      "error",
      { assertionStyle: "as", objectLiteralTypeAssertions: "never" },
    ],

    // Enforce type-only imports
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { prefer: "type-imports", fixStyle: "inline-type-imports" },
    ],

    // No non-null assertions — handle nullability explicitly
    "@typescript-eslint/no-non-null-assertion": "error",

    // Prefer nullish coalescing over ||
    "@typescript-eslint/prefer-nullish-coalescing": "error",

    // Prefer optional chaining
    "@typescript-eslint/prefer-optional-chain": "error",

    // No require() — ESM only
    "@typescript-eslint/no-require-imports": "error",
  },
  overrides: [
    // Next.js web app — relax rules that conflict with React/Next.js patterns
    {
      files: ["apps/web/src/**/*.tsx", "apps/web/src/**/*.ts"],
      rules: {
        "@typescript-eslint/explicit-module-boundary-types": "off",
        "@typescript-eslint/no-confusing-void-expression": "off",
        "@typescript-eslint/restrict-template-expressions": "off",
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/dot-notation": "off",
      },
    },
    // Config files (CommonJS)
    {
      files: [".eslintrc.js", "*.config.js", "*.config.cjs"],
      env: { node: true },
      rules: {
        "@typescript-eslint/no-require-imports": "off",
      },
    },
    // Test files
    {
      files: ["**/*.test.ts", "**/*.test.tsx", "**/e2e/**/*.ts"],
      rules: {
        "@typescript-eslint/no-unsafe-assignment":    "off",
        "@typescript-eslint/no-explicit-any":         "off",
      },
    },
  ],
  ignorePatterns: [
    "dist/", ".next/", "node_modules/", "coverage/",
    "playwright-report/", "*.d.ts",
  ],
};
