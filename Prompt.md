به‌عنوان یک توسعه‌دهنده‌ی خبره‌ی Vue.js و JavaScript عمل کن.

سورس کامل یک افزونه مرورگر مدرن با Vue.js که وظیفه‌ی ترجمه‌ی متن را بر عهده دارد در اختیار تو قرار می‌گیرد. این افزونه با معماری ماژولار، سیستم مدیریت state با Pinia، و سیستم‌های یکپارچه برای error handling، logging، و storage ساخته شده است.

آن را با دقت بررسی کن تا ساختار Vue.js، composable ها، store ها، و ارتباط میان سیستم‌های مختلف را به‌خوبی درک کنی.

بدون حذف هیچ‌یک از قابلیت‌های موجود، بهبودها و تغییرات را با رعایت الگوهای Vue.js و معماری فعلی اعمال کن.

## ویژگی‌های کلیدی
- **Vue.js Apps**: سه اپلیکیشن جداگانه (Popup، Sidepanel، Options)
- **Pinia Stores**: مدیریت state راکتیو 
- **Composables**: منطق business قابل استفاده مجدد
- **Text Actions**: سیستم یکپارچه copy/paste و **TTS پیشرفته** با قابلیت Play/Pause/Resume/Stop
- **Windows Manager**: مدیریت UI رویداد-محور با کامپوننت‌های Vue و پشتیبانی از iframe
- **Provider System**: 10+ سرویس ترجمه با factory pattern
- **Error Management**: سیستم مدیریت خطای متمرکز
- **Storage Manager**: ذخیره‌سازی هوشمند با caching
- **Logging System**: سیستم log ساختارمند
- **UI Host System**: اپلیکیشن متمرکز Vue برای مدیریت تمام UIهای درون-صفحه در Shadow DOM

## روش‌های ترجمه
1. **انتخاب متن**: ترجمه متن انتخاب شده با نمایش آیکون یا کادر مستقیم
2. **انتخاب المنت**: انتخاب و ترجمه المنت‌های DOM 
3. **Popup Interface**: رابط اصلی ترجمه در popup
4. **Sidepanel**: رابط کامل در sidepanel مرورگر
5. **Screen Capture**: ترجمه تصاویر با OCR
6. **Subtitle Translation**: ترجمه زیرنویس‌ها در ویدئوهای آنلاین (YouTube و...)
7. **Context Menu**: دسترسی از منوی کلیک راست
8. **Keyboard Shortcuts**: میانبرهای صفحه‌کلید

## ساختار جدید پروژه (Feature-Based Architecture)

### 🎯 Vue Applications (Entry Points)
- **`src/apps/`**: اپلیکیشن‌های Vue - popup، sidepanel، options، content
  - هر app شامل کامپوننت‌های تخصصی خود
  - UI Host متمرکز برای مدیریت کامپوننت‌های درون-صفحه

### 🧩 Components & Composables  
- **`src/components/`**: کامپوننت‌های قابل استفاده مجدد (ساختار حفظ شده)
- **`src/composables/`**: منطق business سازماندهی شده بر اساس category
  - `core/` - useExtensionAPI، useBrowserAPI
  - `ui/` - useUI، usePopupResize  
  - `shared/` - useClipboard، useErrorHandler، useLanguages

### 🏪 Feature-Based Organization (جدید)
- **`src/features/`**: هر feature خودکفا و مستقل
  - `translation/` - موتور ترجمه، providers، handlers، stores
  - `tts/` - سیستم Text-to-Speech پیشرفته با مدیریت وضعیت
  - `screen-capture/` - سیستم کپچر صفحه و OCR
  - `element-selection/` - انتخاب و ترجمه المنت‌های DOM
  - `text-actions/` - عملیات copy/paste/TTS
  - `subtitle/` - ترجمه زیرنویس ویدئوها
  - `windows/` - مدیریت UI رویداد-محور
  - `history/` - مدیریت تاریخچه ترجمه
  - `settings/` - تنظیمات و configuration

