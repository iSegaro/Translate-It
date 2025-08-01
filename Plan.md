# Messaging System Standardization Plan
## پلن جامع یکپارچه‌سازی سیستم پیام‌رسانی

---

## 🎯 **مقدمه و هدف**

این پلن برای یکپارچه‌سازی سیستم messaging در extension Translate-It طراحی شده است. هدف اصلی حذف direct `browser.runtime.sendMessage` calls و استانداردسازی همه communications از طریق UnifiedMessenger است.

### **مزایای انتظاری:**
- حذف 50+ direct sendMessage calls
- یکپارچه‌سازی error handling
- بهبود Firefox MV3 compatibility
- Context-aware messaging با proper routing
- Consistent patterns برای maintenance آسان‌تر
- Improved debugging با centralized logging

---

## 📊 **تحلیل وضعیت فعلی**

### **مشکلات شناسایی شده:**

#### **1. Mixed Messaging Patterns:**
```javascript
// مشکل: Direct sendMessage calls (15+ فایل)
browser.runtime.sendMessage({ action: "TRANSLATE", data: {...} })

// راه‌حل: UnifiedMessenger (فقط 4 فایل استفاده می‌کنند)
const messenger = new UnifiedMessenger("context");
await messenger.sendMessage({ action: "TRANSLATE", data: {...} });
```

#### **2. فایل‌های Critical برای Migration:**

**Manager Classes (اولویت بالا):**
- `src/managers/tts-offscreen.js` - 9 direct sendMessage calls
- `src/managers/SelectionWindows.js` - multiple messaging calls
- `src/managers/capture-offscreen.js` - screen capture messaging
- `src/managers/tts-background.js` - Firefox TTS messaging

**Vue Components (اولویت متوسط):**
- `src/views/popup/PopupApp.vue` - popup messaging
- `src/views/sidepanel/components/SidepanelToolbar.vue` - sidepanel controls
- `src/components/popup/PopupHeader.vue` - header actions
- `src/composables/useSidepanelTTS.js` - TTS composable

**Handlers (اولویت پایین):**
- `src/handlers/command-handler.js` - keyboard shortcuts
- `src/handlers/subtitleHandler.js` - subtitle controls
- `src/handlers/ContentCaptureHandler.js` - capture handling
- `src/handlers/smartTranslationIntegration.js` - smart integration

**Content Scripts:**
- `src/content-scripts/vue-bridge.js` - Vue component injection
- `src/core/TranslationService.js` - translation service
- `src/app/main/*.js` - app entry points

#### **3. Architecture Issues:**
- **No Standard Pattern:** هر component روش messaging خودش را دارد
- **Error Handling Duplication:** try-catch blocks تکرار شده در همه جا
- **Context Confusion:** message contexts به درستی مشخص نیست
- **Firefox Compatibility:** MV3 compatibility issues خاص Firefox

---

## 🚀 **پلن کامل 4 فازی**

### **PHASE 1: Enhanced UnifiedMessenger Foundation** 
**مدت تخمینی: 1 session**  
**اولویت: بحرانی ⚠️**

#### **1.1: Enhanced UnifiedMessenger**
ایجاد enhanced version از UnifiedMessenger با قابلیت‌های اضافی:

```javascript
// src/core/EnhancedUnifiedMessenger.js
export class EnhancedUnifiedMessenger extends UnifiedMessenger {
  constructor(context) {
    super(context);
    this.specialized = {
      tts: new TTSMessenger(context),
      capture: new CaptureMessenger(context),
      selection: new SelectionMessenger(context),
      translation: new TranslationMessenger(context)
    };
  }

  // Specialized methods
  async speakText(text, language, options = {}) { /* TTS specific */ }
  async captureScreen(options = {}) { /* Screen capture specific */ }
  async selectElement(mode = "translate") { /* Element selection specific */ }
  async translateText(text, options = {}) { /* Translation specific */ }
}
```

#### **1.2: MessagingStandards Class**
Factory pattern برای context-specific messengers:

```javascript
// src/core/MessagingStandards.js
export class MessagingStandards {
  static contexts = {
    POPUP: 'popup',
    SIDEPANEL: 'sidepanel',
    OPTIONS: 'options',
    BACKGROUND: 'background',
    CONTENT: 'content',
    OFFSCREEN: 'offscreen'
  };
  
  static getMessenger(context) {
    if (!this.instances.has(context)) {
      this.instances.set(context, new EnhancedUnifiedMessenger(context));
    }
    return this.instances.get(context);
  }
  
  static standardMessageFormat(action, data, context) {
    return {
      action,
      data,
      context,
      messageId: this.generateMessageId(context),
      timestamp: Date.now()
    };
  }
}
```

