// src/strategies/PlatformStrategy.js
import { CONFIG } from "../config.js";

export default class PlatformStrategy {
  extractText(target) {
    return target.value || target.innerText?.trim() || "";
  }

  async updateElement(element, translated) {
    element.value = translated;
    this.applyBaseStyling(element, translated);
  }

  applyBaseStyling(element, translated) {
    const isRtl = CONFIG.RTL_REGEX.test(translated);
    element.style.direction = isRtl ? "rtl" : "ltr";
    element.style.textAlign = isRtl ? "right" : "left";
  }

  pasteContent(element, content) {
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      element.value = content;
    } else {
      element.innerHTML = content;
    }
  }

  applyTextDirection(element, translatedText) {
    const isRtl = CONFIG.RTL_REGEX.test(translatedText);
    element.style.direction = isRtl ? "rtl" : "ltr";
    element.style.textAlign = isRtl ? "right" : "left";
  }

  replaceSelection(range, translated) {
    range.deleteContents();
    range.insertNode(document.createTextNode(translated));
  }
}
