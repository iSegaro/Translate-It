# TTS (Text-to-Speech) System Documentation

## 🎯 Overview

The Text-to-Speech (TTS) system in the Translate-It extension provides a **fully unified, robust, and stateful** experience for audio playback. It features complete **Play, Pause, Resume, and Stop** capabilities with **exclusive playback** across all extension components (Popup, Sidepanel, Windows Manager).

**✅ Unified Architecture (2025)**: The system has been **completely unified** around a single composable (`useTTSSmart`) that handles all TTS functionality across all contexts. All legacy complexity and duplicate implementations have been eliminated for optimal performance and maintainability.

## 🏗️ Architecture & Message Flow

The new architecture ensures a clear separation of concerns, from UI interaction to background processing.

### Unified System Flow Diagram

```
User Interaction
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│                    UI Components                        │
│  TTSButton.vue  │  ActionToolbar.vue  │  Context UIs   │
│    (5 visual states: idle, loading, playing, paused, error)
└─────────────────────────────────────────────────────────┘
    │ (Single unified interface)
    ▼
┌───────────────────────────────────────────────────────────┐
│                  useTTSSmart.js                           │
│     🎯 SINGLE SOURCE OF TRUTH FOR ALL TTS OPERATIONS     │
│   • State management • Language fallbacks • Error handling │
│   • Exclusive playback • Cross-context coordination       │
└───────────────────────────────────────────────────────────┘
    │ (UnifiedMessaging with intelligent timeouts)
    ▼
┌───────────────────────────────────────────────────────────┐
│                 Background Handlers                       │
│  handleGoogleTTS.js  │  Language fallbacks  │  Error recovery │
└───────────────────────────────────────────────────────────┘
    │ (Browser-specific execution)
    ▼
┌──────────────────────────────────────────────────────────┐
│             Cross-Browser Audio Playback                 │
│   Chromium: Offscreen Documents  │   Firefox: Direct Audio   │
│   • HTTP 400 fallbacks          │   • Web Speech API fallbacks │
└──────────────────────────────────────────────────────────┘
```

## Core Components

### 1. `composables/useTTSSmart.js` - The Unified TTS Composable
The **single source of truth** for all TTS functionality across the entire extension. This composable encapsulates all client-side TTS logic, manages state, coordinates with background services, and provides complete playback control.

**✅ Unified Features (2025):**
- **Single State Management**: Manages 5 distinct states: `'idle' | 'loading' | 'playing' | 'paused' | 'error'`
- **Complete Control Methods**: `speak()`, `pause()`, `resume()`, `stop()`, `stopAll()`, and `retry()`
- **Reactive Properties**: `canPause`, `canResume`, `canStop`, `isPlaying`, `isLoading` for UI updates
- **Language Fallback System**: Automatically maps unsupported languages (e.g., `fa → ar`)
- **Cross-Context Exclusive Playback**: Automatic coordination between Popup, Sidepanel, WindowsManager
- **Intelligent Error Recovery**: Built-in retry mechanisms and user-friendly error messages
- **UnifiedMessaging Integration**: Optimized timeouts and reliable background communication

### 2. `components/shared/TTSButton.vue`
A smart UI component that provides a rich visual experience based on the TTS state.

**Visual States:**
1.  **Idle**: 🔊 Default play icon.
2.  **Loading**: 🔊 Gentle spinning animation.
3.  **Playing**: ⏸️ Pause icon with a circular progress ring.
4.  **Paused**: ▶️ Resume icon.
5.  **Error**: 🔊 Red icon with a tooltip, indicating a problem.

### 3. Language Fallback System
**✅ New Feature (2025)**: Automatic language mapping for enhanced compatibility.

**Supported Fallbacks:**
```javascript
const ttsLanguageFallbacks = {
  'fa': 'ar', // Persian → Arabic (similar script and phonetics)
  'ps': 'ar', // Pashto → Arabic
  'ku': 'ar', // Kurdish → Arabic  
  'ur': 'ar', // Urdu → Arabic
  'yi': 'he', // Yiddish → Hebrew
  'hy': 'ru', // Armenian → Russian
  'ka': 'ru', // Georgian → Russian
  'az': 'tr', // Azerbaijani → Turkish
  // ... and more
};
```

**Benefits:**
- **No HTTP 400 Errors**: Languages like Persian now work seamlessly
- **Better User Experience**: Users hear audio in phonetically similar languages
- **Automatic Fallback**: No manual configuration required

### 4. Background & Messaging

#### `messaging/core/MessageActions.js`
The messaging system has been optimized with unified actions to support the enhanced controls:
- `GOOGLE_TTS_SPEAK`
- `GOOGLE_TTS_PAUSE`
- `GOOGLE_TTS_RESUME`
- `TTS_STOP` (unified smart stop action handling both specific and global stops)
- `GOOGLE_TTS_GET_STATUS`
- `GOOGLE_TTS_ENDED` (completion event for proper lifecycle management)

