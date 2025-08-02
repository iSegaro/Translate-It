# TTS (Text-to-Speech) System Documentation

## Overview

The TTS system in Translate-It extension provides cross-browser text-to-speech functionality with automatic browser detection and graceful fallbacks. The system has been simplified and consolidated to provide a clean, maintainable architecture while supporting both Chrome and Firefox browsers.

## Architecture Overview

### System Flow Diagram

```
User Request (Vue Component / Content Script)
    ↓
TTSMessenger.js (Standardized messaging)
    ↓
Background: handleSpeak.js (Unified handler)
    ↓
FeatureLoader.loadTTSManager() (Browser detection)
    ↓
Browser-specific implementation:
    ├── Chrome: TTSChrome.js (Offscreen documents)
    └── Firefox: TTSFirefox.js (Background page audio)
    
Content Script Fallback:
    TTSHandler.js → Web Speech API
```

## Core Components

### 1. Background Handler (`src/background/handlers/tts/`)

#### handleSpeak.js
**Unified cross-browser TTS handler**

```javascript
// Main entry point for TTS_SPEAK messages
export const handleSpeak = async (message) => {
  try {
    const ttsManager = await featureLoader.loadTTSManager();
    const result = await ttsManager.speak(message.data);
    return { success: true, result };
  } catch (error) {
    return errorHandlerInstance.handle(error, {
      type: ErrorTypes.TTS_ERROR,
      context: 'speak'
    });
  }
};
```

**Key Features:**
- Unified entry point for all TTS requests
- Automatic browser detection via FeatureLoader
- Comprehensive error handling with ErrorHandler integration
- Supports initialization callback for error handler setup

### 2. Browser-Specific Managers (`src/managers/browser-specific/tts/`)

#### TTSChrome.js - OffscreenTTSManager
**Chrome implementation using offscreen documents**

```javascript
export class OffscreenTTSManager {
  async initialize() {
    await this.ensureOffscreenDocument();
  }
  
  async speak(text, language, options = {}) {
    const message = {
      action: 'TTS_SPEAK',
      data: { text, language, options }
    };
    return await browser.runtime.sendMessage(message);
  }
  
  async stop() {
    return await browser.runtime.sendMessage({ action: 'TTS_STOP' });
  }
}
```

**Chrome-Specific Features:**
- Offscreen document management for audio context
- Direct message routing to offscreen for TTS control
- Automatic document creation and lifecycle management

#### TTSFirefox.js - BackgroundTTSManager
**Firefox implementation using background page audio**

```javascript
export class BackgroundTTSManager {
  async initialize() {
    this.speechSynthesis = globalThis.speechSynthesis;
  }
  
  async speak(text, language, options = {}) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    // Apply options (rate, pitch, volume)
    this.speechSynthesis.speak(utterance);
  }
  
  async stop() {
    this.speechSynthesis.cancel();
  }
}
```

**Firefox-Specific Features:**
- Background page speech synthesis
- Direct audio API access
- Synchronous speech control

### 3. Feature Loading System (`src/background/feature-loader.js`)

#### Dynamic TTS Manager Loading

```javascript
export class FeatureLoader {
  async loadTTSManager() {
    // Browser capability detection
    const hasOffscreen = typeof browser.offscreen?.hasDocument === "function";
    
    if (hasOffscreen) {
      // Chrome: Use offscreen documents
      const { OffscreenTTSManager } = await import(
        "../managers/browser-specific/tts/TTSChrome.js"
      );
      return new OffscreenTTSManager();
    } else {
      // Firefox: Use background page audio
      const { BackgroundTTSManager } = await import(
        "../managers/browser-specific/tts/TTSFirefox.js"
      );
      return new BackgroundTTSManager();
    }
  }
}
```

**Detection Logic:**
- Checks for `browser.offscreen?.hasDocument` availability
- Automatically selects appropriate implementation
- Lazy loading for optimal performance
- Caching to avoid repeated instantiation

### 4. Messaging System (`src/messaging/specialized/`)

#### TTSMessenger.js
**Standardized TTS messaging interface**

```javascript
export class TTSMessenger {
  constructor(messenger) {
    this.messenger = messenger;
  }
  
  async speak(text, language, options = {}) {
    return this.messenger.sendMessage({
      action: MessageActions.TTS_SPEAK,
      data: { text, language, options },
      timestamp: Date.now()
    });
  }
  
  async stop() {
    return this.messenger.sendMessage({
      action: MessageActions.TTS_STOP,
      timestamp: Date.now()
    });
  }
  
  async pause() {
    return this.messenger.sendMessage({
      action: MessageActions.TTS_PAUSE,
      timestamp: Date.now()
    });
  }
  
  async resume() {
    return this.messenger.sendMessage({
      action: MessageActions.TTS_RESUME,
      timestamp: Date.now()
    });
  }
}
```

