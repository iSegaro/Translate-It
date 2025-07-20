// src/popup/domElements.js

// Helper function for querying elements
function $(selector) {
  return document.getElementById(selector);
}

export default {
  // Form & Text Areas
  translationForm: $("translationForm"),
  sourceText: $("sourceText"),
  translationResult: $("translationResult"),
  sourceContainer: $("sourceText")?.parentElement,
  resultContainer: $("translationResult")?.parentElement,

  // Language Controls
  sourceLanguageInput: $("sourceLanguageInput"),
  targetLanguageInput: $("targetLanguageInput"),
  swapLanguagesBtn: $("swapLanguagesBtn"),
  translateBtn: $("translateBtn"),

  // Inline Toolbars & Buttons
  copySourceBtn: $("copySourceBtn"),
  pasteSourceBtn: $("pasteSourceBtn"),
  voiceSourceIcon: $("voiceSourceIcon"),
  copyTargetBtn: $("copyTargetBtn"),
  voiceTargetIcon: $("voiceTargetIcon"),

  // Header Toolbar Buttons
  translatePageLink: $("translatePageLink"),
  selectElementIcon: $("selectElementIcon"),
  clearStorageBtn: $("clearStorageBtn"),
  revertIcon: $("revertActionIcon"),
  settingsIcon: $("settingsIcon"),

  // Popup Container
  popupContainer: document.body,

  // Utility function access
  $: $,
};
