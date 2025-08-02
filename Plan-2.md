# Project Structure Reorganization Plan
## پلن جامع سازماندهی مجدد ساختار پروژه

---

## 🎯 **هدف کلی**

سازماندهی مجدد ساختار پروژه Translate-It برای ایجاد یک معماری خوانا، قابل نگهداری و مقیاس‌پذیر. این پلن به ۵ فاز تقسیم شده که هر فاز را می‌توان در session های جداگانه اجرا کرد.

## 📊 **وضعیت فعلی - مشکلات شناسایی شده**

### 🔴 **مشکلات اصلی:**
1. **سیستم Messaging پراکنده**: 4 approach مختلف در فایل‌های مختلف
2. **سیستم Storage غیرمنظم**: چندین interface بدون hierarchy واضح
3. **Manager Classes بهم ریخته**: managers در locations مختلف
4. **Provider System تکراری**: providers در چندین location
5. **Handler Functions نامنظم**: handlers با conventions مختلف
6. **Utility Functions پراکنده**: 20+ utility در یک folder بدون دسته‌بندی

---

## 🏗️ **ساختار هدف - معماری نهایی**

```
src/
├── 🔵 messaging/                      # سیستم پیام‌رسانی یکپارچه
│   ├── core/
│   │   ├── MessagingCore.js           # هسته اصلی (تجمیع UnifiedMessenger + MessagingStandards)
│   │   ├── MessageActions.js          # تمام action constants
│   │   ├── MessageFormat.js           # فرمت استاندارد پیام‌ها
│   │   └── MessageContexts.js         # تعریف contexts
│   ├── specialized/                   # specialized messengers
│   │   ├── TTSMessenger.js
│   │   ├── CaptureMessenger.js
│   │   ├── TranslationMessenger.js
│   │   └── SelectionMessenger.js
│   ├── composables/
│   │   └── useMessaging.js            # Vue integration
│   └── __tests__/
│
├── 🟢 storage/                        # سیستم ذخیره‌سازی یکپارچه
│   ├── core/
│   │   ├── StorageCore.js             # StorageManager اصلی
│   │   ├── CacheEngine.js             # cache management logic
│   │   ├── SecureStorage.js           # encryption utilities
│   │   └── StorageEvents.js           # event system
│   ├── modules/                       # domain-specific storage
│   │   ├── SettingsStorage.js
│   │   ├── HistoryStorage.js
│   │   ├── TranslationStorage.js
│   │   └── ProviderConfigStorage.js
│   ├── composables/
│   │   ├── useStorage.js              # main storage composable
│   │   └── useStorageItem.js          # single item composable
│   └── __tests__/
│
├── 🟡 managers/                       # مدیریت services و features
│   ├── core/                          # مدیران اصلی
│   │   ├── FeatureManager.js
│   │   ├── IconManager.js
│   │   ├── NotificationManager.js
│   │   └── LifecycleManager.js
│   ├── browser-specific/              # مدیران مخصوص browser
│   │   ├── tts/
│   │   │   ├── TTSManager.js          # unified TTS manager
│   │   │   ├── TTSChrome.js           # Chrome-specific implementation
│   │   │   ├── TTSFirefox.js          # Firefox-specific implementation
│   │   │   └── TTSContent.js          # content script implementation
│   │   ├── capture/
│   │   │   ├── CaptureManager.js
│   │   │   ├── CaptureOffscreen.js    # Chrome offscreen
│   │   │   └── CaptureContent.js      # Firefox content fallback
│   │   └── panel/
│   │       ├── SidepanelManager.js    # Chrome sidepanel
│   │       └── SidebarManager.js      # Firefox sidebar
│   ├── content/                       # content script managers
│   │   ├── SelectionManager.js        # element selection
│   │   ├── WindowsManager.js          # floating windows
│   │   └── VueBridgeManager.js        # Vue component injection
│   └── __tests__/
│
├── 🔴 handlers/                       # event و message handlers
│   ├── background/                    # background service handlers
│   │   ├── translation/               # (keep existing structure)
│   │   ├── tts/
│   │   ├── capture/
│   │   └── ...
│   ├── content/                       # content script handlers
│   │   ├── SelectionHandler.js
│   │   ├── CaptureHandler.js
│   │   └── TTSHandler.js
│   ├── lifecycle/                     # extension lifecycle
│   │   ├── InstallHandler.js
│   │   ├── UpdateHandler.js
│   │   └── MigrationHandler.js
│   └── __tests__/
│
├── 🟣 providers/                      # translation providers
│   ├── core/
│   │   ├── BaseProvider.js
│   │   ├── ProviderFactory.js
│   │   └── ProviderRegistry.js
│   ├── implementations/
│   │   ├── google/
│   │   │   ├── GoogleTranslate.js
│   │   │   └── GoogleGemini.js
│   │   ├── openai/
│   │   │   ├── OpenAI.js
│   │   │   └── OpenRouter.js
│   │   ├── microsoft/
│   │   │   └── BingTranslate.js
│   │   ├── browser/
│   │   │   └── BrowserAPI.js
│   │   └── custom/
│   │       ├── DeepSeek.js
│   │       ├── WebAI.js
│   │       └── CustomProvider.js
│   └── __tests__/
│
├── 🔶 services/                       # business logic services
│   ├── TranslationService.js          # main translation logic
│   ├── HistoryService.js              # translation history
│   ├── ExclusionService.js            # site exclusion
│   ├── ValidationService.js           # input validation
│   └── __tests__/
│
├── 🟠 utils/                          # utility functions منظم‌سازی شده
│   ├── core/                          # core utilities
│   │   ├── helpers.js                 # general helpers
│   │   ├── debounce.js
│   │   ├── validation.js
│   │   └── logger.js
│   ├── browser/                       # browser compatibility
│   │   ├── compatibility.js
│   │   ├── feature-detection.js
│   │   ├── platform.js
│   │   └── events.js
│   ├── i18n/                          # internationalization
│   │   ├── i18n.js                    # main i18n system
│   │   ├── localization.js
│   │   └── languages.js
│   ├── text/                          # text processing
│   │   ├── extraction.js
│   │   ├── detection.js
│   │   ├── markdown.js
│   │   └── cleaning.js
│   ├── ui/                            # UI utilities
│   │   ├── theme.js
│   │   ├── html-sanitizer.js
│   │   ├── modal.js
│   │   └── tooltip.js
│   └── framework/                     # framework compatibility
│       └── vue-compat.js
│
├── 📱 components/                     # Vue components (keep existing)
├── 📄 views/                          # Vue pages (keep existing)
├── 🗂️ store/                          # Pinia stores (keep existing)
├── 🎨 composables/                    # Vue composables (keep existing + new ones)
├── ⚙️ config/                         # configuration (keep existing)
├── 🎯 background/                     # background service core
├── 📄 content-scripts/                # content scripts
└── 🧪 __tests__/                      # global tests
```

