// src/core/background/handlers/lazy/handleVueIntegrationLazy.js
// Lazy loading handlers for Vue integration functionality

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'VueIntegrationLazy');

let vueIntegrationHandlers = null;

/**
 * Load Vue integration handlers lazily
 */
async function loadVueIntegrationHandlers() {
  if (vueIntegrationHandlers) {
    return vueIntegrationHandlers;
  }

  logger.debug('Loading Vue integration handlers lazily');

  const [
    translateImageModule,
    providerStatusModule,
    testProviderModule,
    saveProviderModule,
    getProviderModule,
    startScreenCaptureModule,
    captureScreenModule,
    updateContextMenuModule,
    getExtensionInfoModule,
    logErrorModule,
    syncOCRLanguagesModule,
    vueBridgeModule
  ] = await Promise.all([
    import('../vue-integration/handleTranslateImage.js'),
    import('../vue-integration/handleProviderStatus.js'),
    import('../vue-integration/handleTestProviderConnection.js'),
    import('../vue-integration/handleSaveProviderConfig.js'),
    import('../vue-integration/handleGetProviderConfig.js'),
    import('../vue-integration/handleStartScreenCapture.js'),
    import('../vue-integration/handleCaptureScreenArea.js'),
    import('../vue-integration/handleUpdateContextMenu.js'),
    import('../vue-integration/handleGetExtensionInfo.js'),
    import('../vue-integration/handleLogError.js'),
    import('../vue-integration/handleSyncOCRLanguages.js'),
    import('../vue/handleVueBridge.js')
  ]);

  vueIntegrationHandlers = {
    handleTranslateImage: translateImageModule.handleTranslateImage,
    handleProviderStatus: providerStatusModule.handleProviderStatus,
    handleTestProviderConnection: testProviderModule.handleTestProviderConnection,
    handleSaveProviderConfig: saveProviderModule.handleSaveProviderConfig,
    handleGetProviderConfig: getProviderModule.handleGetProviderConfig,
    handleStartScreenCapture: startScreenCaptureModule.handleStartScreenCapture,
    handleCaptureScreenArea: captureScreenModule.handleCaptureScreenArea,
    handleUpdateContextMenu: updateContextMenuModule.handleUpdateContextMenu,
    handleGetExtensionInfo: getExtensionInfoModule.handleGetExtensionInfo,
    handleLogError: logErrorModule.handleLogError,
    handleSyncOCRLanguages: syncOCRLanguagesModule.handleSyncOCRLanguages,
    handleVueBridge: vueBridgeModule.handleVueBridge
  };

  logger.debug('Vue integration handlers loaded successfully');
  return vueIntegrationHandlers;
}

/**
 * Lazy handler for TRANSLATE_IMAGE
 */
export const handleTranslateImageLazy = async (message, sender, sendResponse) => {
  const { handleTranslateImage } = await loadVueIntegrationHandlers();
  return await handleTranslateImage(message, sender, sendResponse);
};

/**
 * Lazy handler for PROVIDER_STATUS
 */
export const handleProviderStatusLazy = async (message, sender, sendResponse) => {
  const { handleProviderStatus } = await loadVueIntegrationHandlers();
  return await handleProviderStatus(message, sender, sendResponse);
};

/**
 * Lazy handler for TEST_PROVIDER_CONNECTION
 */
export const handleTestProviderConnectionLazy = async (message, sender, sendResponse) => {
  const { handleTestProviderConnection } = await loadVueIntegrationHandlers();
  return await handleTestProviderConnection(message, sender, sendResponse);
};

/**
 * Lazy handler for SAVE_PROVIDER_CONFIG
 */
export const handleSaveProviderConfigLazy = async (message, sender, sendResponse) => {
  const { handleSaveProviderConfig } = await loadVueIntegrationHandlers();
  return await handleSaveProviderConfig(message, sender, sendResponse);
};

/**
 * Lazy handler for GET_PROVIDER_CONFIG
 */
export const handleGetProviderConfigLazy = async (message, sender, sendResponse) => {
  const { handleGetProviderConfig } = await loadVueIntegrationHandlers();
  return await handleGetProviderConfig(message, sender, sendResponse);
};

/**
 * Lazy handler for START_SCREEN_CAPTURE
 */
export const handleStartScreenCaptureLazy = async (message, sender, sendResponse) => {
  const { handleStartScreenCapture } = await loadVueIntegrationHandlers();
  return await handleStartScreenCapture(message, sender, sendResponse);
};

/**
 * Lazy handler for CAPTURE_SCREEN_AREA
 */
export const handleCaptureScreenAreaLazy = async (message, sender, sendResponse) => {
  const { handleCaptureScreenArea } = await loadVueIntegrationHandlers();
  return await handleCaptureScreenArea(message, sender, sendResponse);
};

/**
 * Lazy handler for UPDATE_CONTEXT_MENU
 */
export const handleUpdateContextMenuLazy = async (message, sender, sendResponse) => {
  const { handleUpdateContextMenu } = await loadVueIntegrationHandlers();
  return await handleUpdateContextMenu(message, sender, sendResponse);
};

/**
 * Lazy handler for GET_EXTENSION_INFO
 */
export const handleGetExtensionInfoLazy = async (message, sender, sendResponse) => {
  const { handleGetExtensionInfo } = await loadVueIntegrationHandlers();
  return await handleGetExtensionInfo(message, sender, sendResponse);
};

/**
 * Lazy handler for LOG_ERROR
 */
export const handleLogErrorLazy = async (message, sender, sendResponse) => {
  const { handleLogError } = await loadVueIntegrationHandlers();
  return await handleLogError(message, sender, sendResponse);
};

/**
 * Lazy handler for SYNC_OCR_DOWNLOADABLE_LANGUAGES
 */
export const handleSyncOCRLanguagesLazy = async (message, sender, sendResponse) => {
  const { handleSyncOCRLanguages } = await loadVueIntegrationHandlers();
  return await handleSyncOCRLanguages(message, sender, sendResponse);
};

/**
 * Lazy handler for VUE_BRIDGE
 */
export const handleVueBridgeLazy = async (message, sender, sendResponse) => {
  const { handleVueBridge } = await loadVueIntegrationHandlers();
  return await handleVueBridge(message, sender, sendResponse);
};