// eslint.config.js

import js from "@eslint/js";
import babelParser from "@babel/eslint-parser";
import noUnsanitized from "eslint-plugin-no-unsanitized";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
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
        window: "readonly",
        document: "readonly",
        Node: "readonly",
        NodeFilter: "readonly",
        Audio: "readonly",
        SpeechSynthesisUtterance: "readonly",
        speechSynthesis: "readonly",
        chrome: "readonly",
        URL: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        DataTransfer: "readonly",
        ClipboardEvent: "readonly",
        InputEvent: "readonly",
        Element: "readonly",
        Event: "readonly",
        requestAnimationFrame: "readonly",
        navigator: "readonly",
        HTMLElement: "readonly",
        KeyboardEvent: "readonly",
        console: "readonly",
        CustomEvent: "readonly",
        cancelAnimationFrame: "readonly",
        ResizeObserver: "readonly",
      },
    },
    plugins: {
      "no-unsanitized": noUnsanitized,
    },
    rules: {
      // استفاده امن از innerHTML
      "no-unsanitized/method": "error",
      "no-unsanitized/property": "error",

      // سایر قوانین مفید (اختیاری)
      "no-console": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
];
