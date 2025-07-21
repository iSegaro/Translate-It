// eslint.config.js

import js from "@eslint/js";
import babelParser from "@babel/eslint-parser";
import noUnsanitized from "eslint-plugin-no-unsanitized";

const browser = process.env.BROWSER || "chrome";

const browserGlobals = {
  chrome: {
    chrome: "readonly",
  },
  firefox: {
    browser: "readonly",
  },
};

const config = [
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
        chrome: "readonly",
        browser: "readonly",
        window: "readonly",
        document: "readonly",
        Node: "readonly",
        NodeFilter: "readonly",
        Audio: "readonly",
        SpeechSynthesisUtterance: "readonly",
        speechSynthesis: "readonly",
        URL: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
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
        DOMParser: "readonly",
        Blob: "readonly",
        FileReader: "readonly",
        location: "readonly",
        history: "readonly",
        alert: "readonly",
        URLSearchParams: "readonly",
        MutationObserver: "readonly",
      },
    },
    plugins: {
      "no-unsanitized": noUnsanitized,
    },
    rules: {
      // استفاده امن از innerHTML
      "no-unsanitized/method": "error",
      "no-unsanitized/property": [
        "error",
        {
          escape: {
            methods: ["DOMPurify.sanitize"],
          },
        },
      ],
      // سایر قوانین
      "no-console": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
];

if (browser === 'firefox') {
  config.push({
    ignores: ["src/offscreen.js"],
  });
}

export default config;
