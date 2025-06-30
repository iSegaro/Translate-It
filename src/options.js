// src/options.js

import Browser from "webextension-polyfill";
import { getSettingsAsync, CONFIG } from "./config.js";
import { ErrorHandler } from "./services/ErrorService.js";
import { ErrorTypes } from "./services/ErrorTypes.js";
import { logME } from "./utils/helpers.js";
import { app_localize, getTranslationString } from "./utils/i18n.js";
import { fadeOutInElement } from "./utils/i18n.helper.js";
import { applyTheme } from "./utils/theme.js";
import { marked } from "marked";
import "./utils/localization.js";

document.addEventListener("DOMContentLoaded", async () => {
  // --- Element Selection ---
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabContentContainer = document.querySelector(".tab-content-container");
  const errorHandler = new ErrorHandler();

  // Theme controls
  const themeSwitch = document.getElementById("theme-Switch");
  const themeAuto = document.getElementById("theme-Auto");

  // --- Theme Control Logic ---
  const setThemeControlsState = (currentThemeValue) => {
    if (!themeAuto || !themeSwitch) {
      logME("Theme control elements not found");
      return;
    }
    applyTheme(currentThemeValue);
    if (currentThemeValue === "auto") {
      themeAuto.checked = true;
      themeSwitch.disabled = true;
      if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      ) {
        themeSwitch.checked = true;
      } else {
        themeSwitch.checked = false;
      }
    } else {
      themeAuto.checked = false;
      themeSwitch.disabled = false;
      themeSwitch.checked = currentThemeValue === "dark";
    }
    logME(`Theme controls updated: THEME = ${currentThemeValue}`);
  };

  // Initial theme load
  if (themeSwitch && themeAuto) {
    Browser.storage.local
      .get("THEME")
      .then((result) => {
        const savedTheme = result.THEME || CONFIG.THEME || "auto";
        setThemeControlsState(savedTheme);
      })
      .catch((err) => {
        logME("Error loading theme from storage:", err);
        setThemeControlsState(CONFIG.THEME || "auto");
      });

    // رویداد برای سوئیچ دستی تم (Light/Dark)
    themeSwitch.addEventListener("change", async () => {
      if (themeSwitch.disabled) return; // اگر سوئیچ غیرفعال است (Auto فعال است)، کاری نکن
      const newThemeValue = themeSwitch.checked ? "dark" : "light";
      await Browser.storage.local.set({ THEME: newThemeValue });
      applyTheme(newThemeValue); // فقط تم را اعمال کن، وضعیت کنترلرها نباید تغییر کند
      // themeAuto.checked باید false باشد، که با کلیک روی سوئیچ دستی، توسط کنترلر themeAuto مدیریت می‌شود اگر پیاده‌سازی شود
      // یا مستقیماً اینجا:
      // اگر به نحوی Auto هنوز تیک داشت
      if (themeAuto.checked) themeAuto.checked = false;
    });

    themeAuto.addEventListener("change", async () => {
      const newThemeToApply =
        themeAuto.checked ? "auto"
        : themeSwitch.checked ? "dark"
        : "light";
      await Browser.storage.local.set({ THEME: newThemeToApply });
      setThemeControlsState(newThemeToApply);
    });
  }

  const selectionModeImmediateRadio = document.getElementById(
    "selection-mode-immediate"
  );
  const selectionModeOnClickRadio = document.getElementById(
    "selection-mode-onclick"
  );
  const selectionModeGroup = document.getElementById("selectionModeGroup");

  const extensionEnabledCheckbox = document.getElementById("extensionEnabled");
  const translateOnTextFieldsCheckbox = document.getElementById(
    "translateOnTextFields"
  );
  const enableShortcutForTextFieldsCheckbox = document.getElementById(
    "enableShortcutForTextFields"
  );
  const translateWithSelectElementCheckbox = document.getElementById(
    "translateWithSelectElement"
  );
  const translateOnTextSelectionCheckbox = document.getElementById(
    "translateOnTextSelection"
  );
  const requireCtrlForTextSelectionCheckbox = document.getElementById(
    "requireCtrlForTextSelection"
  );
  const textSelectionCtrlGroup = document.getElementById(
    "textSelectionCtrlGroup"
  );
  const enableDictionraryCheckbox =
    document.getElementById("enableDictionrary");
  const translationApiSelect = document.getElementById("translationApi");
  const webAIApiSettings = document.getElementById("webAIApiSettings");
  const apiUrlSettingGroup = document
    .getElementById("apiUrl")
    ?.closest(".setting-group");
  const useMockCheckbox = document.getElementById("useMock");
  const debugModeCheckbox = document.getElementById("debugMode");
  const webAIApiUrlInput = document.getElementById("webAIApiUrl");
  const webAIApiModelInput = document.getElementById("webAIApiModel");
  const apiKeyInput = document.getElementById("apiKey");
  const apiUrlInput = document.getElementById("apiUrl");
  const saveSettingsButton = document.getElementById("saveSettings");
  const sourceLanguageInput = document.getElementById("sourceLanguage");
  const targetLanguageInput = document.getElementById("targetLanguage");
  const geminiApiSettings = document.getElementById("geminiApiSettings");
  const openAIApiSettings = document.getElementById("openAIApiSettings");
  const openAIApiKeyInput = document.getElementById("openaiApiKey");
  const openAIModelInput = document.getElementById("openaiApiModel");
  const openRouterApiSettings = document.getElementById(
    "openRouterApiSettings"
  );
  const openRouterApiKeyInput = document.getElementById("openrouterApiKey");
  const openRouterApiModelInput = document.getElementById("openrouterApiModel");
  const deepseekApiSettings = document.getElementById("deepseekApiSettings");
  const deepseekApiKeyInput = document.getElementById("deepseekApiKey");
  const deepseekApiModelInput = document.getElementById("deepseekApiModel");
  const customApiSettings = document.getElementById("customApiSettings");
  const customApiUrlInput = document.getElementById("customApiUrl");
  const customApiKeyInput = document.getElementById("customApiKey");
  const customApiModelInput = document.getElementById("customApiModel");
  const exportSettingsButton = document.getElementById("exportSettings");
  const importFile = document.getElementById("importFile");
  const statusElement = document.getElementById("status");
  const manifest_Name = document.getElementById("options_app_name");
  const manifest_Version = document.getElementById("options_app_version");
  const promptTemplateInput = document.getElementById("promptTemplate");
  const resetPromptButton = document.getElementById("resetPromptButton");
  const sourceLangNameSpan = document.getElementById("sourceLangName");
  const targetLangNameSpan = document.getElementById("targetLangName");
  const excludedSites = document.getElementById("excludedSites");

  // --- Event Listener for the new Reset Button ---
  if (resetPromptButton && promptTemplateInput) {
    resetPromptButton.addEventListener("click", (event) => {
      event.preventDefault();

      // Set the textarea value to the default from CONFIG
      promptTemplateInput.value = CONFIG.PROMPT_TEMPLATE;

      // Apply flash effect for user feedback
      promptTemplateInput.classList.add("highlight-on-reset");

      // Remove the class after the animation completes
      setTimeout(() => {
        promptTemplateInput.classList.remove("highlight-on-reset");
      }, 800); // Duration should match the animation time
    });
  }

  // --- Accordion Logic ---
  const accordionItems = document.querySelectorAll(".accordion-item");
  accordionItems.forEach((item) => {
    const header = item.querySelector(".accordion-header");
    header.addEventListener("click", () => {
      // Close other items
      accordionItems.forEach((otherItem) => {
        if (otherItem !== item && otherItem.classList.contains("active")) {
          otherItem.classList.remove("active");
        }
      });
      // Toggle current item
      item.classList.toggle("active");
    });
  });

  // --- Deep-linking within Help Tab ---
  function handleHelpAnchor(hash) {
    if (hash && hash.startsWith("#help=")) {
      const subAnchor = hash.split("=")[1];
      if (subAnchor) {
        const targetItem = document.getElementById(`help-${subAnchor}`);
        if (targetItem) {
          // Ensure the help tab is shown first
          showTab("help");
          // Open the specific accordion item
          setTimeout(() => targetItem.classList.add("active"), 100);
        }
      }
    }
  }

  // --- Changelog Fetching Logic ---
  async function fetchAndDisplayChangelog() {
    const changelogUrl =
      "https://raw.githubusercontent.com/iSegaro/Translate-It/main/Changelog.md"; // Example URL
    const container = document.getElementById("changelog-container");
    try {
      const response = await fetch(changelogUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const markdownText = await response.text();
      // eslint-disable-next-line no-unsanitized/property
      container.innerHTML = marked.parse(markdownText);
    } catch (error) {
      // eslint-disable-next-line no-unsanitized/property
      container.innerHTML = `<p>Could not load changelog. Error: ${error.message}</p>`;
      logME("Failed to fetch changelog:", error);
    }
  }

  // Add listener to fetch changelog when about tab is clicked
  const aboutTabButton = document.querySelector('a[data-tab="about"]');
  if (aboutTabButton) {
    aboutTabButton.addEventListener("click", fetchAndDisplayChangelog, {
      once: true,
    }); // Fetch only once
  }

  // --- Dependency Logic ---
  function handleTextSelectionDependency() {
    if (
      !translateOnTextSelectionCheckbox ||
      !requireCtrlForTextSelectionCheckbox ||
      !textSelectionCtrlGroup ||
      !selectionModeImmediateRadio ||
      !selectionModeOnClickRadio ||
      !selectionModeGroup
    )
      return;

    const isTextSelectionEnabled =
      translateOnTextSelectionCheckbox.checked &&
      !translateOnTextSelectionCheckbox.disabled;
    const isImmediateModeEnabled = selectionModeImmediateRadio.checked;

    selectionModeGroup.style.opacity = isTextSelectionEnabled ? "1" : "0.6";
    selectionModeGroup.style.pointerEvents =
      isTextSelectionEnabled ? "auto" : "none";
    selectionModeImmediateRadio.disabled = !isTextSelectionEnabled;
    selectionModeOnClickRadio.disabled = !isTextSelectionEnabled;

    const isCtrlGroupEnabled = isTextSelectionEnabled && isImmediateModeEnabled;
    requireCtrlForTextSelectionCheckbox.disabled = !isCtrlGroupEnabled;
    textSelectionCtrlGroup.style.opacity = isCtrlGroupEnabled ? "1" : "0.6";
    textSelectionCtrlGroup.style.pointerEvents =
      isCtrlGroupEnabled ? "auto" : "none";
  }

  [
    selectionModeImmediateRadio,
    selectionModeOnClickRadio,
    translateOnTextSelectionCheckbox,
  ].forEach((el) => {
    if (el) el.addEventListener("change", handleTextSelectionDependency);
  });

  function updateOverallExtensionDependency() {
    if (!extensionEnabledCheckbox) return;
    const isEnabled = extensionEnabledCheckbox.checked;
    const dependentControls = [
      translateOnTextFieldsCheckbox,
      enableShortcutForTextFieldsCheckbox,
      translateWithSelectElementCheckbox,
      translateOnTextSelectionCheckbox,
      enableDictionraryCheckbox,
    ];
    dependentControls.forEach((el) => {
      if (el) {
        el.disabled = !isEnabled;
        el.closest(".setting-group")?.classList.toggle("disabled", !isEnabled);
      }
    });
    handleTextSelectionDependency();
  }

  if (extensionEnabledCheckbox) {
    extensionEnabledCheckbox.addEventListener(
      "change",
      updateOverallExtensionDependency
    );
  }

  // --- Tab Navigation Logic ---
  function showTab(tabId) {
    if (!tabId) return;
    const activeContent = tabContentContainer.querySelector(
      ".tab-content.active"
    );
    const targetContent = document.getElementById(tabId);

    if (activeContent === targetContent) return;

    if (window.history.replaceState) {
      window.history.replaceState(null, null, `#${tabId}`);
    }

    tabButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tabId);
    });

    const animate = () => {
      if (targetContent) {
        targetContent.classList.add("active");
      }
    };

    if (activeContent) {
      fadeOutInElement(
        activeContent,
        () => {
          activeContent.classList.remove("active");
          animate();
        },
        150
      );
    } else {
      animate();
    }
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const tabId = event.currentTarget.getAttribute("data-tab");
      showTab(tabId);
    });
  });

  // --- API Settings Visibility Logic ---
  function toggleApiSettings() {
    if (!translationApiSelect) return;
    const selectedApi = translationApiSelect.value;
    const isMock = useMockCheckbox ? useMockCheckbox.checked : false;

    const apiSections = {
      webai: webAIApiSettings,
      gemini: geminiApiSettings,
      openai: openAIApiSettings,
      openrouter: openRouterApiSettings,
      deepseek: deepseekApiSettings,
      custom: customApiSettings,
    };

    if (isMock) {
      Object.values(apiSections).forEach((section) => {
        if (section) section.style.display = "none";
      });
      if (apiUrlSettingGroup) apiUrlSettingGroup.style.display = "none";
      return;
    }

    Object.entries(apiSections).forEach(([key, section]) => {
      if (section) {
        section.style.display = selectedApi === key ? "block" : "none";
      }
    });

    if (apiUrlSettingGroup) {
      apiUrlSettingGroup.style.display =
        selectedApi === "gemini" ? "block" : "none";
    }
  }

  if (translationApiSelect) {
    translationApiSelect.addEventListener("change", toggleApiSettings);
  }
  if (useMockCheckbox) {
    useMockCheckbox.addEventListener("change", toggleApiSettings);
  }

  // --- Save & Load Settings ---
  saveSettingsButton.addEventListener("click", async () => {
    let finalThemeValue;
    if (themeAuto?.checked) {
      finalThemeValue = "auto";
    } else {
      finalThemeValue = themeSwitch?.checked ? "dark" : "light";
    }

    const settingsToSave = {
      API_KEY: apiKeyInput?.value?.trim() || "",
      USE_MOCK: useMockCheckbox?.checked ?? CONFIG.USE_MOCK,
      DEBUG_MODE: debugModeCheckbox?.checked ?? CONFIG.DEBUG_MODE,
      EXTENSION_ENABLED:
        extensionEnabledCheckbox?.checked ?? CONFIG.EXTENSION_ENABLED,
      THEME: finalThemeValue,
      API_URL: apiUrlInput?.value?.trim() || CONFIG.API_URL,
      SOURCE_LANGUAGE: sourceLanguageInput?.value || CONFIG.SOURCE_LANGUAGE,
      TARGET_LANGUAGE: targetLanguageInput?.value || CONFIG.TARGET_LANGUAGE,
      PROMPT_TEMPLATE:
        promptTemplateInput?.value?.trim() || CONFIG.PROMPT_TEMPLATE,
      TRANSLATION_API: translationApiSelect?.value || CONFIG.TRANSLATION_API,
      WEBAI_API_URL: webAIApiUrlInput?.value?.trim() || CONFIG.WEBAI_API_URL,
      WEBAI_API_MODEL:
        webAIApiModelInput?.value?.trim() || CONFIG.WEBAI_API_MODEL,
      OPENAI_API_KEY: openAIApiKeyInput?.value?.trim() || CONFIG.OPENAI_API_KEY,
      OPENAI_API_MODEL:
        openAIModelInput?.value?.trim() || CONFIG.OPENAI_API_MODEL,
      OPENROUTER_API_KEY:
        openRouterApiKeyInput?.value?.trim() || CONFIG.OPENROUTER_API_KEY,
      OPENROUTER_API_MODEL:
        openRouterApiModelInput?.value?.trim() || CONFIG.OPENROUTER_API_MODEL,
      DEEPSEEK_API_KEY:
        deepseekApiKeyInput?.value?.trim() || CONFIG.DEEPSEEK_API_KEY,
      DEEPSEEK_API_MODEL:
        deepseekApiModelInput?.value?.trim() || CONFIG.DEEPSEEK_API_MODEL,
      CUSTOM_API_URL: customApiUrlInput?.value?.trim() || CONFIG.CUSTOM_API_URL,
      CUSTOM_API_KEY: customApiKeyInput?.value?.trim() || CONFIG.CUSTOM_API_KEY,
      CUSTOM_API_MODEL:
        customApiModelInput?.value?.trim() || CONFIG.CUSTOM_API_MODEL,
      TRANSLATE_ON_TEXT_FIELDS:
        translateOnTextFieldsCheckbox?.checked ??
        CONFIG.TRANSLATE_ON_TEXT_FIELDS,
      ENABLE_DICTIONARY:
        enableDictionraryCheckbox?.checked ?? CONFIG.ENABLE_DICTIONARY,
      ENABLE_SHORTCUT_FOR_TEXT_FIELDS:
        enableShortcutForTextFieldsCheckbox?.checked ??
        CONFIG.ENABLE_SHORTCUT_FOR_TEXT_FIELDS,
      TRANSLATE_WITH_SELECT_ELEMENT:
        translateWithSelectElementCheckbox?.checked ??
        CONFIG.TRANSLATE_WITH_SELECT_ELEMENT,
      TRANSLATE_ON_TEXT_SELECTION:
        translateOnTextSelectionCheckbox?.checked ??
        CONFIG.TRANSLATE_ON_TEXT_SELECTION,
      REQUIRE_CTRL_FOR_TEXT_SELECTION:
        requireCtrlForTextSelectionCheckbox?.checked ??
        CONFIG.REQUIRE_CTRL_FOR_TEXT_SELECTION,
      EXCLUDED_SITES:
        excludedSites?.value
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean) ?? [],
      selectionTranslationMode:
        selectionModeOnClickRadio?.checked ? "onClick" : "immediate",
    };

    try {
      await Browser.storage.local.set(settingsToSave);
      logME("Settings saved:", settingsToSave);
      await updatePromptHelpText(settingsToSave);
      showStatus(
        await getTranslationString("OPTIONS_STATUS_SAVED_SUCCESS"),
        "success"
      );
      setTimeout(() => showStatus(""), 2000);
    } catch (error) {
      errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "saveSettings",
      });
      showStatus(
        await getTranslationString("OPTIONS_STATUS_SAVED_FAILED"),
        "error"
      );
      setTimeout(() => showStatus(""), 3000);
    }
  });

  async function updatePromptHelpText(currentSettings) {
    const settings = currentSettings || (await getSettingsAsync());
    const sourceLang = settings.SOURCE_LANGUAGE || CONFIG.SOURCE_LANGUAGE;
    const targetLang = settings.TARGET_LANGUAGE || CONFIG.TARGET_LANGUAGE;
    if (sourceLangNameSpan) sourceLangNameSpan.textContent = `(${sourceLang})`;
    if (targetLangNameSpan) targetLangNameSpan.textContent = `(${targetLang})`;
  }

  // =================================================================
  // START: CORRECTED loadSettings FUNCTION
  // =================================================================
  async function loadSettings() {
    try {
      const settings = await getSettingsAsync();
      const manifest = Browser.runtime.getManifest();

      // Populate manifest info
      if (manifest_Name)
        manifest_Name.textContent = CONFIG.APP_NAME || manifest.name;
      if (manifest_Version)
        manifest_Version.textContent = `v${manifest.version}`;

      // Populate checkboxes
      if (debugModeCheckbox)
        debugModeCheckbox.checked = settings.DEBUG_MODE ?? CONFIG.DEBUG_MODE;
      if (useMockCheckbox)
        useMockCheckbox.checked = settings.USE_MOCK ?? CONFIG.USE_MOCK;
      if (extensionEnabledCheckbox)
        extensionEnabledCheckbox.checked =
          settings.EXTENSION_ENABLED ?? CONFIG.EXTENSION_ENABLED;
      if (translateOnTextFieldsCheckbox)
        translateOnTextFieldsCheckbox.checked =
          settings.TRANSLATE_ON_TEXT_FIELDS ?? CONFIG.TRANSLATE_ON_TEXT_FIELDS;
      if (enableShortcutForTextFieldsCheckbox)
        enableShortcutForTextFieldsCheckbox.checked =
          settings.ENABLE_SHORTCUT_FOR_TEXT_FIELDS ??
          CONFIG.ENABLE_SHORTCUT_FOR_TEXT_FIELDS;
      if (translateWithSelectElementCheckbox)
        translateWithSelectElementCheckbox.checked =
          settings.TRANSLATE_WITH_SELECT_ELEMENT ??
          CONFIG.TRANSLATE_WITH_SELECT_ELEMENT;
      if (translateOnTextSelectionCheckbox)
        translateOnTextSelectionCheckbox.checked =
          settings.TRANSLATE_ON_TEXT_SELECTION ??
          CONFIG.TRANSLATE_ON_TEXT_SELECTION;
      if (requireCtrlForTextSelectionCheckbox)
        requireCtrlForTextSelectionCheckbox.checked =
          settings.REQUIRE_CTRL_FOR_TEXT_SELECTION ??
          CONFIG.REQUIRE_CTRL_FOR_TEXT_SELECTION;
      if (enableDictionraryCheckbox)
        enableDictionraryCheckbox.checked =
          settings.ENABLE_DICTIONARY ?? CONFIG.ENABLE_DICTIONARY;

      // Populate text inputs and textareas
      if (sourceLanguageInput)
        sourceLanguageInput.value =
          settings.SOURCE_LANGUAGE || CONFIG.SOURCE_LANGUAGE;
      if (targetLanguageInput)
        targetLanguageInput.value =
          settings.TARGET_LANGUAGE || CONFIG.TARGET_LANGUAGE;
      if (promptTemplateInput)
        promptTemplateInput.value =
          settings.PROMPT_TEMPLATE || CONFIG.PROMPT_TEMPLATE;
      if (apiKeyInput) apiKeyInput.value = settings.API_KEY || "";
      if (apiUrlInput) apiUrlInput.value = settings.API_URL || CONFIG.API_URL;
      if (webAIApiUrlInput)
        webAIApiUrlInput.value = settings.WEBAI_API_URL || CONFIG.WEBAI_API_URL;
      if (webAIApiModelInput)
        webAIApiModelInput.value =
          settings.WEBAI_API_MODEL || CONFIG.WEBAI_API_MODEL;
      if (openAIApiKeyInput)
        openAIApiKeyInput.value =
          settings.OPENAI_API_KEY || CONFIG.OPENAI_API_KEY;
      if (openAIModelInput)
        openAIModelInput.value =
          settings.OPENAI_API_MODEL || CONFIG.OPENAI_API_MODEL;
      if (openRouterApiKeyInput)
        openRouterApiKeyInput.value =
          settings.OPENROUTER_API_KEY || CONFIG.OPENROUTER_API_KEY;
      if (openRouterApiModelInput)
        openRouterApiModelInput.value =
          settings.OPENROUTER_API_MODEL || CONFIG.OPENROUTER_API_MODEL;
      if (deepseekApiKeyInput)
        deepseekApiKeyInput.value =
          settings.DEEPSEEK_API_KEY || CONFIG.DEEPSEEK_API_KEY;
      if (deepseekApiModelInput)
        deepseekApiModelInput.value =
          settings.DEEPSEEK_API_MODEL || CONFIG.DEEPSEEK_API_MODEL;
      if (customApiUrlInput)
        customApiUrlInput.value =
          settings.CUSTOM_API_URL || CONFIG.CUSTOM_API_URL;
      if (customApiKeyInput)
        customApiKeyInput.value =
          settings.CUSTOM_API_KEY || CONFIG.CUSTOM_API_KEY;
      if (customApiModelInput)
        customApiModelInput.value =
          settings.CUSTOM_API_MODEL || CONFIG.CUSTOM_API_MODEL;
      if (excludedSites)
        excludedSites.value = (settings.EXCLUDED_SITES || []).join(", ");

      // Populate select/dropdown
      if (translationApiSelect)
        translationApiSelect.value =
          settings.TRANSLATION_API || CONFIG.TRANSLATION_API;

      // Populate radio buttons
      if (selectionModeImmediateRadio && selectionModeOnClickRadio) {
        if (settings.selectionTranslationMode === "onClick") {
          selectionModeOnClickRadio.checked = true;
        } else {
          selectionModeImmediateRadio.checked = true; // Default
        }
      }

      // --- Trigger UI updates that depend on the loaded settings ---
      toggleApiSettings();
      handleTextSelectionDependency();
      updateOverallExtensionDependency();
      await updatePromptHelpText(settings);

      // Localize the page
      const currentAppLocalize =
        settings.APPLICATION_LOCALIZE || CONFIG.APPLICATION_LOCALIZE;
      if (typeof app_localize === "function") {
        app_localize(currentAppLocalize);
      }

      // --- START: GENERALIZED HASH HANDLING LOGIC ---
      
      const hash = window.location.hash;
      let targetTabId = "languages"; // Default tab

      if (hash) {
        // Extract the base tab ID from any hash format (e.g., #about, #help=shortcut)
        targetTabId = hash.substring(1).split("=")[0];
      }

      // Validate if a tab with this ID actually exists
      const tabElement = document.getElementById(targetTabId);
      if (!tabElement) {
        targetTabId = "languages"; // Fallback to default if hash is invalid
      }

      // 1. ALWAYS show the target tab. This is the main generic action.
      showTab(targetTabId);

      // 2. Perform any ADDITIONAL, tab-specific actions AFTER showing it.
      switch (targetTabId) {
        case "about":
          fetchAndDisplayChangelog();
          break;
        case "help":
          // The handleHelpAnchor function is designed for deep-linking
          if (hash.startsWith("#help=")) {
            handleHelpAnchor(hash);
          }
          break;
        // Add other cases here if new tabs need special logic on load
      }
      // --- END: GENERALIZED HASH HANDLING LOGIC ---
    } catch (error) {
      errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "loadSettings",
      });
      showStatus(
        (await getTranslationString("OPTIONS_STATUS_LOAD_FAILED")) ||
          "Failed to load settings.",
        "error"
      );
    }
  }
  // =================================================================
  // END: CORRECTED loadSettings FUNCTION
  // =================================================================

  function showStatus(message, type = "info") {
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.className = `status-${type}`;
    }
  }

  // --- Import/Export Logic ---
  exportSettingsButton.addEventListener("click", async () => {
    try {
      const settings = await getSettingsAsync();
      const blob = new Blob([JSON.stringify(settings, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${CONFIG.APP_NAME}_Settings.json`;
      a.click();
      URL.revokeObjectURL(url);
      showStatus(
        await getTranslationString("OPTIONS_STATUS_EXPORT_SUCCESS"),
        "success"
      );
      setTimeout(() => showStatus(""), 2000);
    } catch (error) {
      errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "exportSettings",
      });
      showStatus(
        await getTranslationString("OPTIONS_STATUS_EXPORT_FAILED"),
        "error"
      );
      setTimeout(() => showStatus(""), 3000);
    }
  });

  importFile.addEventListener("change", async (event) => {
    try {
      const file = event.target.files[0];
      if (!file) return;
      const importedSettings = JSON.parse(await file.text());
      await Browser.storage.local.set(importedSettings);
      showStatus(
        await getTranslationString("OPTIONS_STATUS_IMPORT_SUCCESS_RELOADING"),
        "success"
      );
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "importSettings",
      });
      showStatus(
        await getTranslationString("OPTIONS_STATUS_IMPORT_FAILED"),
        "error"
      );
      if (importFile) importFile.value = "";
      setTimeout(() => showStatus(""), 3000);
    }
  });

  // Initial call to load all settings and set up the page
  await loadSettings();
});