---

## 🚀 **پلن اجرایی - 5 فاز**

### **PHASE 1: Messaging System Consolidation** 
**مدت تخمینی: 1-2 sessions**  
**اولویت: 🔥 بحرانی**

#### **1.1: تحلیل و آماده‌سازی**
- [ ] بررسی دقیق فایل‌های messaging موجود
- [ ] شناسایی dependencies و usage patterns
- [ ] تعیین فایل‌های قابل حذف

#### **1.2: ایجاد ساختار جدید**
```bash
mkdir -p src/messaging/{core,specialized,composables,__tests__}
```

#### **1.3: فایل‌های برای انتقال:**
**Source Files → Target Location:**
- `src/core/MessagingStandards.js` → `src/messaging/core/MessagingCore.js`
- `src/core/EnhancedUnifiedMessenger.js` → `src/messaging/core/MessagingCore.js` (merge)
- `src/core/MessageActions.js` → `src/messaging/core/MessageActions.js`
- `src/core/UnifiedMessenger.js` → **DEPRECATED** (functionality moved to MessagingCore)
- `src/core/SimpleMessageHandler.js` → **KEEP** (background handler, not client)

#### **1.4: Specialized Messengers:**
Extract من `EnhancedUnifiedMessenger.specialized`:
- `TTSMessenger` → `src/messaging/specialized/TTSMessenger.js`
- `CaptureMessenger` → `src/messaging/specialized/CaptureMessenger.js`
- `TranslationMessenger` → `src/messaging/specialized/TranslationMessenger.js`
- `SelectionMessenger` → `src/messaging/specialized/SelectionMessenger.js`

