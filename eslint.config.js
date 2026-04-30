import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.git/**",
      "**/coverage/**",
      "client/dist/**",
      "DESIGN/**",
      "docs/**",
      "**/*.min.js",
      "**/*.sqlite-backup",
    ],
  },

  js.configs.recommended,

  // Server (Node, ESM)
  {
    files: ["server/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-console": "error",
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      eqeqeq: ["error", "smart"],
    },
  },

  // Server scripts / migrations / seeds — console is the intended UX
  {
    files: [
      "server/migrations/**/*.js",
      "server/migrate-to-postgres.js",
      "server/seed-*.js",
      "server/create-superadmin.js",
      "server/lookup-*.js",
      "server/test-*.js",
      "server/db.js",
    ],
    rules: {
      "no-console": "off",
    },
  },

  // Server tests — relax no-console
  {
    files: ["server/**/*.test.js"],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
    rules: {
      "no-console": "off",
    },
  },

  // Client (browser, JSX, ESM)
  {
    files: ["client/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    settings: { react: { version: "18" } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/no-unescaped-entities": "off",
      "react-refresh/only-export-components": "warn",
      "no-console": "warn",
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      eqeqeq: ["error", "smart"],
    },
  },

  // Client tests
  {
    files: ["client/**/*.test.{js,jsx}", "client/src/test-setup.js"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.vitest },
    },
    rules: {
      "no-console": "off",
    },
  },

  // Vite + tooling configs (Node-y)
  {
    files: [
      "client/vite.config.js",
      "client/vitest.config.js",
      "client/postcss.config.js",
      "client/tailwind.config.js",
      "server/vitest.config.js",
      "eslint.config.js",
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
];
