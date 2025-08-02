/**
 * تابع fadeOutInElement:
 *  - به عنصر داده شده یک transition برای opacity اختصاص می‌دهد.
 *  - ابتدا عنصر را به مدتی (duration) به آرامی به opacity صفر تغییر می‌دهد.
 *  - سپس callback داده شده (که می‌تواند عملیات لوکالایز کردن یا تغییر محتوا باشد) اجرا می‌شود.
 *  - در پایان، opacity عنصر به ۱ تغییر می‌یابد تا افکت fade-in حاصل شود.
 *
 * @param {HTMLElement} element - عنصری که باید افکت بر روی آن اعمال شود.
 * @param {Function} callback - تابعی که پس از fade-out اجرا می‌شود.
 * @param {number} duration - مدت زمان افکت به میلی‌ثانیه (پیش‌فرض: 500).
 */
export function fadeOutInElement(element, callback, duration = 500) {
  // تنظیم transition برای تغییر opacity
  element.style.transition = `opacity ${duration}ms ease`;
  // در صورت عدم تنظیم اولیه، مقدار opacity را به ۱ تنظیم می‌کنیم
  if (!element.style.opacity) {
    element.style.opacity = "1";
  }
  // شروع افکت fade-out
  element.style.opacity = "0";
  setTimeout(() => {
    // اجرای callback برای به‌روزرسانی محتویات
    callback();
    // شروع افکت fade-in
    element.style.opacity = "1";
  }, duration);
}

/**
 * animatePopupEffect:
 * یک افکت pop-in برای المان داده شده ایجاد می‌کند.
 * در ابتدا به المان opacity=0 و scale=0.95 داده می‌شود و سپس در مدت زمان مشخص به حالت opacity=1 و scale=1 تغییر می‌کند.
 *
 * @param {HTMLElement} element - عنصری که باید افکت روی آن اعمال شود.
 * @param {number} duration - مدت زمان افکت به میلی‌ثانیه (پیش‌فرض: 300)
 */
export function animatePopupEffect(element, duration = 300) {
  // تنظیم خصوصیات اولیه: کوچک شده و نامرئی
  element.style.opacity = "0";
  element.style.transform = "scale(0.95)";
  element.style.transition = `opacity ${duration}ms ease-out, transform ${duration}ms ease-out`;

  // اعمال reflow به منظور تضمین اجرای transition
  element.getBoundingClientRect();

  // شروع افکت: به حالت نرمال تغییر می‌کند
  element.style.opacity = "1";
  element.style.transform = "scale(1)";
}
