// src/managers/ElementManager.js
import { CONFIG, state } from "../config.js";

export default class ElementManager {
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

  createTranslateIcon(target) {
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

    // محاسبه موقعیت جدید با در نظر گرفتن اسکرول
    const rect = target.getBoundingClientRect();
    icon.style.top = `${rect.top + window.scrollY + 5}px`;
    icon.style.left = `${rect.left + window.scrollX + rect.width + 5}px`;

    // نمایش همیشگی آیکون
    icon.style.display = "block !important";
    icon.style.visibility = "visible !important";

    return icon;
  }

  setupIconBehavior(icon, target) {
    // Add slight delay for positioning
    setTimeout(() => {
      const rect = target.getBoundingClientRect();
      icon.style.top = `${rect.bottom + window.scrollY + 5}px`;
      icon.style.left = `${rect.left + window.scrollX}px`;
    }, 50);

    const clickHandler = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        const text =
          this.strategies[this.detectPlatform(target)].extractText(target);
        if (!text) return;

        const statusNotification = this.notifier.show(
          "در حال ترجمه...",
          "status"
        );
        const translated = await translateText(text);
        await this.updateTargetElement(target, translated);
      } catch (error) {
        this.translationHandler.errorHandler.handle(error, {
          type: ErrorTypes.NETWORK,
          element: target,
        });
      }
    };

    icon.addEventListener("click", clickHandler);
    document.body.appendChild(icon);

    // Positioning fix
    const rect = target.getBoundingClientRect();
    icon.style.top = `${rect.bottom + window.scrollY + 5}px`;
    icon.style.left = `${rect.left + window.scrollX}px`;
  }
}