#### **1.3: Context-Aware Routing**
بهبود message routing با context awareness:

```javascript
// Enhanced message routing در background service
handleMessage(message, sender) {
  const { context, action } = message;
  
  // Route based on context
  switch (context) {
    case 'popup':
      return this.handlePopupMessage(message);
    case 'sidepanel':
      return this.handleSidepanelMessage(message);
    case 'content':
      return this.handleContentMessage(message);
    case 'offscreen':
      return this.handleOffscreenMessage(message);
    default:
      return this.handleGenericMessage(message);
  }
}
```

#### **1.4: Firefox MV3 Compatibility**
بهبود Firefox compatibility در UnifiedMessenger:

```javascript
// Enhanced Firefox handling
async sendMessage(message, timeout = 10000) {
  // Firefox MV3 specific handling
  if (this.isFirefox && this.isMV3) {
    return this.handleFirefoxMV3Message(message, timeout);
  }
  
  // Standard handling for Chrome
  return super.sendMessage(message, timeout);
}
```

#### **✅ Phase 1 Success Criteria:**
- EnhancedUnifiedMessenger class ایجاد شود
- MessagingStandards factory pattern کار کند
- Context-aware routing پیاده‌سازی شود
- Firefox MV3 compatibility بهبود یابد
- All tests pass
- Build موفق باشد

---

### **PHASE 2: Manager Classes Migration**
**مدت تخمینی: 1 session**  
**اولویت: بالا 🔥**

#### **2.1: TTS Managers Migration**

**فایل‌ها:**
- `src/managers/tts-offscreen.js` (9 sendMessage calls)
- `src/managers/tts-background.js` (Firefox-specific)
- `src/composables/useSidepanelTTS.js` (Vue composable)

**نمونه Migration:**
```javascript
// Before (tts-offscreen.js)
browser.runtime.sendMessage({
  action: "TTS_SPEAK",
  text: text,
  language: language
});

// After
const messenger = MessagingStandards.getMessenger('offscreen');
await messenger.specialized.tts.speak(text, language, options);
```

#### **2.2: Screen Capture Managers Migration**

**فایل‌ها:**
- `src/managers/capture-offscreen.js` (Chrome capture)
- `src/handlers/ContentCaptureHandler.js` (content-specific)

**Migration Pattern:**
```javascript
// Before
const response = await browser.runtime.sendMessage({
  action: "SCREEN_CAPTURE",
  mode: "selection"
});

// After  
const messenger = MessagingStandards.getMessenger('content');
await messenger.specialized.capture.captureScreen({ mode: "selection" });
```

#### **2.3: Selection Managers Migration**

**فایل‌ها:**
- `src/managers/SelectionWindows.js` (UI selection)
- `src/content-scripts/select-element-manager.js` (element selection)

**Migration Strategy:**
```javascript
// Before
browser.runtime.sendMessage({
  action: "activateSelectElementMode",
  tabId: tabId
});

// After
const messenger = MessagingStandards.getMessenger('content');
await messenger.specialized.selection.activateMode('element', { tabId });
```

#### **✅ Phase 2 Success Criteria:**
- همه TTS messaging operations از EnhancedUnifiedMessenger استفاده کنند
- Screen capture messaging یکپارچه شود
- Element selection messaging استاندارد شود
- Error handling consistent باشد
- Firefox compatibility حفظ شود

---

### **PHASE 3: Vue Components Migration**
**مدت تخمینی: 1 session**  
**اولویت: متوسط 📊**

#### **3.1: Popup Components Migration**

**فایل‌ها:**
- `src/views/popup/PopupApp.vue` - main popup app
- `src/components/popup/PopupHeader.vue` - header actions
- `src/app/main/popup.js` - popup entry point

**Vue Integration Pattern:**
```javascript
// Before (در Vue component)
import browser from 'webextension-polyfill';
await browser.runtime.sendMessage({ action: "TRANSLATE", data: {...} });

// After
import { MessagingStandards } from '@/core/MessagingStandards.js';
const messenger = MessagingStandards.getMessenger('popup');
await messenger.specialized.translation.translate(text, options);
```

#### **3.2: Sidepanel Components Migration**

**فایل‌ها:**
- `src/views/sidepanel/components/SidepanelToolbar.vue`
- `src/app/main/sidepanel.js`

**Composable Integration:**
```javascript
// Enhanced useBrowserAPI با messaging support
export function useBrowserAPI() {
  const messenger = MessagingStandards.getMessenger('sidepanel');
  
  return {
    // ... existing methods
    messenger, // Expose messenger for specialized use
    sendMessage: messenger.sendMessage.bind(messenger),
    translateText: messenger.specialized.translation.translate.bind(messenger.specialized.translation)
  };
}
```

