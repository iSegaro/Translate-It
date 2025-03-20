// src/managers/IconManager.js
import { CONFIG, state } from "../config.js";
import { ErrorTypes } from "../services/ErrorService.js";

export default class IconManager {
  cleanup() {
    if (state.highlightedElement) {
      state.highlightedElement.style.outline = "";
      state.highlightedElement.style.opacity = "";
      state.highlightedElement = null;
    }

    // حذف تمام آیکون‌ها
    document.querySelectorAll(".translation-icon-extension").forEach((icon) => {
      icon.remove();
    });

    state.activeTranslateIcon = null;
  }

  applyTextDirection(element, text) {
    if (!element || !element.style) return;

    const isRtl = CONFIG.RTL_REGEX.test(text);
    element.style.direction = isRtl ? "rtl" : "ltr";
    element.style.textAlign = isRtl ? "right" : "left";
  }

  /**
   *
   * @param {Text-field where the icon is created} target
   *
   * اگر در هر استراتژی متد insertTranslationIcon وجود نداشته باشد
   *
   * این متد باید فراخوانی شود تا آیکون مترجم در فیلد مربوطه ساخته شود
   * @returns
   */
  createTranslateIcon(target) {
    try {
      const icon = document.createElement("button");
      icon.className = "translation-icon-extension";
      Object.assign(icon.style, {
        position: "absolute",
        background: "white",
        border: "1px solid gray",
        borderRadius: "4px",
        padding: "2px 5px",
        fontSize: "12px",
        cursor: "pointer",
        zIndex: "9999999999",
        pointerEvents: "auto",
      });

      icon.textContent = CONFIG.ICON_TRANSLATION;
      icon.title = CONFIG.TRANSLATION_ICON_TITLE;

      const rect = target.getBoundingClientRect();
      icon.style.top = `${rect.top + window.scrollY + 5}px`;
      icon.style.left = `${rect.left + window.scrollX + rect.width + 5}px`;

      icon.style.display = "block !important";
      icon.style.visibility = "visible !important";

      return icon;
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "IconManager-createTranslateIcon",
      });
    }
  }
}
