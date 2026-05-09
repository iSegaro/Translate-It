// src/core/background/handlers/lazy/handleScreenCaptureLazy.js
// Lazy loading handlers for screen capture functionality

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'ScreenCaptureLazy');

let screenCaptureHandlers = null;

/**
 * Load screen capture handlers lazily
 */
async function loadScreenCaptureHandlers() {
  if (screenCaptureHandlers) {
    return screenCaptureHandlers;
  }

  logger.debug('Loading screen capture handlers lazily');

  const [
    startAreaModule,
    startFullScreenModule,
    requestFullScreenModule,
    processAreaModule,
    captureErrorModule,
    areaSelectionCancelModule
  ] = await Promise.all([
    import('@/features/screen-capture/handlers/handleStartAreaCapture.js'),
    import('@/features/screen-capture/handlers/handleStartFullScreenCapture.js'),
    import('@/features/screen-capture/handlers/handleRequestFullScreenCapture.js'),
    import('@/features/screen-capture/handlers/handleProcessAreaCaptureImage.js'),
    import('@/features/screen-capture/handlers/handleCaptureError.js'),
    import('@/features/screen-capture/handlers/handleAreaSelectionCancel.js')
  ]);

  screenCaptureHandlers = {
    handleStartAreaCapture: startAreaModule.handleStartAreaCapture,
    handleStartFullScreenCapture: startFullScreenModule.handleStartFullScreenCapture,
    handleRequestFullScreenCapture: requestFullScreenModule.handleRequestFullScreenCapture,
    handleProcessAreaCaptureImage: processAreaModule.handleProcessAreaCaptureImage,
    handleCaptureError: captureErrorModule.handleCaptureError,
    handleAreaSelectionCancel: areaSelectionCancelModule.handleAreaSelectionCancel
  };

  logger.debug('Screen capture handlers loaded successfully');
  return screenCaptureHandlers;
}

/**
 * Lazy handler for START_AREA_CAPTURE
 */
export const handleStartAreaCaptureLazy = async (message, sender, sendResponse) => {
  const { handleStartAreaCapture } = await loadScreenCaptureHandlers();
  return await handleStartAreaCapture(message, sender, sendResponse);
};

/**
 * Lazy handler for START_FULL_SCREEN_CAPTURE
 */
export const handleStartFullScreenCaptureLazy = async (message, sender, sendResponse) => {
  const { handleStartFullScreenCapture } = await loadScreenCaptureHandlers();
  return await handleStartFullScreenCapture(message, sender, sendResponse);
};

/**
 * Lazy handler for REQUEST_FULL_SCREEN_CAPTURE
 */
export const handleRequestFullScreenCaptureLazy = async (message, sender, sendResponse) => {
  const { handleRequestFullScreenCapture } = await loadScreenCaptureHandlers();
  return await handleRequestFullScreenCapture(message, sender, sendResponse);
};

/**
 * Lazy handler for PROCESS_AREA_CAPTURE_IMAGE
 */
export const handleProcessAreaCaptureImageLazy = async (message, sender, sendResponse) => {
  const { handleProcessAreaCaptureImage } = await loadScreenCaptureHandlers();
  return await handleProcessAreaCaptureImage(message, sender, sendResponse);
};

/**
 * Lazy handler for CAPTURE_ERROR
 */
export const handleCaptureErrorLazy = async (message, sender, sendResponse) => {
  const { handleCaptureError } = await loadScreenCaptureHandlers();
  return await handleCaptureError(message, sender, sendResponse);
};

/**
 * Lazy handler for AREA_SELECTION_CANCEL
 */
export const handleAreaSelectionCancelLazy = async (message, sender, sendResponse) => {
  const { handleAreaSelectionCancel } = await loadScreenCaptureHandlers();
  return await handleAreaSelectionCancel(message, sender, sendResponse);
};
