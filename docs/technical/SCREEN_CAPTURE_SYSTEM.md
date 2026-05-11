# Screen Capture & OCR System Documentation

## Overview

The Screen Capture system allows users to extract and translate text from any visual area of a webpage, including images, videos, and complex layouts where standard text selection is impossible. It combines a high-performance interactive overlay with a robust OCR (Optical Character Recognition) engine powered by Tesseract.js.

The system is designed for maximum privacy and performance, supporting fully offline operation through local model caching in IndexedDB and execution in dedicated offscreen contexts.

## Architecture

The system follows a multi-layered execution flow across different extension contexts:

```
User Action (FAB/Shortcut) -> InteractionCoordinator
     ↓
     ├─→ ScreenSelector (Content UI: Selection Overlay)
     │       ↓ (Wait 2 frames for transparency)
     ├─→ Background Orchestrator (handleCaptureScreenArea)
     │       ↓ (browser.tabs.captureVisibleTab)
     ├─→ OCR Processing (Chrome: Offscreen / Firefox: Background)
     │       ↓
     │   OCREngine (Tesseract.js Logic)
     │       ├─→ OCR Cache (IndexedDB Model Injection)
     │       └─→ Image Recognition
     │
     └─→ WindowsManager (Displays translated OCR result)
```

## Core Components

### 1. ScreenSelector.vue (Content Layer)
An interactive overlay injected into the webpage via the UI Host.

**Responsibilities:**
- Area Selection: Handles mouse events to define the capture coordinates.
- UI Transparency: Implements a critical "Two-Frame Transparency" logic (using requestAnimationFrame) to ensure the overlay is invisible during the browser's tab capture process.
- Toolbar Management: Provides real-time controls for language selection and action confirmation.

### 2. OCREngine.js (Service Layer)
The wrapper for Tesseract.js v7 that manages the OCR lifecycle.

**Key Features:**
- Local Asset Loading: Strictly uses local worker and core scripts from `assets/ocr/` to comply with CSP policies.
- Smart Core Selection: Provides multiple WASM cores (Standard, SIMD, and Relaxed-SIMD) allowing Tesseract.js to automatically select the most performant engine based on the user's CPU capabilities.
- Modern API: Implements the 3-argument `createWorker(lang, oem, options)` signature for stable initialization in extension environments.
- Idle Management: Automatically terminates the Tesseract worker after 5 minutes of inactivity to reclaim memory.

### 3. OCR Cache (Storage Layer)
A specialized utility (`ocrCache.js`) using IndexedDB to store `.traineddata.gz` files.

**Functionality:**
- Model Persistence: Saves downloaded OCR models for offline use.
- Injection Logic: Injects cached models directly into the Tesseract worker's virtual filesystem before recognition, preventing redundant network requests.

### 4. Offscreen Context (Chrome Only)
Since Manifest V3 Service Workers do not support certain DOM APIs and have strict execution limits, the OCR process in Chrome runs within `offscreen.html`.

- IPC Communication: Background script forwards image data to Offscreen via standard messaging.
- Isolation: Ensures that heavy OCR computations do not block the main background thread.

## Capture & OCR Lifecycle

### Phase 1: Selection
1. The user activates "Screen Capture" mode.
2. `ScreenSelector` mounts and blocks page interactions.
3. User draws a rectangle; the component captures coordinates and dimensions relative to the viewport.

### Phase 2: Capture
1. `ScreenSelector` sets its opacity to 0.
2. It waits for two consecutive `requestAnimationFrame` cycles to ensure the browser has repainted and the UI is genuinely hidden.
3. A message is sent to the background to execute `browser.tabs.captureVisibleTab`.
4. The background receives a Base64-encoded DataURL of the entire visible tab.

### Phase 3: Recognition
1. The background sends the image data and crop coordinates to the OCR Processor (Offscreen/Background).
2. `OCREngine` initializes the worker for the requested language.
3. If `OCR_AUTO_DOWNLOAD` is enabled, missing models are fetched and cached.
4. The image is cropped to the selected coordinates and processed by Tesseract.
5. Extracted text is returned to the background.

### Phase 4: Result Delivery
1. The background forwards the extracted text to the `UnifiedTranslationService`.
2. The result is displayed in a standard `TranslationWindow` via `WindowsManager`.

## Technical Implementation Details

### Tesseract.js Configuration
To ensure reliability in restricted extension environments, the worker is initialized with specific paths:

```javascript
worker = await createWorker(lang, 1, {
  workerPath: browser.runtime.getURL('assets/ocr/worker.min.js'),
  corePath: browser.runtime.getURL('assets/ocr/'), // Points to dir for smart core selection
  cachePath: '.', // Instructs Tesseract to use IndexedDB in the current scope
  cacheMethod: settings.OCR_AUTO_DOWNLOAD ? 'write' : 'readOnly',
  workerBlobURL: false // Mandatory to prevent CSP Network Errors
});
```

### UI Transparency Logic
Standard `v-if` or immediate `opacity: 0` is often too slow for the browser's capture API. The following pattern is enforced in `ScreenSelector.vue`:

```javascript
async function runCaptureAction() {
  isCapturing.value = true; // Sets opacity: 0 via CSS
  
  // Wait for browser repaint
  await new Promise(resolve => requestAnimationFrame(() => {
    requestAnimationFrame(resolve);
  }));

  // Safe to capture now
  const result = await captureVisibleTab();
}
```

## Message Handlers

| Action | Context | Description |
|--------|---------|-------------|
| `START_SCREEN_CAPTURE` | Background -> Content | Activates the ScreenSelector overlay. |
| `CAPTURE_SCREEN_AREA` | Content -> Background | Requests the background to take a screenshot and perform OCR. |
| `OCR_PROCESS` | Background -> Offscreen | (Chrome Only) Instructs Offscreen to run the recognition logic. |

## Configuration & Settings

The system respects several user preferences managed in the OCR Tab of the Options page:

- `OCR_DEFAULT_LANG`: The preferred language for recognition (Defaults to 'eng').
- `OCR_AUTO_DOWNLOAD`: Toggles whether the engine should automatically fetch missing models from remote sources.
- `OCR_RECOGNITION_LEVEL`: (Future) Adjusts between Fast and Best recognition models.

## Offline Architecture

The system achieves "True Offline" capability through the following strategy:
1. First use/Download: When a language is first requested, it is downloaded from the projectnaptha CDN.
2. Cache Store: The model is saved to IndexedDB (`translate-it-ocr-models`).
3. Subsequent Use: `ocrEngine` detects the cached model and instructs Tesseract to use it directly, bypassing any network calls.
4. Deployment: Critical OCR binaries (Worker/Core/Wasm) are bundled within the extension package under `assets/ocr/`. This includes multiple WASM versions (Standard, SIMD, Relaxed-SIMD) to ensure optimal performance on any hardware without runtime errors.

## Debugging

To debug OCR issues:
1. Open the Background Service Worker console.
2. (Chrome) Open `chrome://inspect/#others` to find and inspect the `offscreen.html` console.
3. Look for `[OCREngine]` scoped logs for initialization and recognition steps.
4. Verify asset paths using `Initializing Tesseract with local paths` debug logs.

---
**Last Updated**: May 2026
