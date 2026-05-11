// src/core/background/handlers/lazy/handleScreenCaptureLazy.js
// Lazy loading handlers for screen capture functionality - Simplified (Consolidated Flow)

/**
 * Note: Main screen capture handlers are now partially managed via handleVueIntegrationLazy.js
 * for better integration with Vue apps.
 * 
 * Flow: 
 * START_SCREEN_CAPTURE -> handleStartScreenCapture (Vue Integration)
 * CAPTURE_SCREEN_AREA -> handleCaptureScreenArea (Vue Integration)
 * SCREEN_CAPTURE_OCR_RESULT -> ContentMessageHandler -> ScreenCaptureCoordinator
 */

// This file is kept for backward compatibility and potential future specialized handlers
// but the main flow now uses Vue Integration handlers.
