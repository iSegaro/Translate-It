# پلن جامع مهاجرت سیستم CSS - Translate-It Vue.js

## خلاصه اجرایی

این پلن برای مهاجرت سیستم CSS پروژه Translate-It از معماری فعلی با تداخل‌ها و مشکلات به یک معماری بهینه، بدون تداخل و مقیاس‌پذیر طراحی شده است. هدف اصلی حذف تمام مشکلات CSS بدون شکستن قابلیت‌های فعلی افزونه است.

## ۱. وضعیت فعلی و چالش‌ها

### ۱.۱ معماری فعلی (۳ لایه)
1. **Global DOM Styles**: تزریق مستقیم به DOM اصلی برای انتخاب المان
2. **Shadow DOM Styles**: استایل‌های برای کامپوننت‌های Vue در Shadow DOM
3. **Component-Level Styles**: استایل‌های محلی هر کامپوننت با scoped CSS

### ۱.۲ مشکلات شناسایی شده
- **۱۰۰+ اعلان !important** در سراسر پروژه
- **تداخل نام کلاس‌ها** بین کامپوننت‌های مختلف
- **importهای تکراری** استایل‌های یکسان در چندین فایل
- **عدم وجود استاندارد نام‌گذاری** یکپارچه
- **خاصیت CSS بالا** در برخی کامپوننت‌های حیاتی

### ۱.۳ کامپوننت‌های بحرانی
- **Translation Window**: ۵۸ اعلان !important
- **Content Main DOM**: ۱۸ اعلان !important برای حالت انتخاب المان
- **Utility Classes**: ۹ اعلان !important در helperها
- **Toast Integration**: ۷ اعلان !important

## ۲. استراتژی مهاجرت

### ۲.۱ اصول کلیدی
1. **صفر خرابی**: هیچ قابلیت فعلی نباید از کار بیفتد
2. **مهاجرت تدریجی**: تغییرات فاز به فاز و تست شده
3. **نام‌گذاری استاندارد**: پیشوند `ti-` برای تمام کلاس‌ها
4. **حذف !important**: جایگزینی با specificity مناسب
5. **ماژولار شدن**: هر کامپوننت استایل‌های مستقل خود را دارد

### ۲.۲ سیستم نام‌گذاری جدید
```
ti-[component]-[element][-modifier][-state]

مثال:
.ti-window             -> پنجره اصلی ترجمه
.ti-window-header      -> هدر پنجره
.ti-window-header--dark -> هدر در حالت تیره
.ti-window__is-active  -> پنجره در حالت فعال
.ti-u-flex             -> Utility کلاس برای flex
```

### ۲.۳ ساختار جدید پوشه استایل‌ها
```
src/assets/styles/
├── foundation/
│   ├── _variables.scss      -> تمام متغیرها و CSS custom properties
│   ├── _mixins.scss         -> Mixins قابل استفاده مجدد
│   ├── _functions.scss      -> توابع CSS
│   └── _reset.scss          -> CSS reset و normalize
├── components/
│   ├── _ti-window.scss      -> استایل‌های پنجره ترجمه
│   ├── _ti-button.scss      -> استایل‌های دکمه‌ها
│   ├── _ti-input.scss       -> استایل‌های اینپوت‌ها
│   ├── _ti-icon.scss        -> استایل‌های آیکون‌ها
│   ├── _ti-toast.scss       -> استایل‌های اطلاع‌رسانی
│   └── _ti-toolbar.scss     -> استایل‌های تولبار
├── layouts/
│   ├── _popup.scss          -> Layout برای popup
│   ├── _sidepanel.scss      -> Layout برای sidepanel
│   └── _options.scss        -> Layout برای options
├── utilities/
│   ├── _ti-layout.scss      -> Flexbox, Grid, Display
│   ├── _ti-spacing.scss     -> Margin, Padding, Gap
│   ├── _ti-typography.scss  -> Font, Text, Line-height
│   └── _ti-colors.scss      -> Color utilities
├── themes/
│   ├── _light.scss          -> تم روشن
│   ├── _dark.scss           -> تم تیره
│   └── _theme-mixins.scss   -> Mixins مربوط به تم‌ها
└── critical/
    ├── _content-dom.scss    -> استایل‌های بحرانی برای DOM injection
    └── _selection.scss      -> استایل‌های انتخاب المان
```

## ۳. فازهای مهاجرت

### فاز ۱: آماده‌سازی و تحلیل (۲-۳ روز)

#### ۱.۱ ایجاد ابزارهای ردیابی
- [x] ایجاد `CSS-MIGRATION-TRACKER.md`
- [ ] ایجاد اسکریپت تحلیل خودکار CSS
- [ ] راه‌اندازی CI/CD برای تست CSS
- [ ] ایجاد environment تست ایزوله

