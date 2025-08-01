# Architecture Documentation - Translate-It Extension

## Overview
این پروژه یک browser extension برای ترجمه هوشمند با استفاده از AI/Translator Services است که در حال انتقال از JavaScript ساده به Vue.js architecture قرار دارد. پروژه از Manifest V3 پشتیبانی می‌کند و با Chrome و Firefox سازگار است.

## Core Architecture Components

### 1. Message Handling System (سیستم مسیج هندلینگ)

#### **مشکل کلیدی شناسایی شده: تداخل سیستم‌های messaging**

پروژه دارای **سه سیستم messaging متفاوت** است که باعث پیچیدگی و تداخل شده:

1. **SimpleMessageHandler** (`src/core/SimpleMessageHandler.js`)
   - سیستم اصلی message handling 
   - استفاده از webextension-polyfill برای cross-browser compatibility
   - فعال در background script

2. **MessageRouter** (`src/background/message-router.js`)
   - سیستم routing قدیمی که هنوز موجود است
   - **مشکل: استفاده نمی‌شود ولی کدهایش باقی مانده**
   - دارای error handling جداگانه

3. **VueMessageHandler** (`src/background/vue-message-handler.js`)
   - برای handling پیام‌های Vue apps
   - کارکرد محدود به Vue-specific actions
   - **مشکل: register method اش کار نمی‌کند**

#### **تصمیم معماری فعلی:**
- **SimpleMessageHandler** به عنوان main messaging system استفاده می‌شود
- همه handlers در background/index.js ثبت می‌شوند
- MessageRouter استفاده نمی‌شود **ولی کدهایش حذف نشده**

### 2. Background Service Architecture

#### **BackgroundService Class** (`src/background/index.js`)
- Main entry point برای background script
- مدیریت initialization تمام services
- ثبت تمام message handlers

```javascript
// الگوی فعلی registration:
this.messageHandler.registerHandler("ping", Handlers.handlePing);
this.messageHandler.registerHandler("TRANSLATE", Handlers.handleTranslate);
// ... 40+ handlers registered
```

#### **مشکل شناسایی شده:**
- **Translation Engine** و **BackgroundService** دارای overlapping functionality هستند
- برخی handlers در چندین جا define شده‌اند

### 3. Translation System Architecture

#### **سیستم‌های ترجمه موجود:**

1. **TranslationEngine** (`src/background/translation-engine.js`)
   - Main translation orchestrator
   - مدیریت providers و caching

2. **TranslationHandler** (`src/core/TranslationHandler.js`)
   - **Legacy system** - احتمالاً استفاده نمی‌شود
   - **باید بررسی شود که آیا safe to remove است**

3. **UnifiedTranslationClient** (`src/core/UnifiedTranslationClient.js`)
   - Client-side translation interface
   - استفاده از UnifiedMessenger

4. **Translation Providers** (`src/background/providers/`)
   - 10+ provider implementations
   - Factory pattern for provider management

### 4. Vue Integration System

#### **Vue Apps:**
- **Options Page**: کاملاً migrate شده
- **Popup**: در حال migration
- **Sidepanel**: در حال migration

#### **Vue Composables** (`src/composables/`):
- `useBrowserAPI`: Unified browser API access
- `useSelectElementTranslation`: Element selection functionality  
- `usePopupTranslation`: Popup translation logic
- `useSidepanelTranslation`: Sidepanel translation logic

### 5. Content Scripts Architecture

#### **Content Script Components:**
1. **select-element-manager.js**: Element selection functionality
2. **vue-bridge.js**: Vue component injection system
3. **content-tts-handler.js**: TTS handling in content context

## Routing & Messaging Flow

### 1. Message Flow Diagram

```
Vue Apps (popup/sidepanel/options)
    ↓
UnifiedMessenger (client-side)
    ↓
webextension-polyfill (browser API)
    ↓
SimpleMessageHandler (background)
    ↓
Registered Handler Functions
    ↓
Response back to client
```

### 2. Translation Flow

```
User Input
    ↓
Vue Composable (usePopupTranslation/useSidepanelTranslation)
    ↓
UnifiedMessenger.translate()
    ↓
Background: handleTranslate
    ↓
TranslationEngine.translate()
    ↓
Provider Factory → Selected Provider
    ↓
API Call → Response
    ↓
Cache & Return
```

### 3. Element Selection Flow

```
User clicks "Select Element"
    ↓
useSelectElementTranslation.toggleSelectElement()
    ↓
UnifiedMessenger.sendMessage("activateSelectElementMode")
    ↓
Background: handleActivateSelectElementMode
    ↓
browser.tabs.sendMessage → Content Script
    ↓
select-element-manager.js activates
    ↓
User selects element
    ↓
Text extracted & sent back to background
    ↓
Response to Vue app
```

## Critical Issues Identified

### 1. **کدهای تکراری و unused**

#### **Message Handling Duplications:**
- MessageRouter class موجود است ولی استفاده نمی‌شود
- VueMessageHandler register نمی‌شود
- Error handling در چندین layer تکرار شده

#### **Translation System Duplications:**
- TranslationHandler (legacy) vs TranslationEngine (current)
- Multiple translation clients: UnifiedTranslationClient vs direct handlers

### 2. **Legacy Code مسائل**

#### **OLD Folder Dependencies:**
- OLD folder هنوز موجود است و ممکن است dependencies داشته باشد
- Content scripts قدیمی ممکن است با جدید تداخل کنند