#### **3.3: Composables Enhancement**

**فایل‌ها:**
- `src/composables/useSidepanelTTS.js` - TTS composable
- `src/composables/useBrowserAPI.js` - browser API wrapper

**Enhanced Composable Pattern:**
```javascript
// src/composables/useMessaging.js (جدید)
export function useMessaging(context) {
  const messenger = MessagingStandards.getMessenger(context);
  
  return {
    sendMessage: messenger.sendMessage.bind(messenger),
    tts: messenger.specialized.tts,
    capture: messenger.specialized.capture,
    selection: messenger.specialized.selection,
    translation: messenger.specialized.translation
  };
}
```

#### **✅ Phase 3 Success Criteria:**
- همه Vue components از MessagingStandards استفاده کنند
- Composables یکپارچه و enhanced شوند
- Vue-specific messaging patterns استاندارد شوند
- Error handling در Vue context بهبود یابد
- Bundle size increase نداشته باشیم

---

### **PHASE 4: Handler Classes & Content Scripts Migration**
**مدت تخمینی: 1 session**  
**اولویت: پایین 📋**

#### **4.1: Event Handlers Migration**

**فایل‌ها:**
- `src/handlers/command-handler.js` - keyboard shortcuts
- `src/handlers/subtitleHandler.js` - subtitle controls
- `src/handlers/context-menu-handler.js` - context menu

**Handler Pattern:**
```javascript
// Before
export class CommandHandler {
  async handleShortcut(command) {
    await browser.runtime.sendMessage({
      action: "HANDLE_COMMAND",
      command: command
    });
  }
}

// After
export class CommandHandler {
  constructor() {
    this.messenger = MessagingStandards.getMessenger('background');
  }
  
  async handleShortcut(command) {
    await this.messenger.sendMessage({
      action: "HANDLE_COMMAND",
      command: command
    });
  }
}
```

#### **4.2: Integration Handlers Migration**

**فایل‌ها:**
- `src/handlers/smartTranslationIntegration.js` - smart integration
- `src/handlers/ContentCaptureHandler.js` - capture integration

#### **4.3: Content Scripts Migration**

**فایل‌ها:**
- `src/content-scripts/vue-bridge.js` - Vue component injection
- `src/core/TranslationService.js` - translation service
- `src/app/main/*.js` - app entry points

**Content Script Pattern:**
```javascript
// Enhanced content script messaging
import { MessagingStandards } from '@/core/MessagingStandards.js';

class ContentScript {
  constructor() {
    this.messenger = MessagingStandards.getMessenger('content');
  }
  
  async communicateWithBackground(action, data) {
    return await this.messenger.sendMessage({ action, data });
  }
}
```

#### **✅ Phase 4 Success Criteria:**
- همه handler classes از MessagingStandards استفاده کنند
- Content scripts messaging یکپارچه شود
- App entry points استاندارد شوند
- Integration handlers بهبود یابند

---

## 🧪 **Testing & Validation Strategy**

### **Unit Tests:**
```javascript
// src/core/__tests__/EnhancedUnifiedMessenger.test.js
describe('EnhancedUnifiedMessenger', () => {
  test('should handle specialized TTS messaging', async () => {
    const messenger = new EnhancedUnifiedMessenger('test');
    const result = await messenger.specialized.tts.speak('test', 'en');
    expect(result.success).toBe(true);
  });
});

// src/core/__tests__/MessagingStandards.test.js
describe('MessagingStandards', () => {
  test('should create context-specific messengers', () => {
    const popupMessenger = MessagingStandards.getMessenger('popup');
    const sidepanelMessenger = MessagingStandards.getMessenger('sidepanel');
    expect(popupMessenger.context).toBe('popup');
    expect(sidepanelMessenger.context).toBe('sidepanel');
  });
});
```

### **Integration Tests:**
```javascript
// Test cross-context messaging
describe('Cross-Context Messaging', () => {
  test('popup to background communication', async () => {
    const popupMessenger = MessagingStandards.getMessenger('popup');
    const result = await popupMessenger.specialized.translation.translate('test');
    expect(result.translation).toBeDefined();
  });
});
```

### **Build Validation:**
```bash
# هر فاز بعد از completion
pnpm run test:vue:run
pnpm run build:chrome  
pnpm run build:firefox
pnpm run validate
```

---

## 🎯 **AI Session Guidelines**

### **Session Handoff Protocol:**

#### **شروع Session جدید:**
1. **Status Check**: "Which phase should I start/continue?"
2. **Context Loading**: خواندن فایل Plan.md و بررسی progress
3. **Current Phase Analysis**: بررسی completed checkboxes
4. **Issue Review**: بررسی مشکلات session قبلی