#### ۱.۲ تحلیل عمیق وابستگی‌ها
- [ ] مپ کردن تمام وابستگی‌های استایل بین کامپوننت‌ها
- [ ] شناسایی استایل‌های مرده و استفاده نشده
- [ ] تحلیل performance استایل‌های فعلی
- [ ] مستندسازی تمام نقاط شکست احتمالی

#### ۱.۳ راه‌اندازی ابزارهای کیفیت
- [ ] پیکربندی StyleLint با قوانین پروژه
- [ ] ایجاد pre-commit hooks برای CSS
- [ ] راه‌اندازی PurgeCSS برای بهینه‌سازی
- [ ] ایجاد تست‌های رگرسیون CSS

### فاز ۲: مهاجرت کامپوننت‌های کم‌خطر (۳-۴ روز)

#### ۲.۱ کامپوننت‌های Options
- [ ] مهاجرت BaseButton.vue
  - تغییر `.base-button` → `.ti-btn`
  - حذف !important declarations
  - به‌روزرسانی تمام templateها
  - تست functionality

- [ ] مهاجرت BaseInput.vue
  - تغییر `.base-input` → `.ti-input`
  - یکپارچه‌سازی با جدید theme system
  - به‌روزرسانی validation states

- [ ] مهاجرت SettingsManager.vue
  - تقسیم به sub-components
  - ایجاد layout classes جدید
  - تست در حالت‌های مختلف theme

#### ۲.۲ کامپوننت‌های کم‌خطر دیگر
- [ ] FontSelector.vue
- [ ] LanguageSelector.vue
- [ ] ProviderSelector.vue
- [ ] Modal components

### فاز ۳: مهاجرت کامپوننت‌های اصلی (۴-۵ روز)

#### ۳.۱ کامپوننت‌های Popup
- [ ] مهاجرت Popup.vue
  - ایجاد layout context classes
  - بهینه‌سازی z-index management
  - تست در اندازه‌های مختلف

- [ ] مهاجرت UnifiedTranslationInput.vue
  - refactor complex styling
  - بهبود responsive behavior
  - integration با جدید theme system

#### ۳.۲ کامپوننت‌های Sidepanel
- [ ] مهاجرت Sidepanel.vue
  - بهینه‌سازی scroll behavior
  - بهبود layout structure
  - حذف duplicate styles

- [ ] مهاجرت TranslationHistoryPanel.vue
  - ساده‌سازی complex selectors
  - بهبور performance rendering
  - افزودن animations بهینه

### فاز ۴: مهاجرت کامپوننت‌های بحرانی (۵-۶ روز)

#### ۴.۱ Translation Window (بیشترین !important)
```scss
/* الگوی جایگزینی !important */
/* قبل */
.translation-window {
  z-index: 2147483647 !important;
  display: flex !important;
}

/* بعد */
.ti-window {
  z-index: var(--ti-z-window);
  display: flex; /* حذف !important با specificity مناسب */
}
```

مراحل:
- [ ] ایجاد CSS Custom Properties برای z-index لایه‌ها
- [ ] حذف تدریجی !important با افزایش specificity
- [ ] تست cross-browser compatibility
- [ ] تست در Shadow DOM و main DOM
- [ ] بهینه‌سازی performance برای external sites

#### ۴.۲ Toast Integration System
- [ ] refactor toast animations
- [ ] بهبود positioning logic
- [ ] اضافه کردن variant classes
- [ ] تست cross-frame communication

#### ۴.۳ Content DOM Injection
- [ ] بهینه‌سازی element selection styles
- [ ] کاهش specificity conflicts
- [ ] بهبور performance در صفحات سنگین
- [ ] تست در سایت‌های مختلف

### فاز ۵: بهینه‌سازی و نهایی‌سازی (۲-۳ روز) ✅ انجام شد

#### ۵.۱ حذف کدهای مرده ✅
- [x] شناسایی و حذف unused styles
- [x] بهینه‌سازی bundle size
- [x] حذف duplicate imports
- [x] PurgeCSS integration

#### ۵.۲ بهبور Performance ✅
- [x] بهینه‌سازی CSS selectors
- [x] کاهش reflow/repaint
- [x] lazy loading برای non-critical styles
- [x] benchmarking performance

#### ۵.۳ مستندسازی ✅
- [x] به‌روزرسانی ARCHITECTURE.md
- [x] ایجاد CSS Style Guide
- [x] مستندسازی بهترین شیوه‌ها
- [x] آموزش تیم

## ۴. مدیریت ریسک

### ۴.۱ ریسک‌های اصلی و راهکارها

