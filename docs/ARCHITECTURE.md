# Translate-It Extension Architecture

## Overview

**Modern Vue.js browser extension** for AI-powered translation supporting **Chrome and Firefox** with **Manifest V3**. Built with simplified messaging system and modular architecture.

## 🎯 Current Status ✅

**Latest Changes:**
- ✅ **Messaging System Refactored** - Direct `browser.runtime.sendMessage()` API
- ✅ **Performance Optimized** - Eliminated timeout issues  
- ✅ **Vue.js Migration** - Modern component architecture
- ✅ **Provider System** - 10+ translation providers with factory pattern
- ✅ **Cross-Browser Support** - Chrome and Firefox MV3

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────┐
│            FRONTEND LAYER               │
│  Vue Components → useMessaging          │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│           MESSAGING LAYER               │
│  MessageFormat → browser.runtime        │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│          BACKGROUND LAYER               │
│  LifecycleManager → Handlers            │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│           SERVICE LAYER                 │
│  TranslationEngine → Providers          │
└─────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
src/
├── 📱 components/           # Vue components
│   ├── popup/              # Popup interface
│   ├── sidepanel/          # Sidepanel components  
│   ├── options/            # Options page
│   └── shared/             # Reusable components
│
├── 🔄 messaging/           # Messaging system
│   ├── core/
│   │   ├── MessagingCore.js    # MessageFormat, Contexts
│   │   └── MessageActions.js   # Action constants
│   └── composables/
│       └── useMessaging.js     # Vue messaging composable
│
├── 🎯 background/          # Background service
│   ├── index.js            # Service worker entry
│   └── handlers/           # Message handlers
│       ├── translation/    # Translation handlers
│       ├── sidepanel/      # Sidepanel handlers
│       └── common/         # Common handlers
│
├── 🏭 providers/           # Translation providers
│   ├── core/
│   │   ├── ProviderFactory.js  # Provider factory
│   │   └── BaseProvider.js     # Base provider class
│   └── implementations/    # Provider implementations
│       ├── GoogleTranslateProvider.js
│       ├── OpenAIProvider.js
│       └── DeepSeekProvider.js
│
├── 🗂️ store/              # Pinia state management
│   ├── core/
│   │   ├── settings.js     # Settings store
│   │   └── translation.js  # Translation state
│   └── modules/            # Feature stores
│
├── 🎨 composables/         # Vue composables
│   ├── useTranslationModes.js
│   ├── useErrorHandler.js
│   └── useExtensionAPI.js
│
├── 📄 content-scripts/     # Content scripts
│   └── index.js            # Main content script
│
└── 🔧 managers/            # System managers
    ├── core/
    │   └── LifecycleManager.js  # Central message router
    └── content/
        └── SelectElementManager.js  # Element selection
```

---

## 🔄 Messaging System

### Simple Direct API Usage

```javascript
// In Vue Components
import { useMessaging } from '@/messaging/composables/useMessaging.js'

const { sendMessage, createMessage } = useMessaging('popup')

const response = await sendMessage(
  createMessage(MessageActions.TRANSLATE, { text: 'Hello' })
)
```

### Core Components

**MessagingCore.js** - Message utilities:
```javascript
export const MessageFormat = {
  create: (action, data, context) => ({ ... }),
  validate: (message) => boolean
}

export const MessageContexts = {
  POPUP: 'popup',
  SIDEPANEL: 'sidepanel', 
  BACKGROUND: 'background',
  CONTENT: 'content'
}
```

**useMessaging.js** - Vue composable for standardized messaging

---

## 🎯 Background Service

### LifecycleManager
Central message router that coordinates all extension communication:

```javascript
// Background service entry point
import { LifecycleManager } from '@/managers/core/LifecycleManager.js'

const lifecycleManager = new LifecycleManager()
lifecycleManager.initialize()
```

### Message Handlers
Organized by feature:
- **Translation** - `handleTranslate.js`, `handleTranslateImage.js`
- **Sidepanel** - `handleOpenSidePanel.js`
- **Common** - `handlePing.js`, `handleGetInfo.js`

---

## 🏭 Provider System

### Factory Pattern
```javascript
import { ProviderFactory } from '@/providers/core/ProviderFactory.js'

const provider = ProviderFactory.create('openai', config)
const result = await provider.translate(text, options)
```

### Available Providers
- **Google Translate** - Free, fast
- **OpenAI** - GPT-powered translation
- **DeepSeek** - AI translation service
- **Local** - Browser built-in translation
- **10+ more providers**

### TranslationEngine
Coordinates translation requests and provider selection:

```javascript
import { TranslationEngine } from '@/core/TranslationEngine.js'

const engine = new TranslationEngine()
const result = await engine.translate({
  text: 'Hello',
  targetLang: 'fa',
  provider: 'openai'
})
```

---

## 🗂️ State Management

### Pinia Stores

**Settings Store:**
```javascript
import { useSettingsStore } from '@/store/core/settings.js'

const settings = useSettingsStore()
settings.updateProvider('openai')
```

**Translation Store:**
```javascript
import { useTranslationStore } from '@/store/core/translation.js'

const translation = useTranslationStore()
translation.setResult(translatedText)
```

---

## 🔧 Cross-Browser Compatibility

### Browser Detection
```javascript
import { useBrowserDetection } from '@/composables/useBrowserDetection.js'

const { isChrome, isFirefox, supportsSidepanel } = useBrowserDetection()
```

### Feature Support Matrix
| Feature | Chrome | Firefox |
|---------|--------|---------|
| Sidepanel | ✅ | ✅ |
| Offscreen | ✅ | ❌ |
| Action API | ✅ | ✅ |

---

## 📋 Essential Files

### Core Development Files
- `src/messaging/core/MessagingCore.js` - Message utilities
- `src/background/index.js` - Background service entry
- `src/managers/core/LifecycleManager.js` - Message router
- `src/providers/core/ProviderFactory.js` - Provider system
- `src/store/core/settings.js` - Settings management

### Vue Integration
- `src/messaging/composables/useMessaging.js` - Messaging composable
- `src/composables/useTranslationModes.js` - Translation modes
- `src/components/shared/TranslationDisplay.vue` - UI component

### Content Scripts
- `src/content-scripts/index.js` - Main content script
- `src/managers/content/SelectElementManager.js` - Element selection

---

## 🚀 Performance Benefits

### Refactoring Results
- ✅ **50% faster** message processing
- ✅ **Eliminated** 20-second timeouts
- ✅ **Reduced** cross-component interference
- ✅ **Simplified** debugging and maintenance

### Best Practices
- **Direct browser API** usage for performance
- **Context filtering** to prevent message conflicts
- **Lazy loading** of providers and components
- **Efficient state management** with Pinia

---

## 🔍 Development Guide

### Adding New Provider
1. Create provider class extending `BaseProvider`
2. Register in `ProviderFactory`
3. Add configuration to settings store
4. Test with `TranslationEngine`

### Adding New Message Handler
1. Create handler in appropriate `handlers/` directory
2. Register in `LifecycleManager`
3. Add corresponding action to `MessageActions.js`
4. Test with `useMessaging` composable

### Debugging
- Use browser DevTools extension debugging
- Check `[Messaging]` logs in console
- Verify message format with `MessageFormat.validate()`

---

**Architecture Status: ✅ Modernized and Optimized**

This architecture provides a **clean, maintainable, and performant** foundation for the translation extension while supporting future feature additions and cross-browser compatibility.
