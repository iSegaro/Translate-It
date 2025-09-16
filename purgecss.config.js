module.exports = {
  content: [
    './src/**/*.{vue,js,ts,jsx,tsx}',
    './src/**/*.html',
    './public/**/*.html',
    './manifest.json'
  ],

  css: [
    './src/assets/styles/**/*.scss',
    './dist/**/*.css'
  ],

  // Safelist critical classes
  safelist: {
    standard: [
      // Extension-specific classes that are dynamically added
      /^AIWritingCompanion-/,
      /^translate-it-/,
      /^aiwc-/,

      // Our ti- prefixed classes
      /^ti-/,

      // Vue transition classes
      /^.*-enter$/,
      /^.*-enter-active$/,
      /^.*-enter-to$/,
      /^.*-leave$/,
      /^.*-leave-active$/,
      /^.*-leave-to$/,

      // Third-party library classes
      /^sonner-/,
      /^toaster/,
      /^vue-sonner/,

      // Dynamic state classes
      'active',
      'selected',
      'disabled',
      'loading',
      'visible',
      'hidden',
      'error',
      'success',

      // Context classes
      'popup-context',
      'options-context',
      'sidepanel-context',
      'content-context',

      // Wrapper classes
      'popup-wrapper',
      'sidepanel-wrapper',
      'options-wrapper',

      // Theme classes
      'dark',
      'light',
      'system',

      // Language classes
      'rtl',
      'ltr',

      // Screen reader
      'sr-only',

      // Critical shadow DOM classes
      'content-app-container',
      'ui-host-container'
    ],

    deep: [
      // Vue.js deep selectors
      /^.*:deep\(/,
      /^.*>>>/,
      /^.*\/deep\//
    ],

    greedy: [
      // CSS custom properties
      /^--/,

      // Pseudo selectors
      /:hover$/,
      /:focus$/,
      /:active$/,
      /:visited$/,
      /:disabled$/,

      // CSS functions
      /^calc\(/,
      /^var\(/,
      /^rgba?\(/,
      /^hsla?\(/
    ]
  },

  // Block list - remove these even if found
  blocklist: [
    // Remove debug classes
    /^debug-/,
    /^test-/,
    /^temp-/,

    // Remove unused vendor prefixes
    /^-webkit-scrollbar.*unused/,
    /^-moz-.*unused/
  ],

  // Extract dynamic class patterns
  dynamicAttributes: [
    'class',
    'className',
    ':class'
  ],

  // Options
  variables: true, // Keep CSS custom properties
  keyframes: true, // Keep @keyframes
  fontFace: true,  // Keep @font-face

  // Skip removing CSS from certain files
  skippedContentGlobs: [
    'node_modules/**/*',
    'dist/**/*.min.css'
  ]
}