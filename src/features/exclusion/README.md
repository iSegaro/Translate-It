# Smart Handler Registration System

سیستم ثبت هوشمند handlers که handlers را فقط زمانی فعال می‌کند که واقعاً نیاز باشد و با تغییرات تنظیمات real-time بروزرسانی می‌شود.

## نحوه کارکرد

### 1. ExclusionChecker
بررسی می‌کند که آیا یک feature برای URL فعلی و تنظیمات کاربر مجاز است:

```javascript
import { ExclusionChecker } from '@/features/exclusion/core/ExclusionChecker.js';

const checker = new ExclusionChecker();
await checker.initialize();

// بررسی feature خاص
const allowed = await checker.isFeatureAllowed('textSelection');
console.log(`Text selection allowed: ${allowed}`);
```

### 2. FeatureManager
مدیریت dynamic فعال‌سازی/غیرفعال‌سازی features:

```javascript
import { FeatureManager } from '@/core/managers/content/FeatureManager.js';

const manager = new FeatureManager();
await manager.initialize();

// دریافت features فعال
console.log('Active features:', manager.getActiveFeatures());

// دریافت وضعیت کامل
console.log('Status:', manager.getStatus());
```

### 3. Feature Handlers
هر feature یک handler مجزا دارد که lifecycle مستقل دارد:

```javascript
// مثال SelectElementHandler
import { SelectElementHandler } from '@/features/element-selection/handlers/selectElementModeHandler.js';

const handler = new SelectElementHandler();
await handler.activate();   // فعال‌سازی
await handler.deactivate(); // غیرفعال‌سازی
```

## Features پشتیبانی شده

### 1. Select Element (`selectElement`)
- **Setting**: `TRANSLATE_WITH_SELECT_ELEMENT`
- **Handler**: `SelectElementHandler`
- **عملکرد**: انتخاب و ترجمه عناصر DOM

### 2. Text Selection (`textSelection`)
- **Setting**: `TRANSLATE_ON_TEXT_SELECTION`
- **Handler**: `TextSelectionHandler`
- **عملکرد**: ترجمه متن انتخاب شده

### 3. Text Field Icon (`textFieldIcon`)
- **Setting**: `TRANSLATE_ON_TEXT_FIELDS`
- **Handler**: `TextFieldIconHandler`
- **عملکرد**: نمایش آیکون ترجمه در text fields
- **Exclusion خاص**: `isUrlExcluded_TEXT_FIELDS_ICON()`

### 4. Shortcut (`shortcut`)
- **Setting**: `ENABLE_SHORTCUT_FOR_TEXT_FIELDS`
- **Handler**: `ShortcutHandler`
- **عملکرد**: میانبر Ctrl+/ برای ترجمه

## Debugging

### Console Commands (در development mode)
```javascript
// تست کامل سیستم
await testFeatureManager();

// دریافت وضعیت فعلی
getFeatureStatus();

// بروزرسانی دستی features
await refreshFeatures();

// دسترسی مستقیم به manager
window.featureManagerInstance.getActiveFeatures();

// تست feature خاص
await window.featureManagerDebugger.testFeature('textSelection');
```

### Monitoring
```javascript
// شروع monitoring (هر 30 ثانیه)
window.featureManagerDebugger.startMonitoring();

// توقف monitoring
window.featureManagerDebugger.stopMonitoring();
```

## تغییرات Real-time

سیستم به تغییرات زیر واکنش نشان می‌دهد:

### 1. تغییرات Settings
وقتی تنظیمات در popup/options تغییر می‌کند، تمام features دوباره ارزیابی می‌شوند.

### 2. تغییر URL
در SPAs، وقتی URL تغییر می‌کند، exclusion دوباره بررسی می‌شود.

### 3. Exclusion Updates
وقتی صفحه از طریق popup exclude می‌شود، تمام features غیرفعال می‌شوند.

## Memory Management

تمام handlers از `ResourceTracker` استفاده می‌کنند:
- Event listeners خودکار cleanup می‌شوند
- Timeouts و intervals پاکسازی می‌شوند
- Memory leaks جلوگیری می‌شود

## Error Handling

سیستم resilient است:
- اگر یک feature fail شود، سایرین کار می‌کنند
- Fallback به legacy system در صورت خرابی کلی
- Errors به ErrorHandler فرستاده می‌شوند

## Performance Benefits

- **بدون handlers غیرضروری**: فقط features نیاز داشته شده load می‌شوند
- **Real-time optimization**: بدون نیاز به refresh صفحه
- **Memory efficient**: ResourceTracker cleanup کامل
- **Fast exclusion checks**: Pre-checks جلوی load های غیرضروری را می‌گیرد

## Integration با Vue

سیستم کاملاً با architecture Vue سازگار است:
- از composables استفاده می‌کند
- با stores ارتباط برقرار می‌کند
- Event-driven communication
- Shadow DOM isolation حفظ شده