#### **1.5: Vue Integration:**
- `src/composables/useMessaging.js` → `src/messaging/composables/useMessaging.js`
- Update `src/composables/useBrowserAPI.js` to use new messaging system

#### **1.6: Update Imports:**
**Critical Files با messaging imports:**
- All Vue components in `src/components/`
- All Vue views in `src/views/`
- All managers in `src/managers/`
- All handlers در content scripts

#### **✅ Phase 1 Success Criteria:**
- [ ] Single `MessagingCore` class handles all messaging
- [ ] All specialized messengers extracted and working
- [ ] All imports updated successfully
- [ ] Tests pass: `pnpm run test:vue:run`
- [ ] Build successful: `pnpm run build:chrome && pnpm run build:firefox`
- [ ] No console errors in extension functionality

---

### **PHASE 2: Storage System Unification**
**مدت تخمینی: 1 session**  
**اولویت: 🔥 بالا**

#### **2.1: ایجاد ساختار جدید**
```bash
mkdir -p src/storage/{core,modules,composables,__tests__}
```

#### **2.2: فایل‌های برای انتقال:**
**Core Storage:**
- `src/core/StorageManager.js` → `src/storage/core/StorageCore.js`
- `src/utils/secureStorage.js` → `src/storage/core/SecureStorage.js`

**Storage Modules:**
Create specialized modules:
- `src/storage/modules/SettingsStorage.js` (extract from enhanced-settings store)
- `src/storage/modules/HistoryStorage.js` 
- `src/storage/modules/TranslationStorage.js`
- `src/storage/modules/ProviderConfigStorage.js`

**Composables:**
- `src/composables/useStorage.js` → `src/storage/composables/useStorage.js`
- Create `src/storage/composables/useStorageItem.js`

#### **2.3: Update Integrations:**
- Update `src/composables/useBrowserAPI.js` storage methods
- Update `src/store/core/settings.js` to use new storage system
- Update all managers using storage

#### **✅ Phase 2 Success Criteria:**
- [ ] Single `StorageCore` handles all storage operations
- [ ] Specialized storage modules working
- [ ] All storage imports updated
- [ ] Options page save/load working correctly
- [ ] All storage-related tests pass

---

### **PHASE 3: Manager Classes Reorganization**
**مدت تخمینی: 1-2 sessions**  
**اولویت: 🟡 متوسط**

#### **3.1: ایجاد ساختار جدید**
```bash
mkdir -p src/managers/{core,browser-specific/{tts,capture,panel},content,__tests__}
```

#### **3.2: Core Managers:**
**Current Location → New Location:**
- `src/core/FeatureManager.js` → `src/managers/core/FeatureManager.js`
- `src/managers/NotificationManager.js` → `src/managers/core/NotificationManager.js`
- Create `src/managers/core/LifecycleManager.js` (extract from background)

#### **3.3: Browser-Specific Managers:**
**TTS Managers:**
- `src/managers/tts-offscreen.js` → `src/managers/browser-specific/tts/TTSChrome.js`
- `src/managers/tts-background.js` → `src/managers/browser-specific/tts/TTSFirefox.js`
- `src/managers/tts-content.js` → `src/managers/browser-specific/tts/TTSContent.js`
- Create `src/managers/browser-specific/tts/TTSManager.js` (unified interface)

