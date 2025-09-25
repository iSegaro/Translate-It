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
    previewConfirmedModule,
    previewCancelledModule,
    previewRetryModule,
    resultClosedModule,
    captureErrorModule,
    areaSelectionCancelModule
  ] = await Promise.all([
    import('@/features/screen-capture/handlers/handleStartAreaCapture.js'),
    import('@/features/screen-capture/handlers/handleStartFullScreenCapture.js'),
    import('@/features/screen-capture/handlers/handleRequestFullScreenCapture.js'),
    import('@/features/screen-capture/handlers/handleProcessAreaCaptureImage.js'),
    import('@/features/screen-capture/handlers/handlePreviewConfirmed.js'),
    import('@/features/screen-capture/handlers/handlePreviewCancelled.js'),
    import('@/features/screen-capture/handlers/handlePreviewRetry.js'),
    import('@/features/screen-capture/handlers/handleResultClosed.js'),
    import('@/features/screen-capture/handlers/handleCaptureError.js'),
    import('@/features/screen-capture/handlers/handleAreaSelectionCancel.js')
  ]);

  screenCaptureHandlers = {
    handleStartAreaCapture: startAreaModule.handleStartAreaCapture,
    handleStartFullScreenCapture: startFullScreenModule.handleStartFullScreenCapture,
    handleRequestFullScreenCapture: requestFullScreenModule.handleRequestFullScreenCapture,
    handleProcessAreaCaptureImage: processAreaModule.handleProcessAreaCaptureImage,
    handlePreviewConfirmed: previewConfirmedModule.handlePreviewConfirmed,
    handlePreviewCancelled: previewCancelledModule.handlePreviewCancelled,
    handlePreviewRetry: previewRetryModule.handlePreviewRetry,
    handleResultClosed: resultClosedModule.handleResultClosed,
    handleCaptureError: captureErrorModule.handleCaptureError,
    handleAreaSelectionCancel: areaSelectionCancelModule.handleAreaSelectionCancel
  };

  logger.debug('Screen capture handlers loaded successfully');
  return screenCaptureHandlers;
}

/**
 * Lazy handler for START_AREA_CAPTURE
 */
export const handleStartAreaCaptureLazy = async (message, sender) => {
  const { handleStartAreaCapture } = await loadScreenCaptureHandlers();
  return await handleStartAreaCapture(message, sender);
};

/**
 * Lazy handler for START_FULL_SCREEN_CAPTURE
 */
export const handleStartFullScreenCaptureLazy = async (message, sender) => {
  const { handleStartFullScreenCapture } = await loadScreenCaptureHandlers();
  return await handleStartFullScreenCapture(message, sender);
};

/**
 * Lazy handler for REQUEST_FULL_SCREEN_CAPTURE
 */
export const handleRequestFullScreenCaptureLazy = async (message, sender) => {
  const { handleRequestFullScreenCapture } = await loadScreenCaptureHandlers();
  return await handleRequestFullScreenCapture(message, sender);
};

/**
 * Lazy handler for PROCESS_AREA_CAPTURE_IMAGE
 */
export const handleProcessAreaCaptureImageLazy = async (message, sender) => {
  const { handleProcessAreaCaptureImage } = await loadScreenCaptureHandlers();
  return await handleProcessAreaCaptureImage(message, sender);
};

/**
 * Lazy handler for PREVIEW_CONFIRMED
 */
export const handlePreviewConfirmedLazy = async (message, sender) => {
  const { handlePreviewConfirmed } = await loadScreenCaptureHandlers();
  return await handlePreviewConfirmed(message, sender);
};

/**
 * Lazy handler for PREVIEW_CANCELLED
 */
export const handlePreviewCancelledLazy = async (message, sender) => {
  const { handlePreviewCancelled } = await loadScreenCaptureHandlers();
  return await handlePreviewCancelled(message, sender);
};

/**
 * Lazy handler for PREVIEW_RETRY
 */
export const handlePreviewRetryLazy = async (message, sender) => {
  const { handlePreviewRetry } = await loadScreenCaptureHandlers();
  return await handlePreviewRetry(message, sender);
};

/**
 * Lazy handler for RESULT_CLOSED
 */
export const handleResultClosedLazy = async (message, sender) => {
  const { handleResultClosed } = await loadScreenCaptureHandlers();
  return await handleResultClosed(message, sender);
};

/**
 * Lazy handler for CAPTURE_ERROR
 */
export const handleCaptureErrorLazy = async (message, sender) => {
  const { handleCaptureError } = await loadScreenCaptureHandlers();
  return await handleCaptureError(message, sender);
};

/**
 * Lazy handler for AREA_SELECTION_CANCEL
 */
export const handleAreaSelectionCancelLazy = async (message, sender) => {
  const { handleAreaSelectionCancel } = await loadScreenCaptureHandlers();
  return await handleAreaSelectionCancel(message, sender);
};