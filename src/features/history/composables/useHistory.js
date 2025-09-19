// src/composables/useHistory.js
// Vue composable for translation history management in sidepanel with improved API handling
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useSettingsStore } from "@/features/settings/stores/settings.js";
import { SimpleMarkdown } from "@/shared/utils/text/markdown.js";
import { getTranslationString } from "@/utils/i18n/i18n.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import browser from "webextension-polyfill";

const logger = getScopedLogger(LOG_COMPONENTS.HISTORY, 'useHistory');

const MAX_HISTORY_ITEMS = 100;

export function useHistory() {
  // State
  const historyItems = ref([]);
  const isLoading = ref(false);
  const historyError = ref("");
  const isHistoryPanelOpen = ref(false);

  // Composables

  const settingsStore = useSettingsStore();

  // Computed
  const hasHistory = computed(() => historyItems.value.length > 0);
  const sortedHistoryItems = computed(() => {
    // historyItems is already sorted with newest first, so just return a copy.
    return [...historyItems.value];
  });

  // Load history directly from storage (not from settings store)
  const loadHistory = async () => {
    isLoading.value = true;
    try {
      // Load directly from browser storage to get the latest data
      const result = await browser.storage.local.get(['translationHistory']);
      historyItems.value = result.translationHistory || [];
      logger.info(`Loaded ${historyItems.value.length} history items directly from storage`);
    } catch (error) {
      logger.error("Error loading history", error);
      historyError.value = "Failed to load history";
      historyItems.value = [];
    } finally {
      isLoading.value = false;
    }
  };

  // Add item to history
  const addToHistory = async (translationData) => {
    try {
      const historyItem = {
        sourceText: translationData.sourceText,
        translatedText: translationData.translatedText,
        sourceLanguage: translationData.sourceLanguage,
        targetLanguage: translationData.targetLanguage,
        timestamp: Date.now(),
      };

      // Add to local state
      const newHistory = [historyItem, ...historyItems.value].slice(
        0,
        MAX_HISTORY_ITEMS,
      );
      historyItems.value = newHistory;

      // Save directly to browser storage (same as Translation Engine)
      await browser.storage.local.set({
        translationHistory: newHistory,
      });

      logger.info("Added to history:", translationData.sourceText, "Translated:", translationData.translatedText);
    } catch (error) {
      logger.error("Error adding to history", error);
      historyError.value = "Failed to save to history";
    }
  };

  // Delete specific history item
  const deleteHistoryItem = async (index) => {
    try {
      if (index >= 0 && index < historyItems.value.length) {
        const newHistory = [...historyItems.value];
        newHistory.splice(index, 1);
        historyItems.value = newHistory;

        // Save directly to browser storage
        await browser.storage.local.set({
          translationHistory: newHistory,
        });

        logger.info("Deleted history item at index:", index);
      }
    } catch (error) {
      logger.error("Error deleting history item", error);
      historyError.value = "Failed to delete history item";
    }
  };

  // Clear all history
  const clearAllHistory = async () => {
    try {
      const confirmMessage =
        (await getTranslationString("CONFIRM_CLEAR_ALL_HISTORY")) ||
        "Are you sure you want to clear all translation history?";

      const userConfirmed = typeof window !== 'undefined' && window.confirm(confirmMessage);

      if (userConfirmed) {
        historyItems.value = [];

        // Save directly to browser storage
        await browser.storage.local.set({
          translationHistory: [],
        });

        logger.info("Cleared all history");
        return true;
      }
      return false;
    } catch (error) {
      logger.error("Error clearing history", error);
      historyError.value = "Failed to clear history";
      return false;
    }
  };

  // Format timestamp for display
  const formatTime = (timestamp) => {
    if (!timestamp) return "";

    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

    return date.toLocaleDateString();
  };

  // Create markdown content safely
  const createMarkdownContent = (text) => {
    if (!text) return null;

    try {
      return SimpleMarkdown.render(text);
    } catch (error) {
      logger.error("Error parsing markdown", error);
      return null;
    }
  };

  // Handle history item selection
  const selectHistoryItem = (item, onSelectCallback) => {
    if (onSelectCallback && typeof onSelectCallback === "function") {
      onSelectCallback(item);
    }
  };

  // Set history panel open state externally
  const setHistoryPanelOpen = (value) => {
    isHistoryPanelOpen.value = value;
  };

  // Convenience functions for opening/closing history panel
  const openHistoryPanel = () => {
    isHistoryPanelOpen.value = true;
    logger.info("History panel opened");
  };

  const closeHistoryPanel = () => {
    isHistoryPanelOpen.value = false;
    logger.info("History panel closed");
  };

  // Watch for changes in settingsStore.settings.translationHistory
  watch(
    () => settingsStore.settings.translationHistory,
    (newHistory) => {
      if (newHistory) {
        historyItems.value = newHistory;
        // Only log in development mode to reduce console noise
        if (import.meta.env.DEV) {
          logger.debug("History updated from settings store");
        }
      }
    },
    { deep: true },
  );

  // Storage change listener for real-time updates
  const storageListener = (changes, area) => {
    if (area === 'local' && 'translationHistory' in changes) {
      const newHistory = changes.translationHistory.newValue || [];
      historyItems.value = newHistory;
      logger.debug("History updated from storage change listener");
    }
  };

  // Lifecycle
  onMounted(() => {
    loadHistory();
    
    // Listen for storage changes for real-time updates
    browser.storage.onChanged.addListener(storageListener);
  });

  onUnmounted(() => {
    // Remove storage listener
    browser.storage.onChanged.removeListener(storageListener);
  });

  return {
    // State
    historyItems,
    isLoading,
    historyError,
    isHistoryPanelOpen,

    // Computed
    hasHistory,
    sortedHistoryItems,

    // Methods
    loadHistory,
    addToHistory,
    deleteHistoryItem,
    clearAllHistory,
    selectHistoryItem,

    // Panel Management
    setHistoryPanelOpen,
    openHistoryPanel,
    closeHistoryPanel,

    // Utilities
    formatTime,
    createMarkdownContent,
  };
}
