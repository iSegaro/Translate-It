# TTS (Text-to-Speech) System Documentation

## 🎯 Overview

The Text-to-Speech (TTS) system in the Translate-It extension provides a robust, stateful, and user-friendly experience for audio playback. It features full **Play, Pause, Resume, and Stop** capabilities, ensuring exclusive playback across all extension components (Popup, Sidepanel, Windows Manager).

The system is built around a single, unified composable (`useTTSSmart`) that handles all TTS functionality, working in coordination with a global manager for state synchronization and providing a rich user interface through the TTSButton component.

## 🏗️ Architecture & Message Flow

The new architecture ensures a clear separation of concerns, from UI interaction to background processing.

### System Flow Diagram

```
User Interaction
    │
    ▼
┌───────────────────┐
│   TTSButton.vue   │ (UI Component with 5 visual states)
└───────────────────┘
    │ (Interacts with)
    ▼
┌───────────────────┐
│  useTTSSmart.js   │ (Composable with state: idle, loading, playing, paused, error)
└───────────────────┘
    │ (Coordinates with)
    ▼
┌───────────────────┐
│ TTSGlobalManager  │ (Singleton for exclusive playback & lifecycle rules)
└───────────────────┘
    │ (Sends message via)
    ▼
┌───────────────────┐
│  MessageActions   │ (e.g., GOOGLE_TTS_PAUSE, GOOGLE_TTS_RESUME, etc.)
└───────────────────┘
    │ (Handled by)
    ▼
┌───────────────────┐
│ Background Handler│ (handleGoogleTTS.js with extended handlers)
└───────────────────┘
    │ (Executes on)
    ▼
┌──────────────────────────────────────────────────┐
│             Browser-Specific Execution           │
│   Chromium (Chrome, Edge)  │   Firefox           │
│   via Offscreen Document   │   via Direct Audio  │
└──────────────────────────────────────────────────┘
```

## Core Components

### 1. `composables/useTTSSmart.js` - The Unified TTS Composable
The **single source of truth** for all TTS functionality in the extension. This composable encapsulates the entire client-side TTS logic, manages state, interacts with the background service, and provides methods for controlling playback.

**Key Features:**
- **Unified State Management**: Manages 5 distinct states: `'idle' | 'loading' | 'playing' | 'paused' | 'error'`
- **Complete Control Methods**: `speak()`, `pause()`, `resume()`, `stop()`, `stopAll()`, and `retry()`
- **Reactive Properties**: `canPause`, `canResume`, `canStop`, `isPlaying`, `isLoading` for UI updates
- **Progress Tracking**: Provides progress value for visual indicators and completion detection
- **Advanced Error Handling**: Integrated error management with automatic and manual recovery strategies
- **Event-Driven Architecture**: Uses completion polling and message events for reliable state synchronization

### 2. `components/shared/TTSButton.vue`
A smart UI component that provides a rich visual experience based on the TTS state.

**Visual States:**
1.  **Idle**: 🔊 Default play icon.
2.  **Loading**: 🔊 Gentle spinning animation.
3.  **Playing**: ⏸️ Pause icon with a circular progress ring.
4.  **Paused**: ▶️ Resume icon.
5.  **Error**: 🔊 Red icon with a tooltip, indicating a problem.

### 3. `composables/useTTSGlobal.js` (`TTSGlobalManager`)
A singleton manager responsible for coordinating all TTS instances across the extension to enforce global rules.

**Responsibilities:**
- **Exclusive Playback**: Ensures that starting a new TTS playback automatically stops any other active instance.
- **Lifecycle Management**:
    - Stops playback when a Popup or Window is closed.
    - Stops playback on tab visibility changes (except for the Sidepanel).
    - Cleans up stale instances automatically.
- **Instance Registry**: Tracks all active TTS components.

### 4. Background & Messaging

#### `messaging/core/MessageActions.js`
The messaging system has been extended with new actions to support the enhanced controls:
- `GOOGLE_TTS_PAUSE`
- `GOOGLE_TTS_RESUME`
- `GOOGLE_TTS_STOP_ALL`
- `GOOGLE_TTS_GET_STATUS`

#### `background/handlers/tts/handleGoogleTTS.js`
The background handler has been upgraded to process the new actions, communicating with the appropriate browser-specific audio player (Offscreen for Chrome, direct audio for Firefox) to pause, resume, or stop playback.

