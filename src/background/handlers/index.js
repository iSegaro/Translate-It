// src/background/handlers/index.js
// This file serves as a barrel file, importing and exporting all individual handlers.

// Common handlers
export * from "./common/handlePing.js";
export * from "./common/handleOpenOptionsPage.js";
export * from "./common/handleOpenURL.js";
export * from "./common/handleShowOSNotification.js";
export * from "./common/handleRefreshContextMenus.js";
export * from "./common/handleContentScriptWillReload.js";

// Lifecycle handlers
export * from "./lifecycle/handleContextInvalid.js";
export * from "./lifecycle/handleExtensionReloaded.js";
export * from "./lifecycle/handleRestartContentScript.js";
export * from "./lifecycle/handleBackgroundReloadExtension.js";

// Translation handlers
export * from "./translation/handleTranslate.js";
export * from "./translation/handleFetchTranslation.js";
export * from "./translation/handleTranslationAdded.js";
export * from "./translation/handleFetchTranslationBackground.js";
export * from "./translation/handleRevertTranslation.js";

// TTS handlers
export * from "./tts/handleSpeak.js";
export * from "./tts/handleStopTTS.js";
export * from "./tts/handleTTSSpeakContent.js";
export * from "./tts/handleOffscreenReady.js";
export * from "./tts/handleTTSOffscreen.js";

// Element selection handlers
export * from "./element-selection/handleActivateSelectElementMode.js";
export * from "./element-selection/handleUpdateSelectElementState.js";
export * from "./element-selection/handleElementSelected.js";
export * from "./element-selection/handleApplyTranslationToActiveElement.js";

// Screen capture handlers
export * from "./screen-capture/handleStartAreaCapture.js";
export * from "./screen-capture/handleStartFullScreenCapture.js";
export * from "./screen-capture/handleRequestFullScreenCapture.js";
export * from "./screen-capture/handleProcessAreaCaptureImage.js";
export * from "./screen-capture/handlePreviewConfirmed.js";
export * from "./screen-capture/handlePreviewCancelled.js";
export * from "./screen-capture/handlePreviewRetry.js";
export * from "./screen-capture/handleResultClosed.js";
export * from "./screen-capture/handleCaptureError.js";
export * from "./screen-capture/handleAreaSelectionCancel.js";

// Text selection handlers
export * from "./text-selection/handleGetSelectedText.js";

// Page exclusion handlers
export * from "./page-exclusion/handleIsCurrentPageExcluded.js";
export * from "./page-exclusion/handleSetExcludeCurrentPage.js";

// Sidepanel handlers
export * from "./sidepanel/handleOpenSidePanel.js";