#### **Quality Gates:**
هر فاز قبل از completion باید:
- [ ] All target files migrated
- [ ] Unit tests pass (pnpm run test:vue:run)
- [ ] Build successful (both Chrome & Firefox)
- [ ] No console errors during basic functionality test
- [ ] Performance regression check

#### **Emergency Rollback:**
اگر مشکل بحرانی پیش آید:
1. **Stop immediately**
2. **Document issue thoroughly**
3. **Git rollback** to last working state
4. **Analyze root cause**
5. **Adjust plan** if needed
6. **Resume with fixes**

### **Implementation Standards:**

#### **Code Quality:**
```javascript
// Always use try-catch in messaging
try {
  const result = await messenger.sendMessage(message);
  return result;
} catch (error) {
  console.error(`[${context}] Messaging error:`, error);
  throw error;
}

// Always validate message format
const message = MessagingStandards.standardMessageFormat(action, data, context);

// Always use proper TypeScript types (future enhancement)
interface MessageData {
  action: string;
  data: any;
  context: string;
  messageId: string;
  timestamp: number;
}
```

#### **Error Handling Standards:**
```javascript
// Consistent error handling pattern
class MessagingError extends Error {
  constructor(message, context, originalError) {
    super(message);
    this.name = 'MessagingError';
    this.context = context;
    this.originalError = originalError;
  }
}
```

#### **Logging Standards:**
```javascript
// Consistent logging pattern
console.log(`[${context}] ${action}: ${JSON.stringify(data)}`);
console.error(`[${context}] ${action} failed:`, error);
```

---

## 📊 **Expected Results & Metrics**

### **Performance Improvements:**
- **-50+ direct sendMessage calls** eliminated
- **Unified error handling** reduces code duplication by ~30%
- **Better message routing** improves response time by ~15%
- **Context awareness** reduces debugging time by ~40%

### **Code Quality Metrics:**
- **Maintainability Index**: +25% improvement
- **Code Duplication**: -30% reduction  
- **Error Handling Coverage**: +40% improvement
- **Cross-browser Compatibility**: +20% improvement

### **Bundle Size Impact:**
- **New Code Added**: ~15KB (EnhancedUnifiedMessenger + MessagingStandards)
- **Code Removed**: ~25KB (duplicate messaging patterns)
- **Net Reduction**: ~10KB total bundle size

### **Browser Compatibility:**
- **Chrome**: Full compatibility maintained
- **Firefox MV3**: Improved compatibility with better error handling
- **Edge**: Better support through webextension-polyfill
- **Safari**: Future compatibility prepared

---

## 🚨 **Critical Notes**

### **⚠️ نکات مهم برای AI:**

1. **Backward Compatibility**: هیچ‌گاه existing functionality را break نکنید
2. **Step-by-Step**: همیشه فایل به فایل migration کنید
3. **Test Each Change**: هر تغییر را بلافاصله test کنید
4. **Document Issues**: هر مشکلی را دقیق document کنید
5. **Context Awareness**: همیشه context درست را برای messaging استفاده کنید

### **🔥 Files خطرناک:**
این فایل‌ها critical هستند و باید با احتیاط migration شوند:
- `src/background/index.js` - main background service
- `src/core/UnifiedMessenger.js` - existing messenger
- `src/composables/useBrowserAPI.js` - browser API wrapper
- `manifest.json` - اصلاً تغییر نداد

### **✅ Files ایمن:**
این فایل‌ها safe برای migration هستند:
- Manager classes در `src/managers/`
- Handler classes در `src/handlers/`  
- Vue components در `src/components/` و `src/views/`
- Composables در `src/composables/`

---

## 📋 **Checklist Template برای AI**

### **Phase Start Checklist:**
- [ ] Plan.md file خوانده شده
- [ ] Current phase identified
- [ ] Target files listed
- [ ] Dependencies checked
- [ ] Backup strategy planned

### **Development Checklist:**
- [ ] EnhancedUnifiedMessenger implemented
- [ ] MessagingStandards factory created
- [ ] Target files migrated
- [ ] Error handling updated
- [ ] Context routing implemented

### **Testing Checklist:**
- [ ] Unit tests written/updated
- [ ] Integration tests pass
- [ ] Build successful (Chrome)
- [ ] Build successful (Firefox)
- [ ] Manual functionality test

### **Completion Checklist:**
- [ ] All success criteria met
- [ ] Documentation updated
- [ ] Performance validated
- [ ] Next phase prepared
- [ ] Issues documented

---

**این plan کامل و جامع است. AI می‌تواند با دنبال کردن این مراحل، messaging system را به طور کامل استاندارد کند.**