// src/managers/IconManager.js

import { CONFIG, state } from "../config.js";
import { ErrorTypes } from "../error-management/ErrorTypes.js";
import { createLogger } from "../utils/core/logger.js";

export default class IconManager {
  constructor(errorHandler) {
    this.errorHandler = errorHandler;
    this.container = null;
    this.canShowIcons = false;
    this.logger = createLogger('UI', 'IconManager');
  }

  _ensureContainerExists() {
    if (this.container && document.body.contains(this.container)) {
      this.canShowIcons = true;
      return;
    }

    if (
      typeof document === "undefined" ||
      !document.body ||
      typeof document.createElement !== "function"
    ) {
      this.logger.warn('DOM not ready for icon container.');
      this.canShowIcons = false;
      return;
    }

    try {
      const id = "AIWritingCompanion-icon-container";
      let el = document.getElementById(id);
      if (el) {
        this.container = el;
        this.canShowIcons = true;
        this.logger.debug('Re-attached to existing icon container.');
        return;
      }

      el = document.createElement("div");
      el.id = id;
      document.body.appendChild(el);

      this.container = el;
      this.canShowIcons = true;
      this.logger.info('Icon container created and appended successfully.');
    } catch (error) {
      this.logger.error('Environment not compatible for icons due to error:', error.message);
      this.canShowIcons = false;
      if (this.container) {
        try {
          this.container.remove();
        } catch {
          /* ignore */
        }
        this.container = null;
      }
    }
  }

  cleanup() {
    if (state.highlightedElement) {
      state.highlightedElement.style.outline = "";
      state.highlightedElement = null;
    }

    const iconsSelector = ".AIWritingCompanion-translation-icon-extension";
    const icons = this.container
      ? this.container.querySelectorAll(iconsSelector)
      : document.querySelectorAll(iconsSelector);

    icons.forEach((icon) => {
      icon.classList.add("fade-out");
      setTimeout(() => icon.remove(), 50);
    });

    state.activeTranslateIcon = null;
  }

  applyTextDirection(element, text) {
    if (!element?.style) return;
    const isRtl = CONFIG.RTL_REGEX.test(text);
    element.style.direction = isRtl ? "rtl" : "ltr";
    element.style.textAlign = isRtl ? "right" : "left";
  }

  createTranslateIcon(target) {
    this._ensureContainerExists();

    if (!this.canShowIcons) {
      return null;
    }

    try {
      if (!target?.isConnected) {
        return null;
      }
      // CSS is automatically loaded via content_scripts in manifest
      // No manual injection needed

      const icon = document.createElement("button");
      icon.className = "AIWritingCompanion-translation-icon-extension";
      icon.textContent = CONFIG.ICON_TRANSLATION;
      icon.title = CONFIG.TRANSLATION_ICON_TITLE;
      icon.style.display = "none";

      icon.style.zIndex = "2147483640";

      this.container.appendChild(icon);

      requestAnimationFrame(() => {
        if (!target.isConnected) {
          if (icon.parentNode) icon.remove();
          return;
        }
        const rect = target.getBoundingClientRect();

        icon.style.top = `${rect.top + window.scrollY + 10}px`;
        icon.style.left = `${rect.left + window.scrollX + rect.width + 10}px`;
        icon.style.display = "block";
        icon.classList.add(
          "AIWritingCompanion-translation-icon-extension-fade-in",
        );
      });

      return icon;
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "IconManager-createTranslateIcon",
      });
      return null;
    }
  }
}
