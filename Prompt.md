به‌عنوان یک توسعه‌دهنده‌ی خبره‌ی Vue.js و JavaScript عمل کن.

سورس کامل یک افزونه مرورگر مدرن با Vue.js که وظیفه‌ی ترجمه‌ی متن را بر عهده دارد در اختیار تو قرار می‌گیرد. این افزونه با معماری ماژولار، سیستم مدیریت state با Pinia، و سیستم‌های یکپارچه برای error handling، logging، و storage ساخته شده است.

آن را با دقت بررسی کن تا ساختار Vue.js، composable ها، store ها، و ارتباط میان سیستم‌های مختلف را به‌خوبی درک کنی.

بدون حذف هیچ‌یک از قابلیت‌های موجود، بهبودها و تغییرات را با رعایت الگوهای Vue.js و معماری یکپارچه اعمال کن. سیستم TTS به‌طور کامل یکپارچه شده و از `useTTSSmart.js` به‌عنوان تنها منبع حقیقت استفاده می‌کند.

## ویژگی‌های کلیدی
- **Vue.js Apps**: سه اپلیکیشن جداگانه (Popup، Sidepanel، Options)
- **Pinia Stores**: مدیریت state راکتیو 
- **Composables**: منطق business قابل استفاده مجدد
- **Unified TTS System (2025)**: سیستم TTS کاملاً یکپارچه با fallback زبان خودکار و هماهنگی کراس-کانتکست
- **Windows Manager**: مدیریت UI رویداد-محور با کامپوننت‌های Vue و پشتیبانی از iframe
- **IFrame Support**: سیستم ساده و مؤثر پشتیبانی از iframe با ResourceTracker integration و memory management یکپارچه
- **Provider System**: 10+ سرویس ترجمه با معماری سلسله‌مراتبی (BaseProvider, BaseTranslateProvider, BaseAIProvider) و مدیریت Rate Limiting و Circuit Breaker.
- **Error Management**: سیستم مدیریت خطای متمرکز
- **Storage Manager**: ذخیره‌سازی هوشمند با caching
- **Logging System**: سیستم log ساختارمند
- **UI Host System**: اپلیکیشن متمرکز Vue برای مدیریت تمام UIهای درون-صفحه در Shadow DOM
- **Memory Garbage Collector**: سیستم مدیریت حافظه پیشرفته برای جلوگیری از memory leaks با پشتیبانی از DOM، Browser APIs و سیستم‌های event سفارشی
- **Smart Handler Registration**: سیستم ثبت handler های هوشمند با فعال‌سازی و غیرفعال‌سازی پویا بر اساس تنظیمات و URL exclusion

## روش‌های ترجمه
1. **انتخاب متن**: ترجمه متن انتخاب شده با نمایش آیکون یا کادر مستقیم
2. **انتخاب المنت**: انتخاب و ترجمه المنت‌های DOM 
3. **Popup Interface**: رابط اصلی ترجمه در popup
4. **Sidepanel**: رابط کامل در sidepanel مرورگر
5. **Screen Capture**: ترجمه تصاویر با OCR
6. **Subtitle Translation**: ترجمه زیرنویس‌ها در ویدئوهای آنلاین (YouTube و...)
7. **Context Menu**: دسترسی از منوی کلیک راست
8. **Keyboard Shortcuts**: میانبرهای صفحه‌کلید

## توسعه‌ی Provider ها
سیستم از الگوی هرمی پرووایدرها استفاده می‌کند:
- **`BaseProvider`**: کلاس پایه برای همه پرووایدرها
- **`BaseTranslateProvider`**: پرووایدرهای ترجمه سنتی (Google، Yandex)
- **`BaseAIProvider`**: پرووایدرهای هوش مصنوعی (OpenAI، Gemini)
- **`RateLimitManager`**: مدیریت محدودیت نرخ و Circuit Breaker
- **`StreamingManager`**: مدیریت استریمینگ بلادرنگ ترجمه

برای پیاده‌سازی پرووایدر جدید، مستندات `docs/PROVIDERS.md` را مطالعه کنید.

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
  - `translation/` - موتور ترجمه، شامل `BaseProvider`، `BaseTranslateProvider`، `BaseAIProvider`، پرووایدرهای خاص، `RateLimitManager`، `StreamingManager`، handlers و stores.
  - `tts/` - **سیستم TTS یکپارچه (2025)** - `useTTSSmart.js` به‌عنوان تنها منبع حقیقت با fallback زبان خودکار
  - `screen-capture/` - سیستم کپچر صفحه و OCR
  - `element-selection/` - انتخاب و ترجمه المنت‌های DOM با SelectElementHandler
  - `text-selection/` - مدیریت انتخاب متن با TextSelectionHandler
  - `text-field-interaction/` - نمایش آیکون در فیلدهای متنی با TextFieldIconHandler
  - `shortcuts/` - میانبرهای صفحه‌کلید با ShortcutHandler  
  - `exclusion/` - سیستم **Smart Handler Registration** با ExclusionChecker
  - `text-actions/` - عملیات copy/paste/TTS
  - `subtitle/` - ترجمه زیرنویس ویدئوها
  - `windows/` - مدیریت UI رویداد-محور با WindowsManagerHandler
  - `iframe-support/` - سیستم ساده و مؤثر پشتیبانی از iframe با کامپوننت‌های ضروری
  - `history/` - مدیریت تاریخچه ترجمه
  - `settings/` - تنظیمات و configuration