#### `background/handlers/tts/handleGoogleTTS.js`
The background handler has been enhanced with smart stop logic and proper lifecycle management:
- **Smart Stop Handler**: `handleGoogleTTSStopAll` now handles both specific TTS stops (with `ttsId`) and global stops (without `ttsId`)
- **Persistent TTS ID**: `currentTTSId` now persists throughout audio playback and is only cleared when audio actually ends or is explicitly stopped
- **Completion Event Handling**: `handleGoogleTTSEnded` ensures proper cleanup when TTS audio completes naturally
- **Cross-Browser Audio Management**: Communicates with Offscreen documents (Chrome) or direct audio (Firefox) for precise control

## 🔄 State Management & Lifecycle Rules

The system's intelligence lies in its strict state and lifecycle management.

### Exclusive Playback
A core principle of the new system: **only one TTS instance can be active at any given time**. When a user initiates a new playback, the `TTSGlobalManager` automatically finds and stops any currently playing or paused instance before starting the new one. This prevents audio overlap and creates a predictable user experience.

### Smart Lifecycle
The `TTSGlobalManager` enforces context-aware rules:
- **Popup / Windows Manager**: TTS is automatically stopped if the component's UI is closed or hidden.
- **Sidepanel**: TTS is allowed to persist even when the user switches to a different browser tab, as the sidepanel remains visible.
- **Browser Close**: All TTS instances are stopped when the browser window is about to be unloaded.
- **ID Persistence**: `currentTTSId` persists throughout audio playback duration, ensuring reliable stop functionality from any component.

## ⚠️ Error Handling and Recovery

The system features a multi-layered error handling and recovery strategy.

**Error Types Handled:**
- `NETWORK_ERROR`
- `AUDIO_CONTEXT_ERROR`
- `PERMISSION_DENIED`
- `LANGUAGE_NOT_SUPPORTED`
- And 3+ other specific errors.

**Recovery Strategies:**
- **Auto-Retry**: For transient issues like network errors, the system automatically retries up to 2 times.
- **Manual Retry**: If an error persists, the `TTSButton` enters an error state, allowing the user to trigger a manual retry.
- **Language Fallback**: If a language is not supported, it automatically falls back to English ('en') to provide feedback.

## 🌐 Browser Compatibility

The system maintains seamless cross-browser support by abstracting the audio playback mechanism.
- **Chromium-based Browsers (Chrome, Edge)**: Utilizes an **Offscreen Document** to play audio, complying with Manifest V3's restrictions on background service workers.
- **Firefox**: Plays audio **directly from the background script** using the standard Audio API, as Firefox's MV3 implementation allows it.

The `handleGoogleTTS.js` handler and `TTSGlobalManager` are unaware of the underlying implementation detail, allowing for a clean and maintainable architecture.

## 🔧 Recent Improvements & Major Unification (2025)

### Complete System Unification (Version 2.0)
The TTS system has been **completely unified** by eliminating all duplicate implementations and legacy complexity:

**✅ Major Architectural Changes:**
- **🗑️ TTSManager.js Removed**: 600+ line duplicate class eliminated entirely
- **🎯 Single Composable**: All contexts now use **only** `useTTSSmart.js`
- **🔧 WindowsManager Simplified**: Removed dual `TTSManager` + `useTTSGlobal` approach
- **🌐 Language Fallback System**: Added automatic language mapping for unsupported languages
- **⚡ UnifiedMessaging Integration**: Optimized timeouts and reliable communication

**✅ Benefits of Complete Unification:**
- **🎯 Single Source of Truth**: All TTS functionality consolidated into one composable
- **🚀 Performance**: ~600 lines of duplicate code removed, faster loading
- **🔧 Maintainability**: Single system to debug, test, and improve
- **📱 Consistency**: Identical TTS experience across Popup, Sidepanel, and WindowsManager
- **🌍 Language Support**: Persian, Kurdish, Armenian, and other languages now work seamlessly
- **💫 State Synchronization**: Perfect coordination between all extension contexts

### Chrome MV3 Messaging Reliability (Version 1.5-1.6)
The system has been enhanced to handle Chrome Manifest V3 messaging issues that were causing TTS failures:

**Problems Resolved:**
- **Empty Response Issue**: Fixed Chrome MV3 bug where `sendResponse()` in offscreen documents returned undefined responses
- **Race Conditions**: Eliminated timing issues between background scripts and offscreen documents
- **Duplicate Requests**: Removed redundant TTS calls in `TTSButton.vue` retry mechanism
- **Audio Cleanup**: Fixed null pointer exceptions during concurrent TTS requests
- **Port Communication**: Fixed ReliableMessaging port fallback to return actual result data instead of wrapper

