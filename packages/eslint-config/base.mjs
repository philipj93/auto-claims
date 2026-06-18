import js from "@eslint/js";
import tseslint from "typescript-eslint";
import turbo from "eslint-plugin-turbo";

/**
 * Shared base ESLint flat config used by every workspace.
 * Framework-specific configs (./nest, ./next) extend this and append
 * `eslint-config-prettier` last so formatting is owned entirely by Prettier.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/.turbo/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { turbo },
    rules: {
      "turbo/no-undeclared-env-vars": "warn",
    },
  },
  {
    // Tests and mock helpers legitimately reach for `any` and non-null assertions.
    files: [
      "**/*.{test,spec}.{ts,tsx}",
      "**/test/**",
      "**/__tests__/**",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
