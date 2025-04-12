// src/popup/clipboardManager.js
import elements from "./domElements.js";
import * as uiManager from "./uiManager.js";
import { logME } from "../utils/helpers.js";

let hasTriedUpdatingVisibilityOnFocus = false;

// تابع کمکی جهت بررسی و درخواست permission
async function ensureClipboardPermission(permissionName) {
  if (!navigator.permissions) {
    // در صورتی که Permissions API موجود نباشد، فرض می‌کنیم محدودیتی نیست.
    return true;
  }
  try {
    const permissionStatus = await navigator.permissions.query({
      name: permissionName,
    });
    // اگر وضعیت granted است، اجازه داریم
    if (permissionStatus.state === "granted") return true;
    // اگر وضعیت prompt است، تلاشی می‌کنیم که متد مربوطه فراخوانی شود تا درخواست به کاربر نمایش داده شود.
    if (permissionStatus.state === "prompt") {
      if (permissionName === "clipboard-read") {
        try {
          // فراخوانی readText باعث ایجاد prompt در صورت نیاز می‌شود
          await navigator.clipboard.readText();
          return true;
        } catch (err) {
          logME(
            "[Clipboard]: درخواست دسترسی خواندن کلیپ بورد توسط کاربر رد شده است."
          );
          return false;
        }
      } else if (permissionName === "clipboard-write") {
        // برای نوشتن، معمولاً نیازی به درخواست دستی نیست؛ ولی می‌توان این بخش را برای آینده گسترش داد.
        return true;
      }
    }
    logME(
      `[Clipboard]: دسترسی ${permissionName} با حالت "${permissionStatus.state}" است.`
    );
    return false;
  } catch (error) {
    console.error(
      "Error checking clipboard permission for",
      permissionName,
      error
    );
    return false;
  }
}

async function updatePasteButtonVisibility() {
  const button = elements.pasteSourceBtn;
  if (!button) return;

  button.classList.add("hidden-by-clipboard"); // مخفی‌سازی اولیه

  if (hasTriedUpdatingVisibilityOnFocus && !document.hasFocus()) {
    logME("[Clipboard]: Visibility update already deferred to window focus.");
    return;
  }

  // ابتدا بررسی وضعیت permission خواندن کلیپ‌برد
  const hasReadPermission = await ensureClipboardPermission("clipboard-read");
  if (!hasReadPermission) {
    logME(
      "[Clipboard]: اجازه دسترسی به clipboard برای خواندن وجود ندارد. دکمه Paste مخفی می‌ماند."
    );
    return;
  }

  try {
    if (!navigator.clipboard?.readText) {
      logME(
        "[Clipboard]: Clipboard API (readText) در دسترس نیست. دکمه Paste مخفی می‌ماند."
      );
      return; // خروج در صورت عدم موجودیت API
    }
    const clipboardText = await navigator.clipboard.readText();
    hasTriedUpdatingVisibilityOnFocus = false; // بازنشانی flag در صورت موفقیت
    if (clipboardText?.trim()) {
      button.classList.remove("hidden-by-clipboard");
      logME(
        "[Clipboard]: متن در کلیپ بورد موجود است؛ دکمه Paste نمایش داده می‌شود."
      );
    } else {
      logME(
        "[Clipboard]: کلیپ بورد خالی یا بدون متن است؛ دکمه Paste مخفی می‌ماند."
      );
    }
  } catch (err) {
    if (
      err.name === "NotAllowedError" &&
      !document.hasFocus() &&
      !hasTriedUpdatingVisibilityOnFocus
    ) {
      logME(
        "[Clipboard]: فاقد فوکوس. بررسی پس از به‌دست آمدن فوکوس پنجره به تعویق می‌افتد."
      );
      hasTriedUpdatingVisibilityOnFocus = true;
      window.addEventListener("focus", updatePasteButtonVisibility, {
        once: true,
      });
    } else {
      logME(
        "[Clipboard]: خطا در خواندن کلیپ بورد. دکمه Paste مخفی می‌شود.",
        err.name
      );
      console.warn(
        "[Clipboard]: خطا در خواندن کلیپ بورد.",
        err.name,
        err.message
      );
      hasTriedUpdatingVisibilityOnFocus = false;
    }
  }
}

