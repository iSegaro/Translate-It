# Translation Provider Implementation Guide

## Overview

این مستند راهنمای کاملی برای پیاده‌سازی پرووایدرهای ترجمه در سیستم Translate-It ارائه می‌دهد. تمام پرووایدرها باید از `BaseProvider` ارث‌بری کرده و الگوی Rate Limiting و Circuit Breaker را رعایت کنند.

## Architecture Overview

سیستم بر پایه **Unified Provider Discovery** بنا شده است:
- **ProviderManifest**: **قلب تپنده سیستم.** یک فایل واحد که تمام هویت، تنظیمات نمایشی، و منطق لودینگ پرووایدرها را در خود جای داده است.
- **BaseProvider**: کلاس پایه برای منطق هماهنگی ترجمه و مدیریت خطا.
- **ProviderConstants**: ثابت‌های نام و ID برای جلوگیری از Typos.
- **ProviderConfigurations**: تنظیمات فنی دقیق (Rate Limit, Batching, Features).
- **RateLimitManager**: مدیریت محدودیت نرخ درخواست (به صورت خودکار از تنظیمات فنی تغذیه می‌شود).
- **ProviderRegistry**: مدیریت داینامیک پرووایدرها در UI (به صورت خودکار از مانیفست تغذیه می‌شود).

---

## 🚀 Workflow: Adding a New Provider (Quick Start)

برای اضافه کردن یک پرووایدر جدید، فقط این ۴ مرحله را انجام دهید:

### ۱. تعریف ثابت‌ها (`ProviderConstants.js`)
ID و Name ثابت را اضافه کنید:
- `ProviderNames.YOUR_PROVIDER`: نام کلاس (مانند `'YourTranslate'`)
- `ProviderRegistryIds.YOUR_ID`: آی‌دی رجیستری (مانند `'yourid'`)

### ۲. پیاده‌سازی کلاس پرووایدر (`providers/YourProvider.js`)
کلاس جدید را با ارث‌بری از `BaseTranslateProvider` یا `BaseAIProvider` ایجاد کنید و متدهای ضروری (`_getLangCode` و `_translateChunk`/`_translateSingle`) را پیاده‌سازی کنید.

### ۳. ثبت در مانیفست (`providers/ProviderManifest.js`)
اطلاعات پرووایدر را به آرایه `PROVIDER_MANIFEST` اضافه کنید. این کار تمام موارد زیر را **به صورت خودکار** انجام می‌دهد:
- ثبت برای بارگذاری Lazy
- نمایش در دراپ‌داون‌های UI
- تنظیم آیکون نوار ابزار
- تایید در منوی کلیک‌راست
- مدیریت توضیحات در صفحه تنظیمات

```javascript
{
  id: ProviderRegistryIds.YOUR_ID,
  name: ProviderNames.YOUR_PROVIDER,
  displayName: "Your Provider Name",
  type: ProviderTypes.TRANSLATE,
  category: ProviderCategories.FREE,
  icon: "your-icon.png", // Place in icons/providers/
  descriptionKey: "your_description_key",
  titleKey: "your_title_key",
  importFunction: () => import("./YourProvider.js").then(m => ({ default: m.YourProvider })),
  features: ["text", "autoDetect"],
  needsApiKey: false,
  supported: true,
}
```

### ۴. تعریف جزئیات فنی و i18n
- **تنظیمات فنی**: در `core/ProviderConfigurations.js` تنظیمات Rate Limit و قابلیت‌ها را وارد کنید.
- **ترجمه**: کلیدهای `descriptionKey` و `titleKey` را در `_locales/*/messages.json` تعریف کنید.

---

## ✅ Provider Implementation Rules

### 1. **MANDATORY: Inherit from BaseProvider**
همه پرووایدرها باید از `BaseProvider` یا فرزندان تخصصی آن (`BaseTranslateProvider` / `BaseAIProvider`) ارث‌بری کنند.

### 2. **DO NOT Override translate() Method**
هرگز متد `translate()` را override نکنید. این متد هماهنگی‌های حیاتی (Language Swapping, JSON mode, Rate Limiting) را انجام می‌دهد. فقط متدهای داخلی `_translateChunk` یا `_translateSingle` را پیاده‌سازی کنید.

### 3. **MANDATORY: Use ProviderNames constant**
در constructor کلاس، همیشه از ثابت‌های `ProviderNames` استفاده کنید:
```javascript
constructor() {
  super(ProviderNames.YOUR_PROVIDER);
}
```

---

## Provider Manifest System (The "Source of Truth")

مانیفست (`ProviderManifest.js`) باعث می‌شود سیستم به صورت خودکار خودش را با پرووایدر جدید وفق دهد:

- **UI Registry**: فایل `src/core/provider-registry.js` به صورت داینامیک از مانیفست تولید می‌شود.
- **Actionbar Icons**: `ActionbarIconManager` آیکون‌ها را بر اساس فیلد `icon` در مانیفست پیدا می‌کند.
- **Context Menu**: لیست `knownProviderIds` به صورت خودکار از IDهای مانیفست آپدیت می‌شود.
- **Options UI**: صفحه `LanguagesTab.vue` توضیحات هر پرووایدر را به صورت هوشمند از مانیفست می‌خواند.

---

## Rate Limiting & Configurations

تنظیمات فنی در `ProviderConfigurations.js` متمرکز شده‌اند. `RateLimitManager` در هنگام شروع به کار، تمام این تنظیمات را می‌خواند و برای هر پرووایدر یک Queue و Circuit Breaker اختصاصی ایجاد می‌کند.

### Key Config Sections:
- **rateLimit**: تعداد درخواست همزمان و تاخیرها.
- **batching**: استراتژی تکه‌تکه کردن متن (Character limit یا Smart AI batching).
- **streaming**: فعال/غیرفعال بودن استریمینگ.
- **features**: قابلیت‌هایی مثل Image Translation یا Dictionary.

---

## Multi-API Key Failover System

اگر پرووایدر شما نیاز به API Key دارد، سیستم به صورت خودکار از قابلیت **Multi-Key Failover** پشتیبانی می‌کند:
1. فیلد `needsApiKey: true` را در مانیفست قرار دهید.
2. از `ApiKeyManager` برای مدیریت کلیدها استفاده کنید.
3. متد `_executeApiCallWithFailover` را در کلاس پرووایدر فراخوانی کنید تا در صورت خطا (مثل ۴۲۹ یا کلید نامعتبر)، سیستم به صورت خودکار روی کلید بعدی سوییچ کند.

---

## Summary of Optimization

با معماری جدید، پیچیدگی سیستم به شدت کاهش یافته است:
- **حذف کدهای تکراری**: متادیتای پرووایدر فقط در یک جا (Manifest) تعریف می‌شود.
- **کاهش احتمال خطا**: به دلیل استفاده از ثابت‌ها و تولید داینامیک لیست‌ها، احتمال فراموشی یا اشتباه تایپی در فایل‌های جانبی حذف شده است.
- **نگهداری آسان**: برای تغییر آیکون یا نام یک پرووایدر، فقط کافیست مانیفست را ویرایش کنید.
