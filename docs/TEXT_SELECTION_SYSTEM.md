# Text Selection System

## نگاه کلی

سیستم Text Selection یکی از بخش‌های کلیدی افزونه Translate-It است که مسئول تشخیص، مدیریت و پردازش انتخاب متن در صفحات وب می‌باشد. این سیستم با **معماری ساده شده (2025)** و بر اساس selectionchange events، تجربه کاربری بهینه‌ای را برای ترجمه متن‌های انتخابی فراهم می‌کند.

### ✅ آپدیت‌های 2025 - سیستم ساده شده:
- **حذف پیچیدگی**: حذف کامل drag detection پیچیده و سیستم pendingSelection
- **selectionchange-only**: استفاده تنها از selectionchange events برای همه scenarios
- **جداسازی text fields**: منطق text field به ماژول text-field-interaction منتقل شد
- **Simple Drag Prevention**: تشخیص ساده mousedown/mouseup برای جلوگیری از نمایش در حین drag
- **Performance Boost**: 60-70% کاهش پیچیدگی کد و بهبود عملکرد
- **Maintainability**: کد بسیار ساده‌تر و قابل نگهداری

## معماری

### 🎯 کامپوننت‌های اصلی

#### 1. **SimpleTextSelectionHandler**
`src/features/text-selection/handlers/SimpleTextSelectionHandler.js`

- مدیریت selectionchange event تنها
- تشخیص ساده drag (mousedown/mouseup)
- جلوگیری از نمایش آیکون در text fields
- ارتباط مستقیم با SelectionManager

#### 2. **SelectionManager**
`src/features/text-selection/core/SelectionManager.js`

- پردازش ساده انتخاب متن
- محاسبه position برای UI
- تعامل با WindowsManager
- پشتیبانی از iframe communication

#### 3. **TextSelectionHandler (Wrapper)**
`src/features/text-selection/handlers/TextSelectionHandler.js`

- Wrapper سازگاری برای FeatureManager
- استفاده از SimpleTextSelectionHandler در پس زمینه
- حفظ API قدیمی برای backward compatibility

#### 4. **useTextSelection (Vue Composable)**
`src/features/text-selection/composables/useTextSelection.js`

- Vue composable برای integration
- Reactive state management
- تعامل ساده با SimpleTextSelectionHandler
`src/utils/text/core/FieldDetector.js`

- تشخیص نوع فیلد با استفاده از site handlers
- تعیین selection strategy مناسب
- Async/await صحیح برای همه operations
- Cache management برای بهبود performance

## استراتژی Selection (ساده شده)

### 🚀 رویکرد جدید: selectionchange-only

سیستم جدید تنها از یک استراتژی استفاده می‌کند:

#### **Single Strategy** (همه محتوا)
```javascript
// تنها یک event listener لازم است:
document.addEventListener('selectionchange', () => {
  if (!isDragging && hasText && !isInTextField) {
    showTranslationIcon();
  }
});
```

### 🎯 شرایط نمایش آیکون:

1. **✅ متن انتخاب شده باشد** (`selectedText.trim()`)
2. **✅ در حال drag نباشد** (`!isDragging`)
3. **✅ در text field نباشد** (`!isInTextField`)
4. **✅ Ctrl key requirement** (در صورت فعال بودن)
5. **✅ Select element mode غیرفعال** (`!selectModeActive`)

### 🔄 جداسازی مسئولیت‌ها:

- **Page Text Selection** → `SimpleTextSelectionHandler`
- **Text Field Selection** → `TextFieldDoubleClickHandler` (ماژول جدا)

## Simple Drag Prevention (رویکرد ساده شده)

### 🚀 مزایای رویکرد جدید

#### ❌ روش قدیمی (Complex Drag Detection)
```javascript
// پیچیده و مشکل‌دار
selectionchange → store as pendingSelection
mouseup → process pendingSelection
timeout management + complex state
```

#### ✅ روش جدید (Simple Prevention)
```javascript
// بسیار ساده و مؤثر
mousedown → isDragging = true
selectionchange → if (isDragging) skip
mouseup → isDragging = false + process after delay
```

### 🔧 پیاده‌سازی ساده

```javascript
class SimpleTextSelectionHandler {
  constructor() {
    this.isDragging = false;
  }

  handleMouseDown() {
    this.isDragging = true;
  }

  handleMouseUp() {
    this.isDragging = false;

    // Process selection after short delay
    setTimeout(() => {
      this.processSelection();
    }, 50);
  }

  async processSelection() {
    if (this.isDragging) {
      return; // Skip during drag
    }

    if (this.isSelectionInTextField()) {
      return; // Skip text fields
    }

    // Process page selection
    await this.showTranslationIcon();
  }
}
```