### 5. Content Script Support (`src/handlers/content/`)

#### TTSHandler.js
**Content script fallback TTS implementation**

```javascript
export class ContentTTSHandler {
  constructor() {
    this.speechSynthesis = window.speechSynthesis;
  }
  
  async speak(text, language = 'en') {
    if (!this.speechSynthesis) {
      throw new Error('Speech synthesis not available');
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    this.speechSynthesis.speak(utterance);
  }
  
  stop() {
    this.speechSynthesis?.cancel();
  }
}

export const contentTTSHandler = new ContentTTSHandler();
```

**Fallback Features:**
- Web Speech API integration
- Direct browser speech synthesis
- Used when background TTS is unavailable

### 6. Vue Integration (`src/composables/`)

#### useTTS.js
**Primary TTS composable for Vue components**

```javascript
import { useMessaging } from '@/messaging/composables/useMessaging.js';

export function useTTS() {
  const { specialized } = useMessaging();
  
  const speak = async (text, language, options = {}) => {
    try {
      const result = await specialized.tts.speak(text, language, options);
      return result;
    } catch (error) {
      console.error('TTS speak error:', error);
      throw error;
    }
  };
  
  const stop = async () => {
    return await specialized.tts.stop();
  };
  
  return {
    speak,
    stop,
    pause: () => specialized.tts.pause(),
    resume: () => specialized.tts.resume()
  };
}
```

#### useTTSSimple.js
**Simplified TTS for basic use cases**

```javascript
export function useTTSSimple() {
  const { speak, stop } = useTTS();
  
  const speakText = async (text, language = 'en') => {
    return await speak(text, language);
  };
  
  return { speakText, stop };
}
```

#### useTTSSmart.js
**Enhanced TTS with additional features**

```javascript
export function useTTSSmart() {
  const { speak, stop, pause, resume } = useTTS();
  const { isPlaying, isPaused } = useTTSState();
  
  const smartSpeak = async (text, language, options = {}) => {
    // Enhanced logic with state management
    if (isPlaying.value) {
      await stop();
    }
    
    return await speak(text, language, options);
  };
  
  return {
    smartSpeak,
    stop,
    pause,
    resume,
    isPlaying,
    isPaused
  };
}
```

### 7. Store Integration (`src/store/modules/`)

#### tts.js
**Pinia store for TTS state management**

```javascript
import { defineStore } from 'pinia';

export const useTTSStore = defineStore('tts', {
  state: () => ({
    isPlaying: false,
    isPaused: false,
    currentText: '',
    currentLanguage: 'en',
    volume: 1,
    rate: 1,
    pitch: 1
  }),
  
  actions: {
    async speak(text, language, options = {}) {
      this.isPlaying = true;
      this.isPaused = false;
      this.currentText = text;
      this.currentLanguage = language;
      
      // Use messaging system
      const { specialized } = useMessaging();
      return await specialized.tts.speak(text, language, options);
    },
    
    async stop() {
      this.isPlaying = false;
      this.isPaused = false;
      this.currentText = '';
      
      const { specialized } = useMessaging();
      return await specialized.tts.stop();
    }
  }
});
```

### 8. UI Components (`src/components/feature/`)

#### TTSControl.vue
**Vue component for TTS controls**

```vue
<template>
  <div class="tts-control">
    <button @click="toggleSpeak" :disabled="!canSpeak">
      {{ isPlaying ? 'Stop' : 'Speak' }}
    </button>
    <button @click="pause" v-if="isPlaying && !isPaused">Pause</button>
    <button @click="resume" v-if="isPaused">Resume</button>
  </div>
</template>

<script setup>
import { useTTSSmart } from '@/composables/useTTSSmart.js';

const props = defineProps({
  text: String,
  language: String
});

const { smartSpeak, stop, pause, resume, isPlaying, isPaused } = useTTSSmart();

const canSpeak = computed(() => props.text && props.text.length > 0);

const toggleSpeak = async () => {
  if (isPlaying.value) {
    await stop();
  } else {
    await smartSpeak(props.text, props.language);
  }
};
</script>
```

## Message Flow Architecture

### 1. TTS_SPEAK Message Flow

```
Vue Component
    ↓ useTTS.speak()
TTSMessenger.speak()
    ↓ MessageActions.TTS_SPEAK
browser.runtime.sendMessage()
    ↓
Background: SimpleMessageHandler
    ↓ Route to 'TTS_SPEAK'
handleSpeak.js
    ↓ featureLoader.loadTTSManager()
Browser-specific Manager
    ↓ Chrome: Offscreen / Firefox: Background Audio
Speech Synthesis
```

### 2. TTS_STOP/PAUSE/RESUME Message Flow

```
Vue Component
    ↓ useTTS.stop/pause/resume()
TTSMessenger.stop/pause/resume()
    ↓ MessageActions.TTS_STOP/PAUSE/RESUME
browser.runtime.sendMessage()
    ↓
Chrome: Direct to Offscreen
Firefox: Background Audio API
```