**Capture Managers:**
- `src/managers/capture-offscreen.js` → `src/managers/browser-specific/capture/CaptureOffscreen.js`
- `src/capture/CaptureManager.js` → `src/managers/browser-specific/capture/CaptureManager.js`
- Create content fallback: `src/managers/browser-specific/capture/CaptureContent.js`

**Panel Managers:**
- `src/managers/sidepanel-chrome.js` → `src/managers/browser-specific/panel/SidepanelManager.js`
- `src/managers/sidebar-firefox.js` → `src/managers/browser-specific/panel/SidebarManager.js`

#### **3.4: Content Managers:**
- `src/managers/SelectionWindows.js` → `src/managers/content/WindowsManager.js`
- `src/content-scripts/select-element-manager.js` → `src/managers/content/SelectionManager.js`
- `src/content-scripts/vue-bridge.js` → `src/managers/content/VueBridgeManager.js`

#### **✅ Phase 3 Success Criteria:**
- [x] All managers organized by responsibility
- [x] Browser-specific implementations properly separated
- [x] Unified interfaces for cross-browser features
- [x] All manager imports updated
- [x] Extension functionality preserved

---

### **PHASE 4: Provider System & Services Organization**
**مدت تخمینی: 1 session**  
**اولویت: 🟡 متوسط**

#### **4.1: Provider System Cleanup**
```bash
# Remove duplicate provider folder
rm -rf src/providers/  # (empty folder)

# Reorganize existing providers
mkdir -p src/providers/{core,implementations/{google,openai,microsoft,browser,custom},__tests__}
```

#### **4.2: Provider Organization:**
**Current Structure → New Structure:**
- `src/background/providers/BaseTranslationProvider.js` → `src/providers/core/BaseProvider.js`
- `src/background/providers/TranslationProviderFactory.js` → `src/providers/core/ProviderFactory.js`
- Create `src/providers/core/ProviderRegistry.js`

**Provider Implementations:**
- Google providers → `src/providers/implementations/google/`
- OpenAI providers → `src/providers/implementations/openai/`
- Microsoft providers → `src/providers/implementations/microsoft/`
- Browser API → `src/providers/implementations/browser/`
- Custom providers → `src/providers/implementations/custom/`

#### **4.3: Services Creation**
```bash
mkdir -p src/services/__tests__
```

**Extract Business Logic:**
- `src/core/TranslationService.js` → `src/services/TranslationService.js` (enhance)
- Create `src/services/HistoryService.js`
- Create `src/services/ExclusionService.js`
- Create `src/services/ValidationService.js`

#### **✅ Phase 4 Success Criteria:**
- [x] Provider system organized by vendor/type
- [x] Business logic extracted to services
- [x] Clean separation of concerns
- [x] All provider tests working

---

### **PHASE 5: Utilities & Handler Organization**
**مدت تخمینی: 1 session**  
**اولویت: 🟢 پایین**

#### **5.1: Utilities Reorganization**
```bash
mkdir -p src/utils/{core,browser,i18n,text,ui,framework}
```

**Current Files → New Organization:**

**Core Utilities:**
- `src/utils/helpers.js` → `src/utils/core/helpers.js`
- `src/utils/debounce.js` → `src/utils/core/debounce.js`
- `src/utils/logger.js` → `src/utils/core/logger.js`

**Browser Utilities:**
- `src/utils/environment.js` → `src/utils/browser/compatibility.js`
- `src/utils/browser-capabilities.js` → `src/utils/browser/feature-detection.js`
- `src/utils/simulateEvents.js` → `src/utils/browser/events.js`

**I18n Utilities:**
- Keep `src/utils/i18n.js` → `src/utils/i18n/i18n.js`
- `src/utils/localization.js` → `src/utils/i18n/localization.js`
- `src/utils/language-helpers.js` → `src/utils/i18n/languages.js`

**Text Processing:**
- `src/utils/textExtraction.js` → `src/utils/text/extraction.js`
- `src/utils/advanced-text-extraction.js` → `src/utils/text/detection.js`
- `src/utils/simpleMarkdown.js` → `src/utils/text/markdown.js`

