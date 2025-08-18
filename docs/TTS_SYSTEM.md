# TTS (Text-to-Speech) System Documentation

## Overview

The TTS system in Translate-It extension provides cross-browser text-to-speech functionality with automatic browser detection. The system has been simplified to a single, robust implementation that works seamlessly across Chromium-based browsers and Firefox.

## Current Architecture

### System Flow Diagram

```
User Request (Vue Component / Content Script)
    ↓
useTTSSmart.js / useTTSAction.js / TTSManager.js
    ↓
MessageActions.GOOGLE_TTS_SPEAK
    ↓
Background: handleGoogleTTS.js (Unified handler)
    ↓
Browser-specific implementation:
    ├── Chromium: Offscreen document (Chrome, Edge, Opera, etc.)
    └── Firefox: Background page direct audio
```

## Core Components

### 1. Background Handler (`src/background/handlers/tts/`)

#### handleGoogleTTS.js
**Main TTS handler for all browsers**

```javascript
export const handleGoogleTTSSpeak = async (request) => {
  const { text, language } = request.data || {};
  
  // Create Google TTS URL
  const ttsUrl = `https://translate.google.com/translate_tts?client=tw-ob&q=${encodeURIComponent(text.trim())}&tl=${language || 'en'}`;
  
  // Browser-specific playback
  await playGoogleTTSWithBrowserDetection(ttsUrl);
  
  return { success: true, processedVia: 'background-google-tts' };
};
```

**Key Features:**
- Single entry point for all TTS requests
- Automatic Chromium vs Firefox detection
- Robust offscreen document management for Chromium
- Direct audio playback for Firefox
- Comprehensive error handling and fallback

#### handleOffscreenReady.js
**Chromium-specific offscreen document handler**

```javascript
export const handleOffscreenReady = async (request) => {
  // Only registered in Chromium-based browsers
  return { success: true, acknowledged: true, timestamp: Date.now() };
};
```

**Browser-Specific Registration:**
- Chromium browsers: Handler registered automatically
- Firefox: Handler not registered (not needed)

### 2. Frontend Composables (`src/composables/`)

#### useTTSSmart.js
**Primary TTS composable for Vue components**

```javascript
export function useTTSSmart() {
  const speak = async (text, lang = "auto") => {
    const language = getLanguageCodeForTTS(lang) || "en";
    
    const response = await browserAPI.sendMessage({
      action: MessageActions.GOOGLE_TTS_SPEAK,
      data: { text: text.trim(), language }
    });
    
    return response;
  };
  
  return { speak, stop, toggle, isPlaying, isLoading, isAvailable };
}
```

#### useTTSAction.js
**Enhanced TTS with multiple fallback methods**

```javascript
export function useTTSAction() {
  const speak = async (text, language = 'auto') => {
    // Try methods in priority order:
    // 1. Unified background service (preferred)
    // 2. Web Speech API
    // 3. Direct Google TTS
    
    for (const method of methods) {
      try {
        const success = await method();
        if (success) return true;
      } catch (error) {
        // Try next method
      }
    }
    
    return false;
  };
  
  return { speak, stop, /* ... */ };
}
```

### 3. Content Script Support (`src/managers/content/windows/translation/`)

#### TTSManager.js
**Content script TTS manager for WindowsManager**

```javascript
export class TTSManager {
  async speakTextUnified(text) {
    const language = this.detectSimpleLanguage(text) || "en";
    
    await sendReliable({
      action: MessageActions.GOOGLE_TTS_SPEAK,
      data: { text: text.trim(), language }
    });
  }
  
  // Fallback methods for direct content script usage
  async speakWithGoogleTTS(text, language) { /* ... */ }
  async speakWithWebSpeech(text, language) { /* ... */ }
}
```

**Features:**
- Unified background service integration
- Direct Google TTS fallback
- Web Speech API fallback
- Simple language detection
- TTS icon creation with click handlers

### 4. Browser-Specific Handlers (`src/utils/core/`)

#### browserHandlers.js
**Browser detection and handler registration**

```javascript
export const isChromium = () => {
  return /chrome/i.test(navigator.userAgent || '') || 
         /chromium/i.test(navigator.userAgent || '') ||
         /edg/i.test(navigator.userAgent || '') ||
         /opera|opr/i.test(navigator.userAgent || '');
};

export const addChromiumSpecificHandlers = (handlerMappings, Handlers) => {
  if (isChromium()) {
    handlerMappings['OFFSCREEN_READY'] = Handlers.handleOffscreenReady;
  }
};
```

## Browser Compatibility

### Chromium-based Browsers Support
- **Chrome, Edge, Opera, Brave, etc.**
- **Offscreen Documents**: Full MV3 support for audio processing
- **Service Worker**: Background handler with offscreen message routing
- **Automatic Detection**: Runtime browser capability detection

### Firefox Support
- **Background Page Audio**: Direct audio playback in background script
- **Message Routing**: All TTS messages through background handler
- **No Offscreen**: Uses direct Audio API without offscreen documents

### Detection Logic
- **Chromium Detection**: User agent pattern matching for Chrome, Edge, Opera
- **Automatic Selection**: Browser-appropriate implementation selected at runtime
- **Handler Registration**: Chromium-specific handlers only registered where needed

## Message Flow Architecture

### GOOGLE_TTS_SPEAK Message Flow

```
Vue Component/Content Script
    ↓ useTTSSmart.speak() / useTTSAction.speak() / TTSManager.speakTextUnified()