#### **Unused Imports:**
```javascript
// مثال‌هایی از imports احتمالاً unused:
import { EventRouter } from "../core/EventRouter.js";
import { TranslationHandler } from "../core/TranslationHandler.js";
```

### 3. **Architecture Inconsistencies**

#### **Error Handling:**
- ErrorHandler در چندین جا instantiate می‌شود
- Error types در چندین فایل define شده

#### **Browser API Access:**
- Some files use direct `browser` import
- Others use `useBrowserAPI()` composable
- Inconsistent patterns

## Recommendations

### 1. **Message System Cleanup**
- حذف MessageRouter.js (استفاده نمی‌شود)
- تثبیت VueMessageHandler integration یا حذف آن
- Standardize به SimpleMessageHandler

### 2. **Translation System Consolidation**
- بررسی TranslationHandler usage و حذف در صورت عدم استفاده
- تمرکز بر TranslationEngine به عنوان single source of truth

### 3. **Legacy Code Removal**
- بررسی دقیق OLD folder dependencies
- حذف unused imports
- پاکسازی duplicate error handling

### 4. **Architecture Standardization**
- یکپارچه‌سازی browser API access patterns
- تعریف single error handling strategy
- استانداردسازی composable patterns

## Key Files Reference

### **Background Script Core:**
- `src/background/index.js` - Main background service
- `src/core/SimpleMessageHandler.js` - Primary message handler
- `src/background/translation-engine.js` - Translation orchestrator

### **Vue Integration:**
- `src/composables/useBrowserAPI.js` - Unified browser API
- `src/core/UnifiedMessenger.js` - Client messaging
- `src/composables/useSelectElementTranslation.js` - Element selection

### **Content Scripts:**
- `src/content-scripts/select-element-manager.js` - Element selection
- `src/content-scripts/vue-bridge.js` - Vue integration

### **Provider System:**
- `src/background/providers/TranslationProviderFactory.js` - Provider factory
- `src/background/providers/implementations/` - Provider implementations

## Detailed Cleanup Analysis

### **38 فایل شناسایی شده برای حذف:**

#### **🔴 Provider Duplicates (27 فایل)**
```
/src/providers/implementations/ (11 فایل provider)
/src/providers/factory/ (2 فایل)
/src/providers/registry/ (2 فایل)
```
**دلیل**: تکرار کامل در `/src/background/providers/`

#### **🔴 TTS Duplicates (8 فایل)**
```
/src/utils/tts-player/ (3 فایل)
/src/utils/tts/ (5 فایل)
```
**دلیل**: `/src/managers/tts-*` فایل‌ها استفاده می‌شوند

#### **🔴 Handler & Core Unused (3 فایل)**
```
/src/handlers/tts-handler.js
/src/handlers/backgroundHandlers.js
/src/core/api.js
```

#### **تخمین کاهش حجم Bundle: ~270KB**

### **Critical Dependencies Analysis:**

#### **✅ MessageRouter Status:**
- **File**: `src/background/message-router.js`
- **Status**: UNUSED - فقط export می‌شود، هیچ import ندارد
- **Safe to Remove**: YES

#### **✅ VueMessageHandler Status:**
- **File**: `src/background/vue-message-handler.js`
- **Status**: INSTANTIATED but register() method empty
- **Current Usage**: موجود در background/index.js line 236
- **Issue**: register method کاری نمی‌کند

#### **✅ Legacy Handler Files:**
- `src/core/TranslationHandler.js` - احتمال استفاده پایین
- `src/core/EventHandler.js` - بررسی نیاز
- `src/core/EventRouter.js` - بررسی نیاز

### **OLD Folder Analysis:**
- **Status**: مجزا از Vue architecture
- **Dependencies**: NO direct imports found
- **Safe to Remove**: YES (after final verification)

## Implementation Priority

### **Phase 1 - Safe Cleanup (فوری):**
1. حذف 38 فایل duplicate/unused
2. حذف MessageRouter (confirmed unused)
3. پاکسازی unused imports

### **Phase 2 - Architecture Cleanup:**
1. تثبیت VueMessageHandler یا حذف آن
2. بررسی TranslationHandler legacy usage
3. یکپارچه‌سازی error handling

### **Phase 3 - Final Migration:**
1. حذف OLD folder
2. Bundle size optimization
3. Final architecture documentation

### **مشخصات فنی:**
- **Manifest Version**: V3 (Chrome & Firefox compatible)
- **Build System**: Vite with dynamic manifest generation
- **Browser Support**: Chrome, Firefox with feature detection
- **Vue Version**: 3.x with Composition API
- **Messaging**: webextension-polyfill for cross-browser compatibility

### **Bundle Sizes:**
- Options: ~31KB (migrated)
- Popup: Target <6KB (in migration)
- Sidepanel: Target <8KB (in migration)
- Content Scripts: ~900KB (needs optimization - cleanup will help)

### **AI Navigation Guide:**

برای فهم سریع پروژه توسط AI آینده:

1. **Main Entry Points:**
   - `src/background/index.js` - Background service
   - `src/core/SimpleMessageHandler.js` - Primary messaging
   - `src/background/translation-engine.js` - Translation logic

2. **Vue Integration:**
   - `src/composables/` - Vue composables
   - `src/core/UnifiedMessenger.js` - Client messaging
   - `src/views/` - Vue pages

3. **Critical Flows:**
   - Translation: Vue → UnifiedMessenger → SimpleMessageHandler → TranslationEngine
   - Element Selection: Vue → Background → Content Script → Response
   - TTS: Vue → Background → Manager (browser-specific)