## 🔄 State Management & Lifecycle Rules

The system's intelligence lies in its strict state and lifecycle management.

### Exclusive Playback
A core principle of the new system: **only one TTS instance can be active at any given time**. When a user initiates a new playback, the `TTSGlobalManager` automatically finds and stops any currently playing or paused instance before starting the new one. This prevents audio overlap and creates a predictable user experience.

### Smart Lifecycle
The `TTSGlobalManager` enforces context-aware rules:
- **Popup / Windows Manager**: TTS is automatically stopped if the component's UI is closed or hidden.
- **Sidepanel**: TTS is allowed to persist even when the user switches to a different browser tab, as the sidepanel remains visible.
- **Browser Close**: All TTS instances are stopped when the browser window is about to be unloaded.

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

## 🔧 Recent Improvements & Bug Fixes

### Code Unification & Cleanup (Version 1.7)
The TTS system has been streamlined by removing legacy code and consolidating functionality:

**Legacy Code Removed:**
- **`useTTSAction.js`**: Removed fallback-based TTS system (~300 lines)
- **`useTextActions.js`**: Removed unused wrapper composable  
- **Duplicate Systems**: Eliminated parallel TTS implementations that caused confusion
- **Outdated Exports**: Cleaned up unused exports and imports

**Benefits of Unification:**
- **Single Source of Truth**: All TTS functionality now uses `useTTSSmart.js`
- **Consistent Behavior**: Identical TTS experience across Popup, Sidepanel, and WindowsManager
- **Reduced Complexity**: ~400 lines of redundant code removed
- **Better Maintainability**: Single system to debug, test, and improve
- **State Synchronization**: Unified state management prevents conflicts between components

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

## 🎉 Benefits of the Unified TTS System

1.  **Single Source of Truth**: All TTS functionality consolidated in `useTTSSmart.js` - no more confusion between different TTS systems
2.  **Full Playback Control**: Users can play, pause, resume, and stop audio with consistent behavior
3.  **Superior User Experience**: The `TTSButton` provides clear visual feedback for every state, including loading progress and errors
4.  **Predictable Behavior**: The exclusive playback rule and smart lifecycle management prevent unexpected audio behavior
5.  **Cross-Component Consistency**: Identical TTS experience across Popup, Sidepanel, and WindowsManager
6.  **Reduced Codebase**: ~400 lines of legacy TTS code removed, making the system lighter and easier to maintain
7.  **Chrome MV3 Compatibility**: Robust handling of Chrome extension messaging limitations with fallback mechanisms
8.  **Advanced Error Handling**: Automatic and manual recovery strategies make the feature more reliable
9.  **Race Condition Safety**: Comprehensive null safety and cleanup prevention in concurrent scenarios
10. **Reliable Communication**: Fixed port-based messaging ensures correct response handling even when direct messaging fails
11. **Simplified Architecture**: Single composable system is easier to understand, debug, test, and extend
12. **Performance Optimized**: Resources are managed efficiently, with automatic cleanup of audio objects and stale instances
13. **Future-Proof**: Unified system makes it easier to add new features and maintain compatibility

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

### Debugging Tips

1. **Check Extension Console**: Look for TTS-related logs with component prefixes
2. **Verify Version**: Ensure offscreen document shows "Version 1.6" in console  
3. **Test Across Components**: Verify TTS works in Popup, Sidepanel, and WindowsManager
4. **Monitor Network**: Check if Google TTS URLs are accessible
5. **Extension Reload**: Disable/enable extension if issues persist

### Code Unification Status Check

To verify the TTS system is properly unified:
- ✅ **Single Composable**: Only `useTTSSmart.js` should be imported for TTS functionality
- ✅ **No Legacy Code**: `useTTSAction.js` and `useTextActions.js` should be completely removed
- ✅ **Consistent State Management**: All components should use `tts.ttsState.value` for state
- ✅ **Unified Methods**: All components should use `tts.speak()`, `tts.stop()`, etc.

### Architecture Validation

The system is considered healthy when:
- ✅ No "Empty response" **errors** (debug messages are normal)
- ✅ Single TTS request per user action
- ✅ Proper state transitions: `idle → loading → playing → idle`  
- ✅ `GOOGLE_TTS_ENDED` events received for completion
- ✅ Consistent visual styling across all components
- ✅ **Unified Codebase**: Only `useTTSSmart.js` in use for TTS functionality
