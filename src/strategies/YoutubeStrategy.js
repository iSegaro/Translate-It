// src/strategies/YoutubeStrategy.js
import { ErrorTypes } from "../error-management/ErrorTypes.js";
import PlatformStrategy from "./PlatformStrategy.js";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'YoutubeStrategy');

import { filterXSS } from "xss";
import {
  smartTextReplacement,
  smartDelay,
} from "../utils/framework/framework-compat/index.js";


export default class YoutubeStrategy extends PlatformStrategy {
  constructor(notifier, errorHandler) {
    super(notifier, errorHandler);
    this.errorHandler = errorHandler;
  }

  isYoutube_ExtraField(target) {
    if (!target || target.tagName !== "INPUT") {
      return false;
    }
    return (
      // target.getAttribute("name") === "search_query" ||
      target.getAttribute("id") === "end"
    );
  }

  extractText(target) {
    try {
      if (!target) return "";

      // حالت ۱: المان دارای contenteditable
      if (target?.isContentEditable) {
        return target?.innerText?.trim?.() || "";
      }

      // حالت ۲: المان‌های input و textarea
      if (
        target?.tagName &&
        (target.tagName === "TEXTAREA" || target.tagName === "INPUT")
      ) {
        return target?.value?.trim?.() || "";
      }

      // حالت ۳: fallback → استفاده از textContent
      return target?.textContent?.trim?.() || "";
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "youtube-strategy-extractText",
      });
      return "";
    }

    // try {
    //   if (!target || !target.isConnected) return "";

    //   if (target.isContentEditable) {
    //     return target.innerText?.trim?.() || "";
    //   }

    //   return target.value || target.textContent?.trim?.() || "";
    // } catch (error) {
    //   this.errorHandler.handle(error, {
    //     type: ErrorTypes.UI,
    //     context: "youtube-strategy-extractText",
    //     element: target?.tagName,
    //   });
    //   return "";
    // }
  }

  async updateElement(element, translatedText) {
    try {
      if (!element || !element.isConnected) {
        getLogger().debug('عنصر معتبر برای به‌روزرسانی وجود ندارد');
        return false;
      }

      if (translatedText !== undefined && translatedText !== null) {
        // استفاده از smart replacement برای سازگاری بهتر با فریم‌ورک‌ها
        const success = await smartTextReplacement(element, translatedText);

        if (success) {
          this.applyVisualFeedback(element);
          this.applyTextDirection(element, translatedText);

          // تاخیر هوشمند برای اطمینان از پردازش کامل
          await smartDelay(200);

          getLogger().init('Smart replacement completed successfully');
        } else {
          // fallback به روش قدیمی
          getLogger().debug('Falling back to legacy replacement method');

          if (element.isContentEditable) {
            // برای عناصر contentEditable از <br> استفاده کنید
            const htmlText = translatedText.replace(/\n/g, "<br>");
            const trustedHTML = filterXSS(htmlText, {
              whiteList: {
                br: [],
              },
              stripIgnoreTag: true,
              stripIgnoreTagBody: ["script", "style"],
              onIgnoreTagAttr: function (tag, name, value) {
                // Block javascript: and data: URLs
                if (name === "href" || name === "src") {
                  if (value.match(/^(javascript|data|vbscript):/i)) {
                    return "";
                  }
                }
                return false;
              },
            });

            const parser = new DOMParser();
            const doc = parser.parseFromString(trustedHTML, "text/html");

            element.textContent = "";
            Array.from(doc.body.childNodes).forEach((node) => {
              element.appendChild(node);
            });

            this.applyVisualFeedback(element);
            this.applyTextDirection(element, htmlText);
          } else {
            // برای input و textarea از \n استفاده کنید
            element.value = translatedText;
            this.applyVisualFeedback(element);
            this.applyTextDirection(element, translatedText);
          }
        }
      }
      return true;
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "youtube-strategy-updateElement",
        element: element?.tagName,
      });
      return false;
    }
  }

  async clearContent(element) {
    try {
      if (!element || !element.isConnected) {
        // throw new Error("عنصر معتبر برای پاک‌سازی وجود ندارد");
        return;
      }

      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        element.value = "";
      } else {
        element.textContent = "";
      }

      this.applyVisualFeedback(element);
    } catch (error) {
      const handlerError = this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "youtube-strategy-clearContent",
        element: element?.tagName,
      });
      throw handlerError;
    }
  }
}