**UI Utilities:**
- `src/utils/theme.js` → `src/utils/ui/theme.js`
- `src/utils/safeHtml.js` → `src/utils/ui/html-sanitizer.js`
- `src/utils/exclusion.js` → `src/utils/ui/exclusion.js`

#### **5.2: Handler Organization**
```bash
mkdir -p src/handlers/{content,lifecycle}
```

**Content Handlers:**
- `src/handlers/ContentCaptureHandler.js` → `src/handlers/content/CaptureHandler.js`
- `src/content-scripts/content-tts-handler.js` → `src/handlers/content/TTSHandler.js`

**Lifecycle Handlers:**
- Extract installation logic → `src/handlers/lifecycle/InstallHandler.js`
- Extract migration logic → `src/handlers/lifecycle/MigrationHandler.js`

#### **✅ Phase 5 Success Criteria:**
- [ ] All utilities organized by functional domain
- [ ] Handlers properly categorized
- [ ] No duplicate functionality
- [ ] Clean import paths
- [ ] All functionality preserved

---

## 🧪 **Testing Strategy برای هر فاز**

### **Testing Commands:**
```bash
# Unit Tests
pnpm run test:vue:run

# Build Tests  
pnpm run build:chrome
pnpm run build:firefox

# E2E Tests (if available)
pnpm run test:e2e

# Manual Testing Checklist
# - Options page save/load
# - Popup functionality
# - Translation operations
# - TTS functionality
# - Element selection
# - Context menu operations
```

### **Rollback Strategy:**
```bash
# Create backup before each phase
git checkout -b phase-X-backup
git add -A && git commit -m "Backup before Phase X"

# If issues occur:
git checkout main
git reset --hard phase-X-backup
```

---

## 🎯 **Success Metrics کلی**

### **Code Quality:**
- [ ] **Bundle Size**: حداکثر 5% افزایش (acceptable برای بهتر شدن organization)
- [ ] **Build Time**: حداکثر 10% افزایش
- [ ] **Import Paths**: تمام imports منطقی و خوانا باشند

### **Functionality:**
- [ ] **Extension Core**: تمام عملکردهای اصلی حفظ شوند
- [ ] **Cross-browser**: Chrome و Firefox هر دو کار کنند  
- [ ] **Performance**: هیچ regression در performance نباشد

### **Developer Experience:**
- [ ] **File Finding**: آسان پیدا کردن فایل مورد نظر
- [ ] **Clear Responsibility**: واضح بودن مسئولیت هر فایل
- [ ] **Consistent Patterns**: الگوهای consistent در کل codebase

---

## 📋 **AI Session Guidelines**

### **شروع هر Session:**
1. **Status Check**: بررسی completed phases و current phase
2. **Plan Review**: خواندن مرحله فعلی از این Plan
3. **Backup Creation**: ایجاد git backup branch
4. **Dependency Analysis**: بررسی dependencies فایل‌های target

### **حین اجرای هر Phase:**
1. **Step-by-Step**: اجرای مرحله‌ای تغییرات
2. **Import Updates**: بروزرسانی فوری imports بعد از هر move
3. **Test After Each Step**: تست کردن بعد از هر گروه file moves
4. **Immediate Fix**: اصلاح فوری هر مشکل پیش آمده

### **پایان هر Session:**
1. **Success Criteria Check**: بررسی criteria های phase
2. **Complete Testing**: اجرای کامل test suite
3. **Status Update**: بروزرسانی progress در Plan
4. **Next Phase Preparation**: آماده‌سازی برای phase بعدی

### **Emergency Procedures:**
- **فوری stop** اگر build شکست
- **فوری rollback** اگر functionality کلیدی خراب شد
- **مستندسازی دقیق** هر مشکل encountered

---

**این plan کامل و مرحله‌ای است. هر AI session می‌تواند یک phase را کامل اجرا کند و پروژه را به سمت ساختار بهتر پیش ببرد.**