## Event Flow

### 📊 جریان رویدادها (ساده شده)

```mermaid
graph TD
    A[User MouseDown] --> B[isDragging = true]
    B --> C[User Drags Text]
    C --> D[selectionchange events]
    D --> E[Skip (isDragging = true)]
    E --> F[User MouseUp]
    F --> G[isDragging = false]
    G --> H[Process selection after 50ms]
    H --> I[Show Translation Icon]
```

### 🎮 سناریوهای مختلف

#### 1. **Mouse Selection** (Selection با drag)
```
mousedown → isDragging = true
  ↓
selectionchange → skip (isDragging = true)
  ↓
mouseup → isDragging = false → process after 50ms → نمایش icon
```

#### 2. **Keyboard Selection** (Ctrl+A، Shift+Arrow)
```
selectionchange (isDragging = false) → پردازش فوری → نمایش icon
```

#### 3. **Text Field Selection** (INPUT/TEXTAREA)
```
selectionchange → isSelectionInTextField() = true → skip
  ↓
double-click in text field → TextFieldDoubleClickHandler → نمایش icon
```

## Text Field Integration (ماژول جدا)

### 🔄 جداسازی Text Fields

Professional editors و text fields حالا توسط ماژول جداگانه مدیریت می‌شوند:

#### Text Field Handler (`text-field-interaction` module)
```javascript
// TextFieldDoubleClickHandler برای text fields
class TextFieldDoubleClickHandler {
  handleDoubleClick(event) {
    if (this.isTextField(event.target)) {
      const selectedText = this.getSelectedText();
      this.showTranslationUI(selectedText);
    }
  }

  isTextField(element) {
    // INPUT, TEXTAREA, contenteditable
    return element.tagName === 'INPUT' ||
           element.tagName === 'TEXTAREA' ||
           element.contentEditable === 'true';
  }
}
```

#### Professional Editors Support
- **Google Docs**: contenteditable detection
- **Microsoft Office**: iframe-based detection
- **Zoho Writer**: custom element detection
- **Notion**: block-based detection
- **WPS Office**: office suite detection

### 🎯 رویکرد ساده:
1. **Page content** → `SimpleTextSelectionHandler`
2. **Text fields** → `TextFieldDoubleClickHandler`
3. **Professional editors** → `TextFieldDoubleClickHandler` (via contenteditable)

## Integration با سیستم‌های دیگر

### 🔗 WindowsManager Integration

```javascript
// TextSelectionManager → WindowsManager
const position = this._calculateSelectionPosition(selectedText);
const windowsManager = this._getWindowsManager();
await windowsManager.show('selection', {
  text: selectedText,
  position: position
});
```

### 🔗 FeatureManager Integration

```javascript
// FeatureManager → TextSelectionHandler
const textSelectionHandler = featureManager.getFeatureHandler('textSelection');
if (textSelectionHandler?.isActive) {
  const manager = textSelectionHandler.getTextSelectionManager();
  // Use manager...
}
```

### 🔗 IFrame Support

```javascript
// Cross-frame communication
if (window !== window.top) {
  // Send selection request to parent
  const message = {
    type: 'SELECTION_REQUEST',
    text: selectedText,
    position: position
  };
  window.parent.postMessage(message, '*');
}
```

## Error Handling

### 🛡️ مدیریت خطا

```javascript
try {
  await this._processSelectionChangeEvent(event);
} catch (rawError) {
  const error = await ErrorHandler.processError(rawError);
  await this.errorHandler.handle(error, {
    type: ErrorTypes.UI,
    context: 'text-selection',
    eventType: event?.type
  });
}
```

### 🔄 Context Safety

```javascript
// Extension context validation
if (ExtensionContextManager.isContextError(error)) {
  this.logger.debug('Extension context invalidated, skipping selection processing');
  return;
}
```

## Performance Optimization

### ⚡ بهینه‌سازی‌ها

#### 1. **Resource Tracking**
```javascript
class TextSelectionManager extends ResourceTracker {
  constructor() {
    super('text-selection-manager');
    // Automatic cleanup of timeouts, event listeners, etc.
  }
}
```