#### ریسک ۱: خرابی قابلیت‌های فعلی
- **احتمال**: متوسط
- **تأثیر**: بحرانی
- **راهکارهای کاهش**:
  - تست خودکار قبل از هر تغییر
  - ایجاد backup از نسخه پایدار
  - rollback capability در هر مرحله
  - staged rollout با feature flags

#### ریسک ۲: تداخل در حین مهاجرت
- **احتمال**: بالا
- **تأثیر**: متوسط
- **راهکارهای کاهش**:
  - ایجاد environment ایزوله برای تست
  - استفاده از CSS modules در حین مهاجرت
  - testing در مرورگرهای مختلف
  - monitoring در production

#### ریسک ۳: مشکلات Performance
- **احتمال**: کم
- **تأثیر**: متوسط
- **راهکارهای降低**:
  - benchmarking قبل و بعد از تغییرات
  - lazy loading برای استایل‌های غیرضروری
  - بهینه‌سازی تدریجی
  - monitoring performance

### ۴.۲ نقاط بازگشت (Rollback Points)
- بعد از هر فاز اصلی، یک tag در git
- backup از تمام فایل‌های تغییر یافته
- تست رگرسیون قبل از merge
- قابلیت revert سریع با اسکریپت

## ۵. منابع مورد نیاز

### ۵.۱ تیم
- **تیم لید CSS**: مدیریت مهاجرت و تصمیم‌گیری
- **توسعه‌دهندگان Vue**: مهاجرت کامپوننت‌ها
- **QA Engineers**: تست و تأیید تغییرات
- **DevOps**: راه‌اندازی CI/CD و monitoring

### ۵.۲ ابزارها
- **StyleLint**: پاکسازی و استانداردسازی کد
- **PurgeCSS**: حذف استایل‌های استفاده نشده
- **Webpack Bundle Analyzer**: تحلیل bundle size
- **Lighthouse**: benchmarking performance

### ۵.۳ زمان‌بندی
- **فاز ۱**: ۲-۳ روز
- **فاز ۲**: ۳-۴ روز
- **فاز ۳**: ۴-۵ روز
- **فاز ۴**: ۵-۶ روز
- **فاز ۵**: ۲-۳ روز
- **مجموع**: ۱۶-۲۱ روز

## ۶. موفقیت سنجی

### ۶.۱ معیارهای فنی
- حذف ≥ ۹۰% از !important declarations
- کاهش ≥ ۳۰% در bundle size استایل‌ها
- بهبور ≥ ۲۰% در Lighthouse score
- صفر تداخل کلاس در production

### ۶.۲ معیارهای کیفیت
- استاندارد ۱۰۰% StyleLint compliance
- پوشش ≥ ۹۵% در تست‌های رگرسیون CSS
- مستندات کامل برای تمام استایل‌ها
- کاهش ≥ ۵۰% در زمان development استایل‌ها

## ۷. ضمائم

### ۷.۱ نقشه کامل نام‌گذاری
[پیوست A: جدول تبدیل نام کلاس‌ها](#appendix-a)

### ۷.₂ دستورالعمل‌های تست
[پیوست B: تست CSS مهاجرت](#appendix-b)

### ۷.۳ قالب‌های استاندارد
[پیوست C: CSS Template Standards](#appendix-c)

---

## پیوست‌ها

### پیوست A: جدول تبدیل نام کلاس‌ها

| کلاس فعلی | کلاس جدید | اولویت | فایل‌های تأثیرپذیر |
|-----------|-----------|--------|-------------------|
| `.translation-window` | `.ti-window` | بحرانی | multiple |
| `.base-button` | `.ti-btn` | بالا | BaseButton.vue |
| `.flex` | `.ti-u-flex` | متوسط | _helpers.scss |
| `.popup-context` | `.ti-context-popup` | بالا | main.scss |
| `.toast` | `.ti-toast` | بحرانی | _toast-integration.scss |

### پیوست B: تست CSS مهاجرت

#### چک‌لیست تست برای هر کامپوننت
- [ ] رندر صحیح در تمام themeها
- [ ] responsive behavior صحیح
- [ ] animations و transitions کار می‌کنند
- [ ] accessibility requirements برآورده شده
- [ ] performance در محدوده قابل قبول
- [ ] cross-browser compatibility تأیید شده

### پیوست C: CSS Template Standards

#### قالب کامپوننت Vue
```vue
<template>
  <div class="ti-component">
    <div class="ti-component__header">
      <!-- Header content -->
    </div>
    <div class="ti-component__body">
      <!-- Body content -->
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ti-component {
  // Component styles here

  &__header {
    // Header styles
  }

  &__body {
    // Body styles
  }

  &--is-active {
    // Active state
  }
}
</style>
```

---

*ایجاد شده: ۲۰۲۵-۰۹-۱۶*
*آخرین به‌روزرسانی: ۲۰۲۵-۰۹-۱۶*
*نسخه: ۱.۰*