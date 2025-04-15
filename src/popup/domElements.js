// src/popup/domElements.js

// Helper function for querying elements
function $(selector) {
  const element = document.getElementById(selector);
  if (!element) {
    console.warn(`[DOM] Element not found for selector: ${selector}`);
  }
  return element;
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
  sourceLanguagesList: $("sourceLanguagesList"),
  targetLanguagesList: $("targetLanguagesList"),
  clearSourceLanguage: $("clearSourceLanguage"),
  clearTargetLanguage: $("clearTargetLanguage"),
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