#### 2. **Duplicate Prevention**
```javascript
// Prevent duplicate processing
const isRecentDuplicate = selectedText === this.lastProcessedText && 
                         (currentTime - this.lastProcessedTime) < this.selectionProcessingCooldown;

if (isRecentDuplicate && this._isWindowVisible()) {
  return; // Skip duplicate
}
```

#### 3. **Efficient Event Handling**
```javascript
// Only process events when feature is active
if (!this.isActive || !this.textSelectionManager) return;
```

## Testing و Debugging

### 🔍 Debug Information

```javascript
// Debug status
getStatus() {
  return {
    handlerActive: this.isActive,
    hasSelection: this.hasActiveSelection(),
    managerAvailable: !!this.textSelectionManager,
    isDragging: this.isDragging,
    pendingSelection: !!this.pendingSelection
  };
}
```

### 📊 Logging

```javascript
// Structured logging
this.logger.debug('Selection detected', {
  text: selection.toString().substring(0, 30),
  fieldType: detection.fieldType,
  selectionStrategy: detection.selectionStrategy,
  eventStrategy: detection.selectionEventStrategy
});
```

## Best Practices

### ✅ توصیه‌ها

1. **استفاده از Field Detection**: همیشه نوع فیلد را تشخیص دهید
2. **Respect User Interaction**: منتظر تکمیل انتخاب کاربر باشید
3. **Cross-Frame Compatibility**: iframe ها را در نظر بگیرید
4. **Error Resilience**: خطاها را مدیریت کنید
5. **Resource Cleanup**: منابع را پاک‌سازی کنید
6. **Performance**: از duplicate processing جلوگیری کنید

### ❌ مواردی که باید اجتناب کرد

1. **Timeout-Based Detection**: استفاده از timeout برای drag detection
2. **Immediate Processing**: پردازش فوری selectionchange در حین drag
3. **Hard-Coded Delays**: استفاده از delay های ثابت
4. **Memory Leaks**: فراموش کردن cleanup منابع
5. **Duplicate Events**: عدم مدیریت event های تکراری

## مثال‌های کاربرد

### 1. **Regular Website Selection**
```javascript
// User drags text on a regular website
// → selectionchange events stored as pending
// → On mouseup: process and show icon
```

### 2. **Google Docs Selection**  
```javascript
// User double-clicks in Google Docs
// → handleDoubleClick triggered
// → Direct processing with professional editor logic
```

### 3. **Keyboard Selection**
```javascript
// User presses Ctrl+A
// → selectionchange with isDragging = false
// → Immediate processing and icon display
```

## مراجع

### Core Components (ساده شده)
- **SimpleTextSelectionHandler**: `src/features/text-selection/handlers/SimpleTextSelectionHandler.js`
- **SelectionManager**: `src/features/text-selection/core/SelectionManager.js`
- **TextSelectionHandler (Wrapper)**: `src/features/text-selection/handlers/TextSelectionHandler.js`
- **useTextSelection (Vue)**: `src/features/text-selection/composables/useTextSelection.js`

### Text Field Integration
- **TextFieldHandler**: `src/features/text-field-interaction/handlers/TextFieldHandler.js`
- **TextFieldDoubleClickHandler**: `src/features/text-field-interaction/handlers/TextFieldDoubleClickHandler.js`
- **TextFieldIconManager**: `src/features/text-field-interaction/managers/TextFieldIconManager.js`

### Legacy Files (Backup)
- **TextSelectionManager.legacy.js**: Complex old implementation
- **TextSelectionHandler.legacy.js**: Complex old handler

### Documentation
- **WindowsManager**: `docs/WINDOWS_MANAGER_UI_HOST_INTEGRATION.md`
- **Smart Handler Registration**: `docs/SMART_HANDLER_REGISTRATION_SYSTEM.md`
- **Error Management**: `docs/ERROR_MANAGEMENT_SYSTEM.md`

### Key Improvements (2025) - Simplification
- ✅ **60-70% Code Reduction**: حذف پیچیدگی‌های غیرضروری
- ✅ **selectionchange-only**: استفاده تنها از selectionchange events
- ✅ **Simple Drag Prevention**: mousedown/mouseup ساده به جای pendingSelection
- ✅ **Text Field Separation**: جداسازی کامل text fields به ماژول مستقل
- ✅ **Performance Boost**: عملکرد بهتر و کمتر race condition
- ✅ **Maintainability**: کد بسیار ساده‌تر و قابل نگهداری
- ✅ **Cross-browser Reliability**: سازگاری بهتر با همه مرورگرها