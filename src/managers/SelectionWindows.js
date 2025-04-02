// src/managers/SelectionWindows.js
import { logME } from "../utils/helpers";
import { CONFIG } from "../config.js";
import { translateText } from "../utils/api.js";

export default class SelectionWindows {
  constructor(options = {}) {
    this.fadeInDuration = options.fadeInDuration || 50; // مدت زمان پیش فرض برای fade-in
    this.fadeOutDuration = options.fadeOutDuration || 125; // مدت زمان پیش فرض برای fade-out
    this.isVisible = false;
    this.currentText = null;
    this.displayElement = null;
    this.removeMouseDownListener = null; // برای نگهداری رفرنس تابع حذف لیستنر
    this.translationHandler = options.translationHandler;
  }

  async show(selectedText, position) {
    if (
      !selectedText ||
      (this.isVisible && selectedText === this.currentText)
    ) {
      // logME(
      //   this.isVisible && selectedText === this.currentText ?
      //     "SelectionWindows: کادر برای همین متن در حال نمایش است، از نمایش مجدد جلوگیری میشود."
      //   : "SelectionWindows: متن انتخاب شده خالی است."
      // );
      return;
    }

    /**
     * منطق ترجمه
     */
    const translated_text = await translateText(selectedText);

    if (!translated_text) {
      return;
    }

    this.currentText = translated_text;
    /** // *** پایان منطق ترجمه *** */

    // حذف کادر قبلی اگر وجود داشته باشد
    this.dismiss(false); // false به معنی عدم اجرای fade-out در صورت عدم وجود کادر

    // 1. ایجاد عنصر div برای نمایش متن
    this.displayElement = document.createElement("div");
    this.displayElement.innerText = this.currentText;
    this.displayElement.classList.add("aiwc-selection-display-temp"); // استفاده از کلاس CSS

    // 2. اضافه کردن استایل‌های اولیه به صورت inline برای موقعیت و نمایش اولیه
    this.displayElement.style.position = "absolute";
    this.displayElement.style.zIndex = "1000"; // اطمینان از اینکه روی عناصر دیگر قرار میگیرد
    this.displayElement.style.maxWidth = "300px"; // حداکثر عرض
    this.displayElement.style.overflowWrap = "break-word"; // شکستن کلمات طولانی
    this.displayElement.style.fontFamily = "sans-serif"; // فونت خوانا
    this.displayElement.style.opacity = "0"; // شروع با حالت محو
    this.displayElement.style.left = `${position.x}px`;
    this.displayElement.style.top = `${position.y}px`;
    this.applyTextDirection(this.displayElement, this.currentText);
    // *** اضافه کردن یک مشخصه برای شناسایی راحت‌تر کادر ***
    this.displayElement.dataset.aiwcSelectionPopup = "true";

    // 3. اضافه کردن کادر به DOM
    document.body.appendChild(this.displayElement);
    this.isVisible = true;

    // 4. فعال کردن افکت fade-in با یک تاخیر کوچک
    // *** استفاده از requestAnimationFrame برای بهبود عملکرد انیمیشن ***
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Double requestAnimationFrame for stability across browsers
        if (this.displayElement) {
          this.displayElement.style.transition = `opacity ${this.fadeInDuration}ms ease-in-out`;
          this.displayElement.style.opacity = "1";
        }
      });
    });

    // 5. حذف کادر با کلیک در جای دیگر با افکت fade-out
    // *** Listener حالا فقط روی mousedown کار می‌کنه و جلوی انتشار رویداد رو می‌گیره ***
    const removeHandler = (event) => {
      if (!this.isVisible || !this.displayElement) return; // اگر کادر وجود نداره یا قابل مشاهده نیست، کاری نکن

      const target = event.target;

      // بررسی کلیک روی خود کادر
      const isClickOnDisplayElement = this.displayElement.contains(target);

      // بررسی کلیک روی متن انتخاب شده (با دقت بیشتر)
      let isClickOnSelectedText = false;
      if (!isClickOnDisplayElement) {
        // فقط اگر کلیک روی کادر نبود، انتخاب متن رو بررسی کن
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          try {
            // بررسی اینکه آیا گره کلیک شده بخشی از محدوده انتخاب شده است یا خیر
            if (
              range.intersectsNode(target) ||
              range.commonAncestorContainer.contains(target)
            ) {
              // بررسی مختصات برای اطمینان بیشتر (اختیاری ولی مفید)
              const rect = range.getBoundingClientRect();
              const clickX = event.clientX;
              const clickY = event.clientY;
              isClickOnSelectedText =
                clickX >= rect.left &&
                clickX <= rect.right &&
                clickY >= rect.top &&
                clickY <= rect.bottom;
            }
          } catch (e) {
            logME("AIWC: Error checking selected text intersection:", e);
            // در صورت خطا، فرض می‌کنیم کلیک روی متن انتخاب شده نبوده
            isClickOnSelectedText = false;
          }
        }
      }

      // اگر کلیک داخل کادر بود کاری انجام نده
      // *** مهم: جلوی انتشار رویداد mousedown رو بگیر ***
      if (isClickOnDisplayElement) {
        // logME(
        //   "SelectionWindows: Click inside display element or on selected text. Preventing dismissal and stopping propagation."
        // );
        event.stopPropagation();
        return;
      }

      // اگر کلیک خارج از کادر و متن انتخاب شده بود، آن را حذف کن
      // logME("SelectionWindows: Click outside. Dismissing.");
      this.dismiss();
    };

    // اضافه کردن event listener برای حذف با mousedown
    // *** مهم: Listener فقط یکبار بعد از نمایش اضافه می‌شود ***
    if (this.removeMouseDownListener) {
      document.removeEventListener("mousedown", this.removeMouseDownListener);
    }
    document.addEventListener("mousedown", removeHandler);
    this.removeMouseDownListener = removeHandler; // ذخیره رفرنس برای حذف بعدی
  }

  dismiss(withFadeOut = true) {
    if (!this.displayElement || !this.isVisible) {
      // اضافه کردن چک isVisible
      return;
    }

    // *** اطمینان از حذف listener قبل از شروع انیمیشن یا حذف ***
    if (this.removeMouseDownListener) {
      document.removeEventListener("mousedown", this.removeMouseDownListener);
      this.removeMouseDownListener = null;
      // logME("SelectionWindows: Removed mousedown listener during dismiss.");
    }

    this.isVisible = false; // وضعیت را بلافاصله آپدیت کن

    if (withFadeOut && this.fadeOutDuration > 0) {
      // *** استفاده از transition به جای setTimeout مستقیم برای fade-out ***
      this.displayElement.style.transition = `opacity ${this.fadeOutDuration}ms ease-in-out`;
      this.displayElement.style.opacity = "0";

      // استفاده از event listener 'transitionend' برای حذف المان بعد از پایان انیمیشن
      this.displayElement.addEventListener(
        "transitionend",
        this.removeElement.bind(this),
        { once: true }
      );
    } else {
      this.removeElement();
    }
  }

  removeElement() {
    // *** اطمینان بیشتر از حذف listener حتی اگر dismiss به روش دیگری فراخوانی شده باشد ***
    if (this.removeMouseDownListener) {
      document.removeEventListener("mousedown", this.removeMouseDownListener);
      this.removeMouseDownListener = null;
      // logME(
      //   "SelectionWindows: Removed mousedown listener during removeElement."
      // );
    }

    if (this.displayElement && this.displayElement.parentNode) {
      this.displayElement.remove();
    }
    // Reset state
    this.displayElement = null;
    // this.isVisible = false; // در dismiss انجام شد
    this.currentText = null;
  }

  applyTextDirection(element, text) {
    if (!element || !element.style) return;

    const isRtl = CONFIG.RTL_REGEX.test(text);
    element.style.direction = isRtl ? "rtl" : "ltr";
    element.style.textAlign = isRtl ? "right" : "left";
  }
}