**Technical Solutions:**
- **Event-Driven Architecture**: Replaced unreliable response-based communication with event messaging (`GOOGLE_TTS_ENDED`)
- **Graceful Fallback**: Background script now assumes success on empty responses and relies on completion events
- **Race Condition Prevention**: Added null safety checks in offscreen audio handling
- **Request Deduplication**: Enhanced `isProcessing` flags to prevent multiple simultaneous requests
- **Port Messaging Fix**: Fixed ReliableMessaging to properly extract result data from port communication wrapper
- **Smart Stop Logic**: Implemented unified `TTS_STOP` handler that differentiates between specific and global stops
- **Persistent TTS ID Management**: Fixed `currentTTSId` lifecycle to persist during audio playback instead of being cleared prematurely

### Cross-Component Standardization
Successfully standardized TTS functionality across all three extension components:

**Components Updated:**
- **Popup**: Uses ActionToolbar with optimized animations
- **Sidepanel**: Maintains existing smooth ActionToolbar integration  
- **WindowsManager**: Migrated from standalone TTSButton to ActionToolbar for consistent styling

**Styling Improvements:**
- Hardware-accelerated animations (`will-change`, `transform: translateZ(0)`)
- Consistent button sizes and spacing across components
- Unified error states and loading indicators

## 🎉 Benefits of the Fully Unified TTS System (2025)

1.  **🎯 Complete Unification**: All TTS functionality consolidated in `useTTSSmart.js` - zero duplicate implementations
2.  **🚀 Performance Excellence**: 600+ lines of redundant code eliminated for faster loading and execution
3.  **🌍 Universal Language Support**: Automatic fallback system ensures all languages work (Persian → Arabic, etc.)
4.  **🔧 Simplified Maintenance**: Single composable to maintain, debug, and enhance across all contexts
5.  **📱 Perfect Consistency**: Identical TTS experience in Popup, Sidepanel, and WindowsManager
6.  **⚡ Intelligent Messaging**: UnifiedMessaging integration with optimized timeouts for each operation type
7.  **💫 Exclusive Playback**: Smart coordination prevents multiple audio streams from playing simultaneously
8.  **🛡️ Robust Error Handling**: Built-in fallback mechanisms and user-friendly error recovery
9.  **🎨 Rich UI Feedback**: 5-state visual system (idle, loading, playing, paused, error) with progress indicators
10. **🌐 Cross-Browser Compatibility**: Seamless operation on Chrome, Edge, and Firefox with automatic detection
11. **🔄 Lifecycle Management**: Automatic cleanup and memory management across all extension contexts
12. **📊 State Synchronization**: Perfect coordination between UI components and background services
13. **🚀 Future-Proof Architecture**: Extensible design makes it easy to add new features and maintain compatibility
14. **🎮 Full Playback Control**: Complete play, pause, resume, stop, and retry functionality
15. **⚠️ Error Recovery**: Automatic retry for transient issues, manual retry for persistent problems

## 🔍 Troubleshooting Guide

### Common Issues and Solutions

#### "Empty response from offscreen document" Errors
**Symptoms**: Console shows empty response errors but audio still plays
**Root Cause**: Chrome MV3 messaging timing issues
**Solution**: These errors are now handled gracefully - the system assumes success and relies on completion events
**Status**: ✅ **Resolved in v1.5** - No user action needed

#### TTS Button Stuck in Error State  
**Symptoms**: Button shows error icon despite audio playing correctly
**Root Cause**: Response timing mismatch between offscreen and background
**Solution**: Updated to event-driven architecture with proper state management
**Status**: ✅ **Resolved in v1.5** - No user action needed

#### Multiple TTS Requests on Single Click
**Symptoms**: Multiple identical requests in console logs
**Root Cause**: Duplicate `speak()` calls in retry mechanism  
**Solution**: Fixed `TTSButton.vue` to call only `retry()` which handles `speak()` internally
**Status**: ✅ **Resolved in v1.5** - No user action needed

#### Audio Cuts Off or Fails to Start
**Symptoms**: Race conditions during rapid TTS requests
**Root Cause**: Null pointer exceptions during concurrent audio cleanup
**Solution**: Added null safety checks in offscreen document audio handling
**Status**: ✅ **Resolved in v1.5** - No user action needed

#### Inconsistent Styling Across Components
**Symptoms**: TTS buttons look different in Popup vs WindowsManager
**Root Cause**: WindowsManager used standalone TTSButton instead of ActionToolbar
**Solution**: Standardized all components to use ActionToolbar with consistent CSS
**Status**: ✅ **Resolved** - All components now have uniform styling