function setupEventListeners() {
  // کپی متن منبع
  elements.copySourceBtn?.addEventListener("click", async () => {
    const text = elements.sourceText.value;
    if (text) {
      // بررسی permission نوشتن در کلیپ بورد (در بسیاری از مرورگرها نیاز به درخواست دستی ندارد)
      const hasWritePermission =
        await ensureClipboardPermission("clipboard-write");
      if (!hasWritePermission) {
        logME("[Clipboard]: اجازه نوشتن در کلیپ بورد موجود نیست.");
        uiManager.showVisualFeedback(elements.copySourceBtn, "error");
        return;
      }
      navigator.clipboard
        .writeText(text)
        .then(() => {
          logME("[Clipboard]: متن منبع کپی شد!");
          elements.pasteSourceBtn?.classList.remove("hidden-by-clipboard");
          uiManager.showVisualFeedback(elements.copySourceBtn); // ارائه فیدبک
        })
        .catch((err) => {
          logME("[Clipboard]: خطا در کپی کردن متن منبع: ", err);
          uiManager.showVisualFeedback(elements.copySourceBtn, "error");
        });
    }
  });

  // paste کردن متن کلیپ بورد
  elements.pasteSourceBtn?.addEventListener("click", async () => {
    // اطمینان از داشتن اجازه خواندن کلیپ بورد قبل از ادامه
    const hasReadPermission = await ensureClipboardPermission("clipboard-read");
    if (!hasReadPermission) {
      logME("[Clipboard]: اجازه خواندن کلیپ بورد وجود ندارد.");
      uiManager.showVisualFeedback(elements.pasteSourceBtn, "error");
      elements.pasteSourceBtn?.classList.add("hidden-by-clipboard");
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        elements.sourceText.value = text;
        elements.sourceText.dispatchEvent(
          new Event("input", { bubbles: true })
        ); // trigger UI update
        elements.sourceText.focus();
        // در صورت نیاز می‌توان ترجمه را هم trigger کرد:
        // elements.translateBtn?.click();
      }
      await updatePasteButtonVisibility(); // Re-check state after paste
    } catch (err) {
      logME("[Clipboard]: خطا در paste کردن متن: ", err);
      uiManager.showVisualFeedback(elements.pasteSourceBtn, "error");
      elements.pasteSourceBtn?.classList.add("hidden-by-clipboard"); // مخفی‌سازی در صورت خطا
    }
  });

  // کپی متن ترجمه شده (نتایج)
  elements.copyTargetBtn?.addEventListener("click", async () => {
    const text = elements.translationResult.textContent;
    if (text && text !== "در حال ترجمه...") {
      const hasWritePermission =
        await ensureClipboardPermission("clipboard-write");
      if (!hasWritePermission) {
        logME("[Clipboard]: اجازه نوشتن در کلیپ بورد وجود ندارد.");
        uiManager.showVisualFeedback(elements.copyTargetBtn, "error");
        return;
      }
      navigator.clipboard
        .writeText(text)
        .then(() => {
          logME("[Clipboard]: متن ترجمه شده کپی شد!");
          elements.pasteSourceBtn?.classList.remove("hidden-by-clipboard");
          uiManager.showVisualFeedback(elements.copyTargetBtn);
        })
        .catch((err) => {
          logME("[Clipboard]: خطا در کپی کردن متن ترجمه شده: ", err);
          uiManager.showVisualFeedback(elements.copyTargetBtn, "error");
        });
    }
  });

  // گوش دادن به رویداد سفارشی از languageManager بعد از swap
  document.addEventListener("translationSwapped", updatePasteButtonVisibility);
}

export async function init() {
  setupEventListeners();
  await updatePasteButtonVisibility(); // بررسی اولیه
  logME("[Clipboard]: ماژول Clipboard مقداردهی اولیه شد.");
}

// Export برای فراخوانی‌های خارجی در صورت نیاز (مثلاً پس از پاکسازی storage)
export { updatePasteButtonVisibility };
