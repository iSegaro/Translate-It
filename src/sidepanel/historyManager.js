// src/sidepanel/historyManager.js
import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { correctTextDirection } from "../utils/textDetection.js";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { getTranslationString } from "../utils/i18n.js";

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
      console.log("[HistoryManager] Clear all button found, adding listener");
      this.clearAllBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("[HistoryManager] Clear all button clicked");
        this.clearAllHistory();
      });
    } else {
      console.warn("[HistoryManager] Clear all button not found!");
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
      const { translationHistory = [] } =
        await Browser.storage.local.get("translationHistory");
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
    this.historyList.innerHTML = "";

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

  createHistoryItem(item, index) {
    const div = document.createElement("div");
    div.className = "history-item";
    div.dataset.index = index;

    // دکمه حذف
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-item-btn";
    deleteBtn.title = "X";
    deleteBtn.innerHTML = `<img src="${Browser.runtime.getURL("icons/trash-small.svg")}" alt="Delete" class="delete-item-icon" />`;

    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // جلوگیری از trigger شدن click روی آیتم
      this.deleteHistoryItem(index);
    });

    // Source text
    const sourceDiv = document.createElement("div");
    sourceDiv.className = "history-item-source";
    sourceDiv.textContent = item.sourceText || "";
    correctTextDirection(sourceDiv, item.sourceText || "");

    // Target text با پشتیبانی از Markdown
    const targetDiv = document.createElement("div");
    targetDiv.className = "history-item-target";

    try {
      const rawHtml = marked.parse(item.translatedText || "");
      const sanitized = DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS: [
          "p",
          "strong",
          "em",
          "ul",
          "ol",
          "li",
          "code",
          "pre",
          "blockquote",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "a",
          "br",
        ],
        ALLOWED_ATTR: ["href", "target"],
      });
      targetDiv.innerHTML = sanitized;
    } catch (e) {
      targetDiv.textContent = item.translatedText || "";
    }

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
      const { translationHistory = [] } =
        await Browser.storage.local.get("translationHistory");

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
      // استفاده از i18n برای پیام confirm
      const confirmMessage =
        (await getTranslationString("CONFIRM_CLEAR_ALL_HISTORY")) ||
        "Are you sure you want to clear all translation history?";

      const userConfirmed = window.confirm(confirmMessage);
      console.log("[HistoryManager] User confirmed:", userConfirmed);

      if (userConfirmed) {
        await Browser.storage.local.set({ translationHistory: [] });
        logME("[HistoryManager] Cleared all history");
        this.renderHistory([]);

        // نمایش پیام موفقیت (اختیاری)
        // this.showMessage("History cleared successfully");
      }
    } catch (error) {
      console.error("[HistoryManager] Error clearing history:", error);
      logME("[HistoryManager] Error clearing history:", error);
    }
  }

  async addToHistory(translationData) {
    try {
      const { translationHistory = [] } =
        await Browser.storage.local.get("translationHistory");

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
