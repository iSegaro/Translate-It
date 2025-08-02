import js from "@eslint/js";
import vuePlugin from "eslint-plugin-vue";
import babelParser from "@babel/eslint-parser";
import vueParser from "vue-eslint-parser";
import globals from "globals";

export default [
  // Global ignores
  {
    ignores: [
      "dist/",
      "OLD/",
      "node_modules/",
      "public/",
      "*.mjs",
      "scripts/",
      "config/",
      "tests/e2e/",
      "*.config.js",
    ],
  },

  // Recommended base configurations
  js.configs.recommended,
  ...vuePlugin.configs["flat/recommended"],

  // Configuration for Vue files
  {
    files: ["src/**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: babelParser,
        requireConfigFile: false,
        babelOptions: {
          plugins: [
            ["@babel/plugin-proposal-decorators", { legacy: true }],
            ["@babel/plugin-transform-class-properties", { loose: true }],
          ],
        },
      },
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        defineExpose: "readonly",
      },
    },
    plugins: {
      vue: vuePlugin,
    },
    rules: {
      "vue/multi-word-component-names": "off",
      "vue/no-unused-vars": "warn",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "vue/attribute-hyphenation": ["warn", "always"],
      "vue/attributes-order": ["warn", { order: ["DEFINITION", "LIST_RENDERING", "CONDITIONALS", "RENDER_MODIFIERS", "GLOBAL", "UNIQUE", "TWO_WAY_BINDING", "OTHER_DIRECTIVES", "OTHER_ATTR", "EVENTS", "CONTENT"] }],
      "vue/html-closing-bracket-newline": "warn",
      "vue/html-indent": "warn",
      "vue/html-self-closing": "warn",
      "vue/max-attributes-per-line": ["warn", { singleline: 1, multiline: 1 }],
      "vue/singleline-html-element-content-newline": "warn",
    },
  },

  // Configuration for JS files in src/
  {
    files: ["src/**/*.js"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          plugins: [
            ["@babel/plugin-proposal-decorators", { legacy: true }],
            ["@babel/plugin-transform-class-properties", { loose: true }],
          ],
        },
      },
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        ...globals.serviceworker,
        ...globals.node, // For process, etc.
      },
    },
    rules: {
      "no-undef": "warn",
    },
  },

  // Configuration for test files
  {
    files: ["src/**/*.test.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
    },
    rules: {
      "no-undef": "off",
    },
  },

  // Configuration for specific files
  {
    files: ["src/utils/secureStorage.js"],
    rules: {
      "no-redeclare": "off",
    },
  },
];
