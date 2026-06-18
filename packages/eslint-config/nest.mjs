import globals from "globals";
import prettier from "eslint-config-prettier";
import baseConfig from "./base.mjs";

/** ESLint flat config for NestJS (Node) services. */
export default [
  ...baseConfig,
  {
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  // Keep last: turn off stylistic rules that would fight Prettier.
  prettier,
];
