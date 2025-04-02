import { state, TranslationMode } from "../config";
import { logME } from "../utils/helpers";

let isSelectionBoxVisible = false; // فلگ برای پیگیری وضعیت نمایش کادر
let currentlySelectedText = null; // متغیر برای ذخیره متن فعلی انتخاب شده

export async function handleSelection_Text(event, translationHandler) {
  translationHandler.select_Element_ModeActive = false;
  state.selectElementActive = false;
  state.translateMode = TranslationMode.Selection;

  const selectedText = window.getSelection().toString().trim();

  if (selectedText) {
    // اگر کادر در حال حاضر برای همین متن در حال نمایش است، از نمایش مجدد جلوگیری میکنیم
    if (isSelectionBoxVisible && selectedText === currentlySelectedText) {
      //   logME(
      //     "Selection: کادر برای همین متن در حال نمایش است، از نمایش مجدد جلوگیری میشود."
      //   );
      return;
    }

    // به روز رسانی متن فعلی انتخاب شده
    currentlySelectedText = selectedText;

    // 1. ایجاد عنصر div برای نمایش متن
    const selectionDisplay = document.createElement("div");
    selectionDisplay.innerText = selectedText;
    selectionDisplay.classList.add("aiwc-selection-display-temp"); // اضافه کردن کلاس برای استایل دهی

    // 2. اضافه کردن استایل‌های اولیه به صورت inline برای موقعیت و نمایش اولیه
    selectionDisplay.style.position = "absolute";
    selectionDisplay.style.zIndex = "1000"; // اطمینان از اینکه روی عناصر دیگر قرار میگیرد
    selectionDisplay.style.maxWidth = "300px"; // حداکثر عرض
    selectionDisplay.style.overflowWrap = "break-word"; // شکستن کلمات طولانی
    selectionDisplay.style.fontFamily = "sans-serif"; // فونت خوانا
    selectionDisplay.style.opacity = "0"; // شروع با حالت محو

    // 3. محاسبه موقعیت
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      selectionDisplay.style.left = `${rect.left + window.scrollX}px`;
      selectionDisplay.style.top = `${rect.bottom + window.scrollY + 5}px`; // 5 پیکسل فاصله از پایین متن
    }

    // 4. حذف هر کادر نمایش قبلی با افکت fade-out
    const previousSelectionDisplay = document.querySelector(
      ".aiwc-selection-display-temp"
    );
    if (previousSelectionDisplay) {
      previousSelectionDisplay.classList.add("fade-out");
      setTimeout(() => {
        if (previousSelectionDisplay.parentNode) {
          previousSelectionDisplay.remove();
          isSelectionBoxVisible = false; // تنظیم فلگ به false بعد از حذف کادر قبلی
          currentlySelectedText = null; // پاک کردن متن قبلی
        }
      }, 150); // مدت زمان انیمیشن fade-out
    }

    // 5. اضافه کردن کادر به DOM
    document.body.appendChild(selectionDisplay);
    isSelectionBoxVisible = true; // تنظیم فلگ به true بعد از نمایش کادر

    // 6. فعال کردن افکت fade-in با یک تاخیر کوچک
    setTimeout(() => {
      selectionDisplay.style.opacity = "1";
    }, 50); // تاخیر برای اطمینان از اعمال شدن استایل‌های اولیه

    // 7. حذف کادر با کلیک در جای دیگر با افکت fade-out
    const removeHandler = (event) => {
      const selection = window.getSelection();
      let isClickOnSelectedText = false;

      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const clickX = event.clientX;
        const clickY = event.clientY;

        isClickOnSelectedText =
          clickX >= rect.left &&
          clickX <= rect.right &&
          clickY >= rect.top &&
          clickY <= rect.bottom;
      }

      // اگر کلیک روی متن انتخاب شده بود، کاری انجام نده
      if (isClickOnSelectedText) {
        return;
      }

      // اگر کلیک خارج از کادر بود، آن را حذف کن
      if (selectionDisplay && !selectionDisplay.contains(event.target)) {
        selectionDisplay.classList.add("fade-out");
        document.removeEventListener("mousedown", removeHandler);
        isSelectionBoxVisible = false; // تنظیم فلگ به false قبل از حذف کادر
        currentlySelectedText = null; // پاک کردن متن فعلی
        setTimeout(() => {
          if (selectionDisplay.parentNode) {
            selectionDisplay.remove();
          }
        }, 150); // مدت زمان انیمیشن fade-out
      }
    };
    document.addEventListener("mousedown", removeHandler);

    // **منطق پردازش متن انتخاب شده در اینجا قرار میگیرد**
    // برای مثال:
    // await this.translationHandler.performTranslation(selectedText);
    // یا نمایش یک آیکن در نزدیکی متن انتخاب شده
    // this.IconManager.showIcon(event.clientX, event.clientY, selectedText);
  } else {
    // اگر متنی انتخاب نشده بود و کادری در حال نمایش بود، آن را حذف میکنیم
    if (isSelectionBoxVisible) {
      const existingSelectionDisplay = document.querySelector(
        ".aiwc-selection-display-temp"
      );
      if (existingSelectionDisplay) {
        existingSelectionDisplay.classList.add("fade-out");
        setTimeout(() => {
          if (existingSelectionDisplay.parentNode) {
            existingSelectionDisplay.remove();
            isSelectionBoxVisible = false;
            currentlySelectedText = null;
          }
        }, 150);
      }
    }
    isSelectionBoxVisible = false;
    currentlySelectedText = null;
  }
}
