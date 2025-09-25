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
export * from "@/features/translation/handlers/handleTranslate.js";
export * from "@/features/translation/handlers/handleTranslateText.js";
export * from "./translation/handleTranslationResult.js";
export * from "@/features/translation/handlers/handleRevertTranslation.js";
export * from "@/features/translation/handlers/handleCancelTranslation.js";

// TTS handlers - Lazy loaded for better performance
export * from "./lazy/handleTTSLazy.js";

// Element selection handlers - Lazy loaded for better performance
export * from "./lazy/handleElementSelectionLazy.js";
export * from "./selection/handleSelectElement.js";

// Screen capture handlers
export * from "@/features/screen-capture/handlers/handleStartAreaCapture.js";
export * from "@/features/screen-capture/handlers/handleStartFullScreenCapture.js";
export * from "@/features/screen-capture/handlers/handleRequestFullScreenCapture.js";
export * from "@/features/screen-capture/handlers/handleProcessAreaCaptureImage.js";
export * from "@/features/screen-capture/handlers/handlePreviewConfirmed.js";
export * from "@/features/screen-capture/handlers/handlePreviewCancelled.js";
export * from "@/features/screen-capture/handlers/handlePreviewRetry.js";
export * from "@/features/screen-capture/handlers/handleResultClosed.js";
export * from "@/features/screen-capture/handlers/handleCaptureError.js";
export * from "@/features/screen-capture/handlers/handleAreaSelectionCancel.js";

// Text selection handlers
export * from "./text-selection/handleGetSelectedText.js";

// Page exclusion handlers
export * from "./page-exclusion/handleIsCurrentPageExcluded.js";
export * from "./page-exclusion/handleSetExcludeCurrentPage.js";

// Sidepanel handlers
export * from "./sidepanel/handleOpenSidePanel.js";

// Vue integration handlers
export * from "./vue-integration/handleTranslateImage.js";
export * from "./vue-integration/handleProviderStatus.js";
export * from "./vue-integration/handleTestProviderConnection.js";
export * from "./vue-integration/handleSaveProviderConfig.js";
export * from "./vue-integration/handleGetProviderConfig.js";
export * from "./vue-integration/handleStartScreenCapture.js";
export * from "./vue-integration/handleCaptureScreenArea.js";
export * from "./vue-integration/handleUpdateContextMenu.js";
export * from "./vue-integration/handleGetExtensionInfo.js";
export * from "./vue-integration/handleLogError.js";
export * from "./vue/handleVueBridge.js";
