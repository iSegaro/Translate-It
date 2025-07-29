// src/composables/useSidepanelIntegration.js
// Vue composable that integrates all sidepanel functionality with the old DOM-based approach

import { ref, onMounted, nextTick } from "vue";
import { useBrowserAPI } from "./useBrowserAPI.js";
import { useTranslation } from "./useTranslation.js";
import { useHistory } from "./useHistory.js";
import { useApiProvider } from "./useApiProvider.js";
import { useTTSManager } from "./useTTSManager.js";
import { useClipboard } from "./useClipboard.js";
import { languageList } from "@/utils/languages.js";
import { correctTextDirection } from "@/utils/textDetection.js";
import { AUTO_DETECT_VALUE } from "@/constants.js";

// Simple inline toolbar visibility toggle function
const toggleInlineToolbarVisibility = (container) => {
  if (!container) return;

  const toolbar = container.querySelector(".inline-toolbar");
  if (!toolbar) return;

  const textElement = container.querySelector("textarea, .translation-result");
  const hasContent =
    textElement && textElement.value && textElement.value.trim().length > 0;

  toolbar.style.display = hasContent ? "flex" : "none";
};

export function useSidepanelIntegration() {
  // State
  const isInitialized = ref(false);
  const integrationError = ref("");

  // Composables
  const browserAPI = useBrowserAPI();
  const translation = useTranslation();
  const history = useHistory();
  const apiProvider = useApiProvider();
  const tts = useTTSManager();
  const clipboard = useClipboard();

  // DOM element references (to maintain compatibility)
  const elements = ref({
    sourceLanguageInput: null,
    targetLanguageInput: null,
    swapLanguagesBtn: null,
    sourceText: null,
    translationResult: null,
    translateBtn: null,
    selectElementBtn: null,
    revertActionBtn: null,
    clearFieldsBtn: null,
    settingsBtn: null,
    translationForm: null,
    copySourceBtn: null,
    pasteSourceBtn: null,
    voiceSourceIcon: null,
    copyTargetBtn: null,
    voiceTargetIcon: null,
    apiProviderBtn: null,
    apiProviderIcon: null,
    apiProviderDropdown: null,
    historyBtn: null,
    historyPanel: null,
    historyList: null,
    closeHistoryBtn: null,
    clearAllHistoryBtn: null,
  });

  // Initialize DOM elements
  const initializeElements = () => {
    const elementIds = Object.keys(elements.value);

    elementIds.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        elements.value[id] = element;
        console.log(`[useSidepanelIntegration] Found element: ${id}`);
      } else {
        console.warn(`[useSidepanelIntegration] Element not found: ${id}`);
      }
    });
  };

  // Initialize language dropdowns
  const initializeLanguages = async () => {
    try {
      const sourceSelect = elements.value.sourceLanguageInput;
      const targetSelect = elements.value.targetLanguageInput;

      if (sourceSelect && targetSelect) {
        // Clear existing options
        sourceSelect.textContent = "";
        targetSelect.textContent = "";

        // Add Auto-Detect option to source
        const autoOption = document.createElement("option");
        autoOption.value = AUTO_DETECT_VALUE;
        autoOption.textContent = "Auto-Detect";
        sourceSelect.appendChild(autoOption);

        // Populate language options
        languageList.forEach((lang) => {
          const displayName = lang.promptName || lang.name;

          // Add to source list
          const sourceOption = document.createElement("option");
          sourceOption.value = displayName;
          sourceOption.textContent = displayName;
          sourceSelect.appendChild(sourceOption);

          // Add to target list (except Auto-Detect)
          if (lang.code !== AUTO_DETECT_VALUE) {
            const targetOption = document.createElement("option");
            targetOption.value = displayName;
            targetOption.textContent = displayName;
            targetSelect.appendChild(targetOption);
          }
        });

        // Set initial values
        sourceSelect.value = AUTO_DETECT_VALUE;
        targetSelect.value = translation.targetLanguage.value || "English";

        console.log("[useSidepanelIntegration] Language dropdowns initialized");
      }
    } catch (error) {
      console.error(
        "[useSidepanelIntegration] Error initializing languages:",
        error,
      );
    }
  };

  // Set up event listeners
  const setupEventListeners = () => {
    // Translation form submission
    if (elements.value.translationForm) {
      elements.value.translationForm.addEventListener(
        "submit",
        async (event) => {
          event.preventDefault();
          await performTranslation();
        },
      );
    }

    // Source text changes
    if (elements.value.sourceText) {
      elements.value.sourceText.addEventListener("input", () => {
        translation.sourceText.value = elements.value.sourceText.value;
        toggleInlineToolbarVisibility(elements.value.sourceText.parentElement);
      });

      // Keyboard shortcuts
      elements.value.sourceText.addEventListener("keydown", (event) => {
        const isModifierPressed = event.ctrlKey || event.metaKey;
        const isEnterKey = event.key === "Enter";
        const isSlashKey = event.key === "/";

        if (isModifierPressed && (isEnterKey || isSlashKey)) {
          event.preventDefault();
          performTranslation();
        }
      });
    }

    // Language selection changes
    if (elements.value.sourceLanguageInput) {
      elements.value.sourceLanguageInput.addEventListener("change", (event) => {
        translation.sourceLanguage.value = event.target.value;
      });
    }

    if (elements.value.targetLanguageInput) {
      elements.value.targetLanguageInput.addEventListener("change", (event) => {
        translation.targetLanguage.value = event.target.value;
      });
    }

    // Swap languages button
    if (elements.value.swapLanguagesBtn) {
      elements.value.swapLanguagesBtn.addEventListener("click", async () => {
        const success = await translation.swapLanguages();
        if (success) {
          // Update DOM selects
          elements.value.sourceLanguageInput.value =
            translation.sourceLanguage.value;
          elements.value.targetLanguageInput.value =
            translation.targetLanguage.value;
          // Update text areas if needed
          elements.value.sourceText.value = translation.sourceText.value;
          updateTranslationResult();
        }
      });
    }

    // Clipboard operations
    if (elements.value.copySourceBtn) {
      elements.value.copySourceBtn.addEventListener("click", () => {
        clipboard.copyText(translation.sourceText.value);
      });
    }

    if (elements.value.copyTargetBtn) {
      elements.value.copyTargetBtn.addEventListener("click", () => {
        const resultElement = elements.value.translationResult;
        const textToCopy =
          resultElement?.dataset?.originalMarkdown ||
          resultElement?.textContent ||
          translation.translatedText.value;
        clipboard.copyText(textToCopy);
      });
    }

    if (elements.value.pasteSourceBtn) {
      elements.value.pasteSourceBtn.addEventListener("click", async () => {
        const text = await clipboard.pasteText();
        if (text) {
          translation.sourceText.value = text;
          elements.value.sourceText.value = text;
          toggleInlineToolbarVisibility(
            elements.value.sourceText.parentElement,
          );
        }
      });
    }

    // TTS operations
    if (elements.value.voiceSourceIcon) {
      elements.value.voiceSourceIcon.addEventListener("click", () => {
        tts.toggle(translation.sourceText.value, {
          lang: translation.sourceLanguage.value,
        });
      });
    }

    if (elements.value.voiceTargetIcon) {
      elements.value.voiceTargetIcon.addEventListener("click", () => {
        tts.toggle(translation.translatedText.value, {
          lang: translation.targetLanguage.value,
        });
      });
    }

    // Clear fields button
    if (elements.value.clearFieldsBtn) {
      elements.value.clearFieldsBtn.addEventListener("click", () => {
        translation.clearAll();
        elements.value.sourceText.value = "";
        elements.value.translationResult.textContent = "";
        elements.value.sourceLanguageInput.value = AUTO_DETECT_VALUE;
        elements.value.targetLanguageInput.value =
          translation.targetLanguage.value;

        // Update toolbar visibility
        toggleInlineToolbarVisibility(elements.value.sourceText.parentElement);
        toggleInlineToolbarVisibility(
          elements.value.translationResult.parentElement,
        );
      });
    }

    // Element selection and other buttons
    if (elements.value.selectElementBtn) {
      elements.value.selectElementBtn.addEventListener("click", async () => {
        try {
          await browserAPI.safeSendMessage({
            action: "activateSelectElementMode",
            data: true,
          });
        } catch (error) {
          console.error(
            "[useSidepanelIntegration] Select element mode failed:",
            error,
          );
        }
      });
    }

    if (elements.value.revertActionBtn) {
      elements.value.revertActionBtn.addEventListener("click", () => {
        browserAPI
          .safeSendMessage({ action: "revertTranslation" })
          .catch((err) =>
            console.warn("[useSidepanelIntegration] Revert failed:", err),
          );
      });
    }

    console.log("[useSidepanelIntegration] Event listeners setup complete");
  };

  // Perform translation and update UI
  const performTranslation = async () => {
    // Sync Vue state with DOM
    translation.sourceText.value = elements.value.sourceText?.value || "";
    translation.sourceLanguage.value =
      elements.value.sourceLanguageInput?.value || AUTO_DETECT_VALUE;
    translation.targetLanguage.value =
      elements.value.targetLanguageInput?.value || "English";

    // Perform translation using Vue composable
    const success = await translation.triggerTranslation(
      elements.value.translationResult,
    );

    if (success) {
      // Update toolbar visibility after translation
      toggleInlineToolbarVisibility(
        elements.value.translationResult.parentElement,
      );
    }
  };

  // Update translation result display
  const updateTranslationResult = () => {
    const resultElement = elements.value.translationResult;
    if (resultElement && translation.translatedText.value) {
      resultElement.textContent = translation.translatedText.value;
      correctTextDirection(resultElement, translation.translatedText.value);
      toggleInlineToolbarVisibility(resultElement.parentElement);
    }
  };

  // Listen for selected text from background
  const setupMessageListener = async () => {
    try {
      const listener = await browserAPI.setupStorageListener((changes) => {
        // Handle any storage changes if needed
      });

      // Listen for runtime messages
      const browser = await browserAPI.ensureReady();
      browser.runtime.onMessage.addListener.call(
        browser.runtime.onMessage,
        (message) => {
          if (message.action === "selectedTextForSidePanel") {
            translation.sourceText.value = message.text;
            if (elements.value.sourceText) {
              elements.value.sourceText.value = message.text;
              toggleInlineToolbarVisibility(
                elements.value.sourceText.parentElement,
              );
            }
            performTranslation();
          }
        },
      );

      console.log("[useSidepanelIntegration] Message listener setup complete");
    } catch (error) {
      console.error(
        "[useSidepanelIntegration] Message listener setup failed:",
        error,
      );
    }
  };

  // Initialize everything
  const initialize = async () => {
    try {
      console.log("[useSidepanelIntegration] Starting initialization...");

      // Wait for browser API to be ready
      await browserAPI.ensureReady();

      // Initialize DOM elements
      await nextTick();
      initializeElements();

      // Initialize languages
      await initializeLanguages();

      // Setup event listeners
      setupEventListeners();

      // Setup message listener
      await setupMessageListener();

      // Load last translation if available
      await translation.loadLastTranslation();
      if (translation.sourceText.value && elements.value.sourceText) {
        elements.value.sourceText.value = translation.sourceText.value;
      }

      isInitialized.value = true;
      console.log("[useSidepanelIntegration] Initialization complete");
    } catch (error) {
      console.error("[useSidepanelIntegration] Initialization failed:", error);
      integrationError.value =
        error.message || "Failed to initialize sidepanel";
    }
  };

  // Auto-initialize on mount
  onMounted(() => {
    initialize();
  });

  return {
    // State
    isInitialized,
    integrationError,
    elements,

    // Composables (exposed for direct access if needed)
    translation,
    history,
    apiProvider,
    tts,
    clipboard,

    // Methods
    initialize,
    performTranslation,
    updateTranslationResult,
  };
}
