// src/composables/useHistory.js
// Vue composable for translation history management in sidepanel with improved API handling
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useSettingsStore } from "@/features/settings/stores/settings.js";
import { SimpleMarkdown } from "@/shared/utils/text/markdown.js";
import { utilsFactory } from "@/utils/UtilsFactory.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';

// Lazy logger initialization to avoid TDZ issues
let logger = null;
function getLogger() {
  if (!logger) {
    try {
      logger = getScopedLogger(LOG_COMPONENTS.HISTORY, 'useHistory');
      // Ensure logger is not null
      if (!logger) {
        logger = {
          debug: () => {},
          warn: () => {},
          error: () => {},
          info: () => {},
          init: () => {}
        };
      }
    } catch {
      // Fallback to noop logger
      logger = {
        debug: () => {},
        warn: () => {},
        error: () => {},
        info: () => {},
        init: () => {}
      };
    }
  }
  return logger;
}

const MAX_HISTORY_ITEMS = 100;

// Shared global state to keep all instances in sync
const globalHistoryItems = ref([]);
const globalIsLoading = ref(false);
const globalIsInitialized = ref(false);

export function useHistory() {
  // Local instance state (pointing to global)
  const historyItems = globalHistoryItems;
  const isLoading = globalIsLoading;
  const historyError = ref("");
  const isHistoryPanelOpen = ref(false);

  // Composables
  const settingsStore = useSettingsStore();

  // Computed
  const hasHistory = computed(() => historyItems.value.length > 0);
  const sortedHistoryItems = computed(() => {
    return [...historyItems.value];
  });

  // Load history from storage using StorageCore
  const loadHistory = async (force = false) => {
    if (globalIsInitialized.value && !force) return;
    
    isLoading.value = true;
    try {
      const result = await storageManager.get({ translationHistory: [] });
      const loadedHistory = Array.isArray(result.translationHistory) ? result.translationHistory : [];
      
      historyItems.value = loadedHistory;
      globalIsInitialized.value = true;
      
      getLogger().info(`Loaded ${historyItems.value.length} history items from storage`);
    } catch (error) {
      getLogger().error("Error loading history", error);
      historyError.value = "Failed to load history";
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

      // Save using StorageCore for consistency
      await storageManager.set({
        translationHistory: newHistory,
      });

      getLogger().info("Added to history:", translationData.sourceText, "Translated:", translationData.translatedText);
    } catch (error) {
      getLogger().error("Error adding to history", error);
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

        // Save using StorageCore for consistency
        await storageManager.set({
          translationHistory: newHistory,
        });

        getLogger().info("Deleted history item at index:", index);
      }
    } catch (error) {
      getLogger().error("Error deleting history item", error);
      historyError.value = "Failed to delete history item";
    }
  };

  // Clear all history
  const clearAllHistory = async () => {
    try {
      const { getTranslationString } = await utilsFactory.getI18nUtils();
      const confirmMessage =
        (await getTranslationString("CONFIRM_CLEAR_ALL_HISTORY")) ||
        "Are you sure you want to clear all translation history?";

      const userConfirmed = typeof window !== 'undefined' && window.confirm(confirmMessage);

      if (userConfirmed) {
        historyItems.value = [];

        // Save using StorageCore for consistency
        await storageManager.set({
          translationHistory: [],
        });

        getLogger().info("Cleared all history");
        return true;
      }
      return false;
    } catch (error) {
      getLogger().error("Error clearing history", error);
      historyError.value = "Failed to clear history";
      return false;
    }
  };

  // Export history based on format
  const exportHistory = (format) => {
    try {
      const items = historyItems.value;
      if (!items || items.length === 0) {
        getLogger().warn("No history items to export");
        return;
      }

      let content = "";
      let mimeType = "text/plain";
      let extension = "txt";

      if (format === "json_clean") {
        const cleanItems = items.map(item => ({
          ...item,
          sourceText: SimpleMarkdown.strip(item.sourceText),
          translatedText: SimpleMarkdown.strip(item.translatedText)
        }));
        content = JSON.stringify(cleanItems, null, 2);
        mimeType = "application/json";
        extension = "json";
      } else if (format === "json_raw") {
        content = JSON.stringify(items, null, 2);
        mimeType = "application/json";
        extension = "json";
      } else if (format === "csv") {
        const headers = ["Source Text", "Translated Text", "Source Language", "Target Language", "Timestamp"];
        const rows = items.map((item) => {
          const date = new Date(item.timestamp).toISOString();
          // Escape quotes and commas
          const escapeCsv = (str) => `"${String(str || "").replace(/"/g, '""')}"`;
          return [
            escapeCsv(SimpleMarkdown.strip(item.sourceText)),
            escapeCsv(SimpleMarkdown.strip(item.translatedText)),
            escapeCsv(item.sourceLanguage),
            escapeCsv(item.targetLanguage),
            escapeCsv(date),
          ].join(",");
        });
        content = [headers.join(","), ...rows].join("\n");
        mimeType = "text/csv";
        extension = "csv";
      } else if (format === "anki") {
        // Anki TSV format: Source \t Translated
        const rows = items.map((item) => {
          const cleanSource = SimpleMarkdown.strip(item.sourceText);
          const cleanTranslated = SimpleMarkdown.strip(item.translatedText);
          const escapeTsv = (str) => String(str || "").replace(/\n/g, "<br>").replace(/\t/g, " ");
          return `${escapeTsv(cleanSource)}\t${escapeTsv(cleanTranslated)}`;
        });
        content = rows.join("\n");
        mimeType = "text/tab-separated-values";
        extension = "txt";
      } else {
        getLogger().warn("Unknown export format:", format);
        return;
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `translation_history_${new Date().toISOString().split("T")[0]}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      getLogger().info(`Exported history as ${format}`);
    } catch (error) {
      getLogger().error("Error exporting history", error);
      historyError.value = "Failed to export history";
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
      const element = SimpleMarkdown.render(text);
      return element ? element.innerHTML : null;
    } catch (error) {
      getLogger().error("Error parsing markdown", error);
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
    getLogger().info("History panel opened");
  };

  const closeHistoryPanel = () => {
    isHistoryPanelOpen.value = false;
    getLogger().info("History panel closed");
  };

  // Watch for changes in settingsStore.settings.translationHistory
  watch(
    () => settingsStore.settings.translationHistory,
    (newHistory) => {
      // Only update if we have a valid array and it's different from current
      if (Array.isArray(newHistory) && newHistory.length > 0) {
        historyItems.value = newHistory;
        globalIsInitialized.value = true;
      }
    },
    { deep: true },
  );

  // Storage change listener for real-time updates
  const storageListener = (data) => {
    if (data.key === 'translationHistory') {
      const newHistory = data.newValue;
      if (Array.isArray(newHistory)) {
        historyItems.value = newHistory;
        globalIsInitialized.value = true;
        getLogger().debug("Global history updated from storage change listener");
      }
    }
  };

  // Lifecycle
  onMounted(() => {
    loadHistory();

    // Listen for storage changes for real-time updates through StorageCore
    storageManager.on('change', storageListener);
  });

  onUnmounted(() => {
    // Remove storage listener
    storageManager.off('change', storageListener);
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
    exportHistory,
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
