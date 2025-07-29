// eslint.config.js

const js = require("@eslint/js");
const babelParser = require("@babel/eslint-parser");
const noUnsanitized = require("eslint-plugin-no-unsanitized");
const vuePlugin = require("eslint-plugin-vue");
const vueParser = require("vue-eslint-parser");

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
  // Vue specific configuration
  ...vuePlugin.configs["flat/recommended"],
  {
    files: ["src/**/*.js", "src/**/*.vue"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
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
        self: "readonly",
        global: "readonly",
        crypto: "readonly",
        performance: "readonly",
        afterEach: "readonly",
      },
    },
    plugins: {
      "no-unsanitized": noUnsanitized,
      vue: vuePlugin,
    },
    rules: {
      "vue/multi-word-component-names": "off",
      "vue/no-unused-vars": "warn",
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

module.exports = config;
