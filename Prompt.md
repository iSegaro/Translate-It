به‌عنوان یک توسعه‌دهنده‌ی خبره‌ی Vue.js و JavaScript عمل کن.

سورس کامل یک افزونه مرورگر مدرن با Vue.js که وظیفه‌ی ترجمه‌ی متن را بر عهده دارد در اختیار تو قرار می‌گیرد. این افزونه با معماری ماژولار، سیستم مدیریت state با Pinia، و سیستم‌های یکپارچه برای error handling، logging، و storage ساخته شده است.

آن را با دقت بررسی کن تا ساختار Vue.js، composable ها، store ها، و ارتباط میان سیستم‌های مختلف را به‌خوبی درک کنی.

بدون حذف هیچ‌یک از قابلیت‌های موجود، بهبودها و تغییرات را با رعایت الگوهای Vue.js و معماری فعلی اعمال کن.

## ویژگی‌های کلیدی
- **Vue.js Apps**: سه اپلیکیشن جداگانه (Popup، Sidepanel، Options)
- **Pinia Stores**: مدیریت state راکتیو 
- **Composables**: منطق business قابل استفاده مجدد
- **Text Actions**: سیستم یکپارچه copy/paste/TTS
- **Windows Manager**: مدیریت UI با پشتیبانی iframe
- **Provider System**: 10+ سرویس ترجمه با factory pattern
- **Error Management**: سیستم مدیریت خطای متمرکز
- **Storage Manager**: ذخیره‌سازی هوشمند با caching
- **Logging System**: سیستم log ساختارمند

## روش‌های ترجمه
1. **انتخاب متن**: ترجمه متن انتخاب شده با نمایش آیکون یا کادر مستقیم
2. **انتخاب المنت**: انتخاب و ترجمه المنت‌های DOM 
3. **Popup Interface**: رابط اصلی ترجمه در popup
4. **Sidepanel**: رابط کامل در sidepanel مرورگر
5. **Screen Capture**: ترجمه تصاویر با OCR
6. **Subtitle Translation**: ترجمه زیرنویس‌ها در ویدئوهای آنلاین (YouTube و...)
7. **Context Menu**: دسترسی از منوی کلیک راست
8. **Keyboard Shortcuts**: میانبرهای صفحه‌کلید

## ساختار کلی پروژه

### Frontend (Vue.js Apps)
- **`src/views/`**: اپلیکیشن‌های اصلی - popup، sidepanel، options
- **`src/components/`**: کامپوننت‌های قابل استفاده مجدد - base، shared، feature، layout
- **`src/composables/`**: منطق business - useTranslation، useMessaging، useErrorHandler
- **`src/store/`**: مدیریت state با Pinia - settings، translation، history

### Backend & Core Systems
- **`src/background/`**: service worker اصلی + handlers پیام‌ها 
- **`src/providers/`**: سیستم ترجمه - factory + 10+ provider
- **`src/messaging/`**: ارتباطات - MessageFormat + useMessaging
- **`src/utils/core/`**: سیستم‌های هسته - logger، storage، error management

### Integration & Content
- **`src/content-scripts/`**: اسکریپت‌های صفحه وب
- **`src/managers/`**: مدیریت‌کننده‌های سیستم - lifecycle، element selection

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
- **`docs/WINDOWS_MANAGER.md`**: مدیریت UI و cross-frame communication
- **`docs/TEXT_ACTIONS_SYSTEM.md`**: عملیات copy/paste/TTS
- **`docs/TTS_SYSTEM.md`**: سیستم text-to-speech

### منابع اضافی
- **`docs/Images/`**: تصاویر و diagram های معماری
- **`docs/Introduce.mp4`**: ویدئوی معرفی
- **`docs/HowToGet-APIKey.mp4`**: راهنمای تنظیم API

## مشخصات فنی
- **Manifest V3**: استاندارد جدید مرورگرها
- **Vue.js 3**: فریمورک راکتیو frontend
- **Pinia**: مدیریت state مدرن
- **Cross-Browser**: کروم و فایرفاکس
- **Build Tools**: Webpack، pnpm
- **Polyfill**: webextension-polyfill برای سازگاری
- **Modern Architecture**: 18+ ماژول تخصصی

