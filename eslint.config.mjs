import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  // Base ESLint configuration for all files
  {
    ...eslint.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // Browser runtime + web extension APIs
        ...globals.browser, // window, document, Event, console, etc.
        ...globals.webextensions, // browser, chrome, etc.
      },
    },
    rules: {
      ...eslint.configs.recommended.rules,
      "no-console": "error",
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // TypeScript-only configuration
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: true,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      // Disable base ESLint rules that have TypeScript equivalents
      "no-unused-vars": "off",

      // Apply TypeScript-specific rules
      ...tseslint.configs.recommended.rules,
      ...tseslint.configs.recommendedTypeChecked.rules,

      // Custom TypeScript rules
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Ignore generated/build files
  {
    ignores: ["artifacts/**", "dist/**", "node_modules/**"],
  },
];