### 3. Content Script Fallback Flow

```
Content Script Context
    ↓ contentTTSHandler.speak()
Web Speech API
    ↓ window.speechSynthesis
Browser Speech Engine
```

## Browser Compatibility

### Chrome Support
- **Offscreen Documents**: Full MV3 support for audio processing
- **Service Worker**: Background handler with message routing
- **Direct Control**: TTS_STOP, TTS_PAUSE, TTS_RESUME bypass background
- **Feature Detection**: Automatic offscreen API detection

### Firefox Support
- **Background Page Audio**: Background script with speech synthesis
- **Message Routing**: All TTS messages through background handler
- **Fallback Compatibility**: Graceful degradation for missing APIs
- **Cross-browser Messaging**: Enhanced unified messenger for Firefox

### Fallback Strategy
- **Content Script**: Web Speech API when background TTS unavailable
- **Feature Detection**: Runtime capability checking
- **Error Recovery**: Automatic fallback to next available method
- **User Feedback**: Clear error messages for unsupported scenarios

## Configuration Options

### TTS Settings
```javascript
const ttsOptions = {
  volume: 1.0,        // 0.0 to 1.0
  rate: 1.0,          // 0.1 to 10.0  
  pitch: 1.0,         // 0.0 to 2.0
  voice: null,        // SpeechSynthesisVoice object
  language: 'en'      // Language code
};
```

### Provider Settings
- **Google TTS**: Built-in speech synthesis
- **Browser TTS**: Native browser speech engine
- **Web Speech API**: Standard web API fallback

## Error Handling

### Error Types
```javascript
export const TTSErrorTypes = {
  TTS_ERROR: 'TTS_ERROR',
  TTS_UNSUPPORTED: 'TTS_UNSUPPORTED', 
  TTS_PERMISSION_DENIED: 'TTS_PERMISSION_DENIED',
  TTS_NETWORK_ERROR: 'TTS_NETWORK_ERROR',
  TTS_INITIALIZATION_FAILED: 'TTS_INITIALIZATION_FAILED'
};
```

### Error Handling Pattern
```javascript
try {
  const result = await ttsManager.speak(text, language);
  return { success: true, result };
} catch (error) {
  return errorHandlerInstance.handle(error, {
    type: ErrorTypes.TTS_ERROR,
    message: error.message || 'TTS operation failed',
    context: 'speak',
    data: { text, language }
  });
}
```

## Performance Considerations

### Optimization Strategies
- **Lazy Loading**: TTS managers loaded only when needed
- **Caching**: Manager instances cached after first load
- **Feature Detection**: Runtime browser capability detection
- **Resource Management**: Proper cleanup of audio resources

### Bundle Size
- **Chrome Manager**: ~3KB (offscreen implementation)
- **Firefox Manager**: ~2KB (background audio)
- **Shared Components**: ~5KB (handlers, messaging, composables)
- **Total TTS System**: ~10KB (optimized for extension constraints)

## Development Guidelines

### Adding New TTS Features
1. **Extend Base Managers**: Add methods to TTSChrome/TTSFirefox
2. **Update Messaging**: Add action constants in MessageActions.js
3. **Create Composables**: Add Vue composables for new functionality
4. **Test Cross-browser**: Verify functionality in Chrome and Firefox

### Testing TTS System
1. **Chrome Testing**: Load extension in chrome://extensions/
2. **Firefox Testing**: Load extension in about:debugging
3. **Feature Detection**: Test capability detection logic
4. **Error Scenarios**: Test fallback behavior

### Debugging TTS Issues
1. **Background Console**: Check background service worker/page console
2. **Offscreen Console**: Chrome offscreen document console
3. **Content Console**: Content script console for fallback scenarios
4. **Message Tracing**: Enable debug logging for message flow

## Security Considerations

### Audio Context Security
- **Offscreen Isolation**: Chrome audio processing in isolated context
- **Permission Management**: Proper handling of audio permissions
- **Content Security**: Secure communication between contexts

### Data Privacy
- **Text Processing**: No external TTS service calls (uses browser APIs)
- **Local Processing**: All speech synthesis happens locally
- **No Data Transmission**: TTS data doesn't leave user's browser

## Conclusion

The TTS system provides a robust, cross-browser text-to-speech implementation with automatic browser detection, comprehensive error handling, and clean Vue.js integration. The simplified architecture ensures maintainability while providing full functionality across Chrome and Firefox browsers.

### Key Benefits
- **Cross-browser Compatibility**: Automatic browser detection and adaptation
- **Clean Architecture**: Simplified, maintainable code structure
- **Vue Integration**: Full reactive integration with Vue components
- **Error Resilience**: Comprehensive error handling and fallback strategies
- **Performance Optimized**: Lazy loading and caching for optimal performance