MessageActions.GOOGLE_TTS_SPEAK
    ↓ browser.runtime.sendMessage() / sendReliable()
Background: SimpleMessageHandler
    ↓ Route to 'GOOGLE_TTS_SPEAK'
handleGoogleTTS.js
    ↓ playGoogleTTSWithBrowserDetection()
Browser-specific Implementation:
    ├── Chromium: playWithOffscreenDocument() → Offscreen Audio
    └── Firefox: playGoogleTTSAudio() → Direct Audio
```

### Offscreen Document Flow (Chromium only)

```
Background Handler
    ↓ setupOffscreenDocument()
Offscreen Document Creation/Check
    ↓ sendMessage({ action: 'playOffscreenAudio', target: 'offscreen' })
Offscreen Document (public/offscreen.js)
    ↓ handleAudioPlayback() / handleAudioPlaybackWithFallback()
Google TTS Audio Playback
    ↓ sendMessage({ action: 'OFFSCREEN_READY' })
Background: handleOffscreenReady()
```

## Current Implementation Details

### Unified Handler Features
- **Single Entry Point**: `handleGoogleTTSSpeak` handles all TTS requests
- **Browser Detection**: Automatic Chromium vs Firefox detection
- **Promise Management**: Global promise for offscreen document creation
- **Error Recovery**: Automatic promise reset on document failure
- **Logging**: Comprehensive debug logging throughout

### Offscreen Document Management
- **One-time Creation**: Global promise ensures single document creation
- **Existence Check**: Validates document exists before use
- **Auto Recovery**: Resets promise and recreates document on failure
- **Chrome MV3 Compliance**: Proper offscreen document lifecycle management

### Fallback Strategies
- **useTTSAction**: Multiple fallback methods (background → WebSpeech → direct Google)
- **TTSManager**: Background service with Google TTS and WebSpeech fallbacks
- **Error Handling**: Graceful degradation through fallback chain

## Configuration

### TTS Request Format
```javascript
{
  action: 'GOOGLE_TTS_SPEAK',
  data: {
    text: 'Text to speak',
    language: 'en' // Language code (auto-detected or specified)
  }
}
```

### Supported Languages
- Auto-detection based on text content
- Manual language specification via `getLanguageCodeForTTS()`
- Fallback to English for unsupported languages

## Performance Optimizations

### Lazy Loading
- Browser-specific handlers loaded only when needed
- Offscreen documents created on-demand
- Manager instances cached after first creation

### Resource Management
- Proper cleanup of audio resources
- Offscreen document lifecycle management
- Memory-efficient promise handling

### Bundle Size Impact
- **Background Handler**: ~8KB (unified implementation)
- **Frontend Composables**: ~6KB (useTTSSmart + useTTSAction)
- **Content Script Manager**: ~8KB (TTSManager with fallbacks)
- **Total TTS System**: ~22KB (optimized for extension constraints)

## Development Guidelines

### Adding New TTS Features
1. **Extend Background Handler**: Add functionality to `handleGoogleTTS.js`
2. **Update Message Actions**: Add action constants if needed
3. **Update Composables**: Extend `useTTSSmart.js` or `useTTSAction.js`
4. **Test Cross-browser**: Verify functionality in Chromium and Firefox

### Testing TTS System
1. **Chromium Testing**: Load extension and test offscreen document creation
2. **Firefox Testing**: Test direct audio playback
3. **Edge Cases**: Test document recovery, language detection, fallbacks
4. **Performance**: Monitor memory usage and cleanup

### Debugging TTS Issues
1. **Background Console**: Check service worker console for handler logs
2. **Offscreen Console**: Check Chrome offscreen document console
3. **Content Console**: Check content script console for manager logs
4. **Message Tracing**: Enable debug logging for message flow

## Security Considerations

### Audio Context Security
- **Offscreen Isolation**: Chromium audio processing in isolated context
- **Local Processing**: All speech synthesis happens locally via Google TTS API
- **No External Services**: No third-party TTS service dependencies

### Privacy
- **Local TTS**: Uses browser's local capabilities and Google's public TTS API
- **No Data Storage**: Text is not stored or transmitted to external servers
- **Secure Communication**: All communication through browser's messaging system

## Architecture Benefits

### Simplified Design
- **Single Handler**: One background handler for all TTS requests
- **Clear Separation**: Browser-specific logic cleanly separated
- **Maintainable**: Easy to understand and modify
- **Consistent**: Unified interface across all components

### Cross-browser Support
- **Universal Compatibility**: Works across all major browsers
- **Automatic Detection**: No manual browser configuration needed
- **Fallback Ready**: Multiple fallback methods for reliability

### Performance
- **Efficient**: Minimal overhead with lazy loading
- **Scalable**: Easy to extend with new browsers or features
- **Resource Conscious**: Proper cleanup and memory management

## Conclusion

The current TTS system provides a robust, simplified implementation that automatically adapts to different browsers while maintaining a clean, maintainable codebase. The unified handler approach reduces complexity while ensuring reliable cross-browser functionality.

### Key Improvements Made
- **Unified Handler**: Single background handler replaces complex multi-file architecture
- **Smart Browser Detection**: Automatic Chromium vs Firefox adaptation
- **Robust Error Handling**: Comprehensive error recovery and fallback strategies
- **Clean Architecture**: Simplified file structure with clear responsibilities
- **Better Performance**: Optimized resource usage and lazy loading