#### "TTS failed" Errors with Working Audio
**Symptoms**: Frontend shows TTS failed errors but audio plays correctly
**Root Cause**: ReliableMessaging port fallback returned message wrapper instead of actual result data
**Solution**: Fixed ReliableMessaging to extract `result` from port messages properly
**Status**: ✅ **Resolved in v1.6** - Port communication now returns correct response data

#### "No response received for GOOGLE_TTS_STOP_ALL" Timeout Errors
**Symptoms**: Console shows timeout errors for `GOOGLE_TTS_STOP_ALL` action, particularly in PopupApp lifecycle cleanup
**Root Cause**: PopupApp.vue bypassed the unified TTS system and used legacy `GOOGLE_TTS_STOP_ALL` action directly
**Solution**: Updated PopupApp.vue to use `MessageActions.TTS_STOP` like the unified system (TTSButton → useTTSSmart)
**Status**: ✅ **Resolved in v2.1** - All components now use consistent TTS stop mechanism

#### WindowsManager TTS Stop Button Not Working
**Symptoms**: Clicking the TTS stop button in WindowsManager does not stop the audio, though window closure works correctly
**Root Cause**: `currentTTSId` was being cleared prematurely in the `finally` block of the TTS speak handler, before audio actually finished playing
**Solution**: 
- Removed `currentTTSId` cleanup from `finally` block in `handleGoogleTTSSpeak`
- Added `currentTTSId = null` in Firefox `audio.onended` handler
- Created `handleGoogleTTSEnded` handler for Chrome completion events
- Registered `GOOGLE_TTS_ENDED` message handler in LifecycleManager
**Status**: ✅ **Resolved in v2.2** - TTS ID now persists throughout audio playback, enabling reliable stop functionality

#### WindowsManager TTS Stop Button Enhancement (v2.2)
**Changes Implemented**: 
- **Optimized Debug Logs**: Streamlined logging messages for better readability and reduced console noise
- **Enhanced Error Reporting**: Added detailed debug information including current TTS ID when stop requests are skipped
- **Improved Documentation**: Added comprehensive documentation for v2.2 changes and architecture decisions

**Technical Details**:
- Debug logs reduced from verbose emoji-heavy format to concise, readable format
- Error responses now include `currentTTSId` for better debugging capabilities
- Documentation updated with clear explanation of TTS ID lifecycle management

**Status**: ✅ **Enhanced in v2.2.1** - Better debugging experience and improved error handling

### Debugging Tips

1. **Check Extension Console**: Look for TTS-related logs with component prefixes
2. **Verify Version**: Ensure offscreen document shows "Version 1.6" in console  
3. **Test Across Components**: Verify TTS works in Popup, Sidepanel, and WindowsManager
4. **Monitor Network**: Check if Google TTS URLs are accessible
5. **Extension Reload**: Disable/enable extension if issues persist

### System Unification Verification (2025)

To verify the TTS system is properly unified:
- ✅ **Single Composable**: Only `useTTSSmart.js` used across all contexts
- ✅ **No Legacy Code**: `TTSManager.js` completely removed (~600 lines eliminated)
- ✅ **WindowsManager Simplified**: No dual TTS implementations
- ✅ **TranslationWindow Unified**: Single composable approach
- ✅ **Language Fallbacks**: Persian/Kurdish languages work seamlessly  
- ✅ **Consistent State Management**: All components use unified `tts.ttsState.value`
- ✅ **Unified Methods**: All contexts use `tts.speak()`, `tts.stop()`, `tts.retry()`, etc.
- ✅ **UnifiedMessaging**: Optimized timeout management for TTS operations

### Architecture Validation

The unified system is considered healthy when:
- ✅ **Zero Legacy Code**: No `TTSManager.js` references in codebase
- ✅ **Single Composable**: Only `useTTSSmart.js` imported for TTS functionality
- ✅ **Language Fallbacks**: Persian `fa` automatically maps to Arabic `ar`
- ✅ **Proper State Transitions**: `idle → loading → playing → idle`
- ✅ **Cross-Context Coordination**: Exclusive playback between Popup/Sidepanel/WindowsManager  
- ✅ **Error Recovery**: Failed languages automatically attempt fallback
- ✅ **UnifiedMessaging**: Optimized timeouts (20s for TTS operations)
- ✅ **Consistent UI**: Identical TTSButton behavior across all contexts
- ✅ **Smart Stop Handler**: `TTS_STOP` handles both specific and global stops via `currentTTSId` matching
- ✅ **Persistent ID Management**: `currentTTSId` persists during audio playback for reliable stop functionality
- ✅ **Completion Event Handling**: `GOOGLE_TTS_ENDED` properly registered and handled for cleanup
- ✅ **Cross-Browser Audio Cleanup**: Proper ID clearing in both Firefox (`onended`) and Chrome (event-driven)
