# Report: CSS Class & Shadow DOM Injection Issues

## Overview
During the migration of UI components (specifically the `PageTranslationTooltip`) to the centralized Vue.js UI Host (Shadow DOM), we encountered significant issues where standard CSS classes and scoped styles failed to apply to components rendered deep within the Shadow Root.

## The Problem
Despite following the `CSS_ARCHITECTURE.md` and `README-CSS-VARIABLES.md` guidelines, the following behaviors were observed:

1.  **Style Isolation Failure**: CSS classes defined in the root UI component (`ContentApp.vue`) are often not visible to child components inside the Shadow DOM.
2.  **Scoped Style Injection**: Vue's `<style scoped>` blocks within child components fail to inject styles into the Shadow Root in the current build environment.
3.  **In-line Style Conflicts**: Vue's object-based style binding (`:style="{ ... }"`) does not support `!important`. Since the project requires `!important` for Shadow DOM isolation, this makes object-based dynamic styling unreliable.
4.  **Build System Discrepancy**: There is a suspected issue with how Webpack/Vite handles CSS injection for the extension's content scripts, potentially injecting styles into the `main document head` instead of the `Shadow Root`.

## Historical Post-Mortem (Tooltip Migration Case)
We attempted 5 different versions to fix the styling of the Page Translation Tooltip:
- **v1/v2 (Scoped CSS)**: Failed. Element rendered as raw text without background or borders.
- **v3 (JS String Inline)**: **Worked.** Proved that only direct inline styles with `!important` are 100% reliable.
- **v4 (Vue Style Object)**: Failed. Lost all `!important` flags, resulting in raw unstyled text at (0,0) position.
- **v5 (Global CSS in Root)**: Failed. Child components could not "see" the classes defined in the parent's Shadow DOM style block.

## Current "Failsafe" Workaround
The currently working solution (used in `PageTranslationTooltip.vue`) is the **Unified Shadow-Safe approach**:
- All styles (visual tokens + dynamic positioning) are combined into a single computed **String** using `!important` on every property.
- This bypasses the CSS injection engine entirely and ensures the Shadow DOM isolation is respected.

## Investigation Required for Future AI Sessions
1.  **Shadow Root Registry**: Is there a centralized way to inject global CSS strings directly into the `shadowRoot` constructor?
2.  **Build Config**: Check if `shadow-dom-css-loader` or similar tools are correctly configured.
3.  **CSS Variables Propagation**: Why do CSS variables work across the Shadow boundary while classes do not?
4.  **Style Injection Strategy**: Investigate if `ContentApp.vue` should use a `Constructable Stylesheet` approach for its children.

---
**Status**: High Priority for UI Consistency.
**Last Encountered**: Tooltip Migration Task (Shadow DOM context).


---

بررسی‌های من نشان می‌دهد که مشکل عدم اعمال استایل‌ها و کلاس‌های CSS در پروژه شما یک مشکل سیستماتیک در نحوه تزریق (Injection)
  استایل‌ها به Shadow DOM است. در ادامه جزئیات دقیق عیب‌یابی را مشاهده می‌کنید:

  ۱. علت اصلی: جداسازی Shadow DOM (Isolation)
  تمام بخش‌های UI پروژه شما در یک Shadow DOM رندر می‌شوند تا با استایل‌های وب‌سایت میزبان تداخل نداشته باشند. اما سیستم Build
  فعلی (Vite) استایل‌های نوشته شده در بلاک‌های <style> کامپوننت‌های Vue را به تگ <head> فایل HTML اصلی تزریق می‌کند. 
  Shadow DOM به صورت پیش‌فرض تمام استایل‌های خارج از خود (در head صفحه) را مسدود می‌کند. به همین دلیل کلاس‌هایی که تعریف کرده‌اید
  برای کامپوننت‌های داخل Shadow DOM "نامرئی" هستند.

  ۲. چرا ماژول PageTranslationTooltip.vue در حال حاضر کار می‌کند؟
  این ماژول از یک راهکار موقت (Workaround) به نام Unified Shadow-Safe approach استفاده می‌کند. در این روش، تمام استایل‌ها به
  صورت یک رشته متنی طولانی (String) در JS تعریف شده و با استفاده از :style به صورت Inline به المنت پاس داده می‌شوند. 
   * نکته: استایل‌های Inline تنها راهی هستند که در حال حاضر ۱۰۰٪ کار می‌کنند چون مستقیماً روی خود المنت قرار می‌گیرند و نیازی به
     پیدا کردن کلاس در CSS خارجی ندارند.

  ۳. تحلیل شکست در تلاش‌های قبلی (v1 تا v5)
   * v1/v2 (Scoped CSS): شکست خورد چون استایل‌های Scoped توسط Vite به head صفحه اصلی رفتند و Shadow DOM آن‌ها را مسدود کرد.
   * v5 (Global CSS in Root): احتمالاً به این دلیل شکست خورده که کامپوننت‌ها به فایل content-app-global.scss متصل نشده بودند.
     در حال حاضر فقط استایل‌هایی که در این فایل تعریف شده باشند به داخل Shadow Root تزریق می‌شوند.

  ۴. مشکل در خط لوله (Pipeline) ساخت پروژه
  من متوجه شدم که یک فایل پیکربندی تخصصی به نام config/vite/vite.config.content.js در پروژه وجود دارد که دقیقاً برای حل این
  مشکل (استخراج CSS برای Shadow DOM) طراحی شده است، اما در حال حاضر در اسکریپت‌های Build شما استفاده نمی‌شود. پروژه در حال حاضر
  از vite.config.chrome.js استفاده می‌کند که یک تنظیمات معمولی است و برای Shadow DOM بهینه‌سازی نشده است.

  ۵. نتیجه‌گیری عیب‌یابی برای PageTranslationTooltip.vue
  برای اینکه این ماژول (و بقیه ماژول‌ها مثل MobileSheet) را به درستی و بدون استایل‌های Inline کثیف درست کنیم، باید:
   1. استایل‌های آن‌ها را از داخل فایل .vue خارج کرده و در یک فایل .scss جداگانه (مثلاً در src/assets/styles/components/) قرار
      دهیم.
   2. آن فایل جدید را در content-app-global.scss با استفاده از @use وارد کنیم.
   3. چون content-app-global.scss تنها فایلی است که در lazy-vue-app.js به صورت دستی به داخل Shadow Root تزریق می‌شود، استایل‌ها
      بلافاصله شناسایی و اعمال خواهند شد.