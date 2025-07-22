// src/sidepanel/historyManager.js
import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { correctTextDirection } from "../utils/textDetection.js";
import { SimpleMarkdown } from "../utils/simpleMarkdown.js";
import { getTranslationString } from "../utils/i18n.js";
import { getSettingsAsync } from "../config.js";

const MAX_HISTORY_ITEMS = 100;

export class HistoryManager {
  constructor(options) {
    this.historyBtn = options.historyBtn;
    this.historyPanel = options.historyPanel;
    this.historyList = options.historyList;
    this.closeBtn = options.closeBtn;
    this.clearAllBtn = options.clearAllBtn; // اضافه شد
    this.onSelectCallback = options.onSelect;

    this.init();
  }

  async init() {
    // Load existing history
    await this.loadHistory();

    // Setup event listeners
    this.historyBtn.addEventListener("click", () => this.togglePanel());
    this.closeBtn.addEventListener("click", () => this.closePanel());

    if (this.clearAllBtn) {
      this.clearAllBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.clearAllHistory();
      });
    } else {
      logME("[HistoryManager] Clear all button not found!");
    }

    // Listen for storage changes
    Browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes.translationHistory) {
        if (this.historyPanel.style.display === "flex") {
          this.renderHistory(changes.translationHistory.newValue || []);
        }
      }
    });
  }

  togglePanel() {
    const isVisible = this.historyPanel.style.display === "flex";
    if (isVisible) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  openPanel() {
    this.historyPanel.style.display = "flex";
    this.loadHistory();
  }

  closePanel() {
    this.historyPanel.style.display = "none";
  }

  async loadHistory() {
    try {
      const settings = await getSettingsAsync();
      const translationHistory = settings.translationHistory || [];
      logME(
        "[HistoryManager] Loaded history items:",
        translationHistory.length
      );
      this.renderHistory(translationHistory);
    } catch (error) {
      logME("[HistoryManager] Error loading history:", error);
    }
  }

  renderHistory(history) {
    // Safe way to clear content
    while (this.historyList.firstChild) {
      this.historyList.removeChild(this.historyList.firstChild);
    }

    if (!history || history.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "empty-history";
      emptyDiv.textContent = "No translations yet";
      this.historyList.appendChild(emptyDiv);
      return;
    }

    // نمایش آیتم‌ها به صورت معکوس (جدیدترین در بالا)
    history
      .slice()
      .reverse()
      .forEach((item, index) => {
        const actualIndex = history.length - index - 1;
        const historyItem = this.createHistoryItem(item, actualIndex);
        this.historyList.appendChild(historyItem);
      });
  }

  /**
   * Create delete button with icon safely
   */
  createDeleteButton(index) {
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-item-btn";
    deleteBtn.title = "X";

    // Create img element safely
    const deleteIcon = document.createElement("img");
    deleteIcon.src = Browser.runtime.getURL("icons/trash-small.svg");
    deleteIcon.alt = "Delete";
    deleteIcon.className = "delete-item-icon";

    deleteBtn.appendChild(deleteIcon);

    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // جلوگیری از trigger شدن click روی آیتم
      this.deleteHistoryItem(index);
    });

    return deleteBtn;
  }

  /**
   * Safely render markdown content using DOM manipulation
   */
  createMarkdownContent(text) {
    const container = document.createElement("div");

    if (!text) {
      return container;
    }

    try {
      // Use SimpleMarkdown for secure rendering
      const markdownElement = SimpleMarkdown.render(text);
      if (markdownElement) {
        container.appendChild(markdownElement);
      } else {
        container.textContent = text;
      }
    } catch (error) {
      logME("[HistoryManager] Error parsing markdown:", error);
      // Fallback to plain text
      container.textContent = text;
    }

    return container;
  }

  createHistoryItem(item, index) {
    const div = document.createElement("div");
    div.className = "history-item";
    div.dataset.index = index;

    // دکمه حذف - امن
    const deleteBtn = this.createDeleteButton(index);

    // Source text
    const sourceDiv = document.createElement("div");
    sourceDiv.className = "history-item-source";
    sourceDiv.textContent = item.sourceText || "";
    correctTextDirection(sourceDiv, item.sourceText || "");

    // Target text با پشتیبانی امن از Markdown
    const targetDiv = document.createElement("div");
    targetDiv.className = "history-item-target";

    const markdownContent = this.createMarkdownContent(
      item.translatedText || ""
    );
    targetDiv.appendChild(markdownContent);

    correctTextDirection(targetDiv, item.translatedText || "");

    const timeDiv = document.createElement("div");
    timeDiv.className = "history-item-time";
    timeDiv.textContent = this.formatTime(item.timestamp);

    div.appendChild(deleteBtn);
    div.appendChild(sourceDiv);
    div.appendChild(targetDiv);
    div.appendChild(timeDiv);

    div.addEventListener("click", () => {
      if (this.onSelectCallback) {
        this.onSelectCallback(item);
        this.closePanel();
      }
    });

    return div;
  }

  formatTime(timestamp) {
    if (!timestamp) return "";

    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

    return date.toLocaleDateString();
  }

  async deleteHistoryItem(index) {
    try {
      const settings = await getSettingsAsync();
      const translationHistory = settings.translationHistory || [];

      if (index >= 0 && index < translationHistory.length) {
        translationHistory.splice(index, 1);
        await Browser.storage.local.set({ translationHistory });
        logME("[HistoryManager] Deleted history item at index:", index);
      }
    } catch (error) {
      logME("[HistoryManager] Error deleting history item:", error);
    }
  }

  async clearAllHistory() {
    try {
      const confirmMessage =
        (await getTranslationString("CONFIRM_CLEAR_ALL_HISTORY")) ||
        "Are you sure you want to clear all translation history?";

      const userConfirmed = window.confirm(confirmMessage);

      if (userConfirmed) {
        await Browser.storage.local.set({ translationHistory: [] });
        logME("[HistoryManager] Cleared all history");
        this.renderHistory([]);

        // نمایش پیام موفقیت (اختیاری)
        // this.showMessage("History cleared successfully");
      }
    } catch (error) {
      logME("[HistoryManager] Error clearing history:", error);
    }
  }

  async addToHistory(translationData) {
    try {
      const settings = await getSettingsAsync();
      const translationHistory = settings.translationHistory || [];

      translationHistory.push({
        ...translationData,
        timestamp: Date.now(),
      });

      if (translationHistory.length > MAX_HISTORY_ITEMS) {
        translationHistory.splice(
          0,
          translationHistory.length - MAX_HISTORY_ITEMS
        );
      }

      await Browser.storage.local.set({ translationHistory });
      logME("[HistoryManager] Added to history:", translationData.sourceText);
    } catch (error) {
      logME("[HistoryManager] Error adding to history:", error);
    }
  }
}
