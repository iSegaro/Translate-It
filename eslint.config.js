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
      parser: babelParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
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
        DOMPurify: "readonly",
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