### 🔧 Shared Systems (منتقل شده از سطح بالا)
- **`src/shared/`**: سیستم‌های مشترک
  - `messaging/` - سیستم پیام‌رسانی هوشمند
  - `storage/` - مدیریت ذخیره‌سازی با caching
  - `error-management/` - مدیریت خطای متمرکز
  - `logging/` - سیستم log ساختارمند  
  - `config/` - تنظیمات کلی

### 🏗️ Core Infrastructure
- **`src/core/`**: زیرساخت اصلی
  - `background/` - service worker، handlers، lifecycle
  - `content-scripts/` - اسکریپت‌های محتوا
  - `managers/` - مدیریت‌کننده‌های هسته

### 🛠️ Pure Utilities (ساده‌سازی شده)
- **`src/utils/`**: ابزارهای خالص بدون منطق business
  - `browser/` - سازگاری مرورگر
  - `text/` - پردازش متن
  - `ui/` - ابزارهای UI
  - `framework/` - سازگاری فریمورک

## مستندات موجود
مستندات جامع در پوشه `docs/` برای درک عمیق هر سیستم:

### مستندات اصلی
- **`docs/ARCHITECTURE.md`**: معماری کامل پروژه و integration guide
- **`docs/MessagingSystem.md`**: سیستم پیام‌رسانی بین کامپوننت‌ها
- **`docs/TRANSLATION_SYSTEM.md`**: موتور ترجمه و provider ها
- **`docs/ERROR_MANAGEMENT_SYSTEM.md`**: مدیریت خطا و context safety
- **`docs/STORAGE_MANAGER.md`**: مدیریت storage با caching
- **`docs/LOGGING_SYSTEM.md`**: سیستم log ساختارمند

### مستندات ویژگی‌ها  
- **`docs/WINDOWS_MANAGER_UI_HOST_INTEGRATION.md`**: راهنمای یکپارچه‌سازی WindowsManager با UI Host
- **`docs/TEXT_ACTIONS_SYSTEM.md`**: عملیات copy/paste/TTS
- **`docs/TTS_SYSTEM.md`**: سیستم **Text-to-Speech (TTS) پیشرفته** با مدیریت وضعیت کامل (Play/Pause/Resume)
- **`docs/UI_HOST_SYSTEM.md`**: معماری میزبان UI برای مدیریت متمرکز کامپوننت‌ها
- **`docs/SELECT_ELEMENT_SYSTEM.md`**: سیستم انتخاب و ترجمه عناصر صفحه

### منابع اضافی
- **`docs/Images/`**: تصاویر و diagram های معماری
- **`docs/Introduce.mp4`**: ویدئوی معرفی
- **`docs/HowToGet-APIKey.mp4`**: راهنمای تنظیم API

## مزایای Architecture جدید

### 🏗️ Feature-Based Organization
- **خودکفایی**: هر feature تمام فایل‌های مربوط به خود را در یک مکان دارد
- **مقیاس‌پذیری**: افزودن feature جدید بدون تأثیر بر سایرین
- **نگهداری آسان**: تغییرات محدود به feature مربوطه
- **تست‌پذیری**: هر feature قابل تست مستقل

### 🔧 Shared Systems  
- **عدم تکرار**: سیستم‌های مشترک در یک مکان
- **سازگاری**: API یکسان برای همه features
- **بهینه‌سازی**: caching و optimization متمرکز
- **پایداری**: تغییرات کنترل شده در core systems

### 📁 Clean Structure
- **حداکثر 3 سطح عمق**: پیمایش آسان‌تر
- **نام‌گذاری consistent**: قابل پیش‌بینی
- **جداسازی واضح**: business logic از utilities
- **Import paths تمیز**: استفاده از aliases

## مشخصات فنی
- **Manifest V3**: استاندارد جدید مرورگرها
- **Vue.js 3**: فریمورک راکتیو frontend
- **Pinia**: مدیریت state مدرن
- **Cross-Browser**: کروم و فایرفاکس
- **Build Tools**: Webpack، pnpm
- **Polyfill**: webextension-polyfill برای سازگاری
- **Modern Architecture**: Feature-based با 9 feature اصلی