### 🔧 Shared Systems (منتقل شده از سطح بالا)
- **`src/shared/`**: سیستم‌های مشترک
  - `messaging/` - سیستم پیام‌رسانی هوشمند (شامل `SmartMessaging` که برای ارتباط با `StreamingManager` استفاده می‌شود)
  - `storage/` - مدیریت ذخیره‌سازی با caching
  - `error-management/` - مدیریت خطای متمرکز
  - `logging/` - سیستم log ساختارمند  
  - `config/` - تنظیمات کلی

### 🏗️ Core Infrastructure
- **`src/core/`**: زیرساخت اصلی
  - `background/` - service worker، handlers، lifecycle
  - `content-scripts/` - اسکریپت‌های محتوا
  - `memory/` - سیستم Memory Garbage Collector پیشرفته (MemoryManager, ResourceTracker, SmartCache, GlobalCleanup, MemoryMonitor)
  - `managers/` - **FeatureManager** برای مدیریت چرخه حیات handler ها و TextSelectionManager

### 🛠️ Pure Utilities (ساده‌سازی شده)
- **`src/utils/`**: ابزارهای خالص بدون منطق business
  - `browser/` - سازگاری مرورگر
  - `text/` - پردازش متن (شامل سیستم ماژولار Text Selection 2025)
    - `core/` - FieldDetector، SelectionDetector، types مدرن
    - `registry/` - SiteHandlerRegistry برای مدیریت site handlers
    - `sites/` - Site-specific handlers (Zoho، Google، Microsoft، WPS، Notion)
  - `ui/` - ابزارهای UI
  - `framework/` - سازگاری فریمورک

## مستندات موجود
مستندات جامع در پوشه `docs/` برای درک عمیق هر سیستم:

### مستندات اصلی
- **`docs/ARCHITECTURE.md`**: معماری کامل پروژه و integration guide
- **`docs/SMART_HANDLER_REGISTRATION_SYSTEM.md`**: سیستم ثبت handler های هوشمند با مدیریت چرخه حیات پویا
- **`docs/MessagingSystem.md`**: سیستم پیام‌رسانی بین کامپوننت‌ها
- **`docs/TRANSLATION_SYSTEM.md`**: موتور ترجمه و provider ها
- **`docs/PROVIDERS.md`**: راهنمای کامل پیاده‌سازی provider ها با BaseProvider، RateLimitManager، و Circuit Breaker
- **`docs/ERROR_MANAGEMENT_SYSTEM.md`**: مدیریت خطا و context safety
- **`docs/STORAGE_MANAGER.md`**: مدیریت storage با caching
- **`docs/LOGGING_SYSTEM.md`**: سیستم log ساختارمند
- **`docs/MEMORY_GARBAGE_COLLECTOR.md`**: سیستم مدیریت حافظه پیشرفته و جلوگیری از memory leaks

### مستندات ویژگی‌ها  
- **`docs/WINDOWS_MANAGER_UI_HOST_INTEGRATION.md`**: راهنمای یکپارچه‌سازی WindowsManager با UI Host
- **`docs/TEXT_ACTIONS_SYSTEM.md`**: عملیات copy/paste/TTS
- **`docs/TTS_SYSTEM.md`**: سیستم **TTS یکپارچه (2025)** - منبع واحد حقیقت با fallback زبان خودکار و هماهنگی کراس-کانتکست
- **`docs/TEXT_SELECTION_SYSTEM.md`**: سیستم **انتخاب متن ماژولار (2025)** - معماری مدرن با SiteHandlerRegistry، static imports، و پشتیبانی کامل از professional editors (Google Docs, Zoho Writer, WPS Office, Notion)
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
- **IFrame Integration**: پشتیبانی ساده و مؤثر از iframe با ResourceTracker و ErrorHandler

### 🔧 Shared Systems  
- **عدم تکرار**: سیستم‌های مشترک در یک مکان
- **سازگاری**: API یکسان برای همه features
- **بهینه‌سازی**: caching و optimization متمرکز
- **پایداری**: تغییرات کنترل شده در core systems

### 🎯 Smart Handler Registration
- **بهینه‌سازی حافظه**: فقط handler های ضروری فعال و منابع مصرف می‌کنند
- **به‌روزرسانی Real-Time**: تغییرات تنظیمات بدون نیاز به refresh صفحه اعمال می‌شود
- **مدیریت پویا**: فعال‌سازی و غیرفعال‌سازی خودکار بر اساس URL و تنظیمات
- **جداسازی خطا**: اگر یک feature خراب شود، سایرین کار می‌کنند

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
- **Modern Architecture**: Feature-based با Smart Handler Registration System
- **Dynamic Feature Management**: سیستم FeatureManager برای مدیریت چرخه حیات handlers
- **Advanced Memory Management**: ResourceTracker و Memory Garbage Collector یکپارچه
- **Unified TTS System (2025)**: سیستم TTS کاملاً یکپارچه با حذف 600+ خط کد تکراری، fallback زبان خودکار (فارسی→عربی)، و هماهنگی کامل بین تمام contexts