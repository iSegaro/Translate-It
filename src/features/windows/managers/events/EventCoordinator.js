import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { WINDOWS_MANAGER_EVENTS, WindowsManagerEvents, pageEventBus } from '@/core/PageEventBus.js';
import { SELECTION_EVENTS } from '@/features/text-selection/events/SelectionEvents.js';
import { WindowsConfig } from "../core/WindowsConfig.js";
import { state as globalState } from "@/shared/config/config.js";

/**
 * Handles internal Vue events and cross-frame messages
 */
export class EventCoordinator {
  constructor(facade, dependencies) {
    this.facade = facade;
    this.logger = getScopedLogger(LOG_COMPONENTS.WINDOWS, 'EventCoordinator');
    
    // Inject dependencies from facade
    this.state = dependencies.state;
    this.crossFrameManager = dependencies.crossFrameManager;
    this.translationHandler = dependencies.translationHandler;
    this.errorHandler = dependencies.errorHandler;
    this.clickManager = dependencies.clickManager;
    this.themeManager = dependencies.themeManager;
    this.positionCalculator = dependencies.positionCalculator; // If needed
  }

  setup() {
    this.crossFrameManager.setEventHandlers({
      onOutsideClick: this._handleCrossFrameOutsideClick.bind(this),
      onWindowCreationRequest: this._handleWindowCreationRequest.bind(this),
      onWindowCreatedResponse: this._handleWindowCreatedResponse.bind(this),
      onTextSelectionWindowRequest: this._handleTextSelectionWindowRequest.bind(this)
    });

    this.clickManager.setHandlers({
      onOutsideClick: this._handleOutsideClick.bind(this),
      onIconClick: this._handleIconClick.bind(this)
    });

    if (pageEventBus) {
      this.facade._iconClickHandler = (payload) => {
        this._handleIconClickFromVue(payload);
      };
      this.facade._speakRequestHandler = this._handleSpeakRequest.bind(this);
      this.facade._retryRequestHandler = this._handleRetryRequest.bind(this);
      this.facade._changeProviderRequestHandler = this._handleChangeProviderRequest.bind(this);
      
      pageEventBus.on(WINDOWS_MANAGER_EVENTS.ICON_CLICKED, this.facade._iconClickHandler);
      pageEventBus.on('translation-window-speak', this.facade._speakRequestHandler);
      pageEventBus.on('translation-window-retry', this.facade._retryRequestHandler);
      pageEventBus.on('translation-window-change-provider', this.facade._changeProviderRequestHandler);

      this.facade._dismissRequestHandler = () => {
        if (this.facade._isIconToWindowTransition) {
          return;
        }
        this.facade.dismiss(false);
      };
      
      pageEventBus.on(WINDOWS_MANAGER_EVENTS.DISMISS_WINDOW, this.facade._dismissRequestHandler);
      pageEventBus.on(WINDOWS_MANAGER_EVENTS.DISMISS_ICON, this.facade._dismissRequestHandler);

      this.facade._selectionTriggerHandler = (payload) => {
        this._handleSelectionTrigger(payload);
      };
      pageEventBus.on(SELECTION_EVENTS.GLOBAL_SELECTION_TRIGGER, this.facade._selectionTriggerHandler);

      this.facade._selectionClearHandler = () => {
        if (this.state.isVisible || this.state.isIconMode) {
          if (this.state.isPinned) return;
          this.facade.dismiss(false);
        }
      };
      pageEventBus.on(SELECTION_EVENTS.GLOBAL_SELECTION_CLEAR, this.facade._selectionClearHandler);

      this.facade._selectionChangeHandler = (detail) => {
        this.facade.show(detail.text, detail.position, detail.options);
      };
      pageEventBus.on(SELECTION_EVENTS.GLOBAL_SELECTION_CHANGE, this.facade._selectionChangeHandler);
    }
  }

  /**
   * Handle translation trigger for pending selections
   */
  async _handleSelectionTrigger(payload) {
    const { text, position, options = {} } = payload;
    if (text && position) {
      await this.facade.show(text, position, options);
    }
  }

  /**
   * Handle TTS speak request from Vue component
   */
  async _handleSpeakRequest(detail) {
    if (!detail || !detail.text) return;

    try {
      const tts = await this.facade._ensureTTSLoaded();
      if (detail.isSpeaking) {
        await tts.speak(detail.text, detail.language || 'auto');
      } else {
        await tts.stop();
      }
    } catch (error) {
      await this.errorHandler.handle(error, { context: 'windows-tts', showToast: true });
    }
  }

  /**
   * Handle translation retry request
   */
  async _handleRetryRequest(detail) {
    const windowId = detail.id || this.state.activeWindowId;
    const textToTranslate = detail.text || this.state.originalText;

    if (!windowId || !textToTranslate) return;

    WindowsManagerEvents.updateWindow(windowId, { isLoading: true, isError: false, initialTranslatedText: '' });

    try {
      const translationResult = await this.facade._startTranslationProcess(textToTranslate, windowId);
      if (!translationResult) return;

      WindowsManagerEvents.updateWindow(windowId, {
        isLoading: false,
        isStreaming: false,
        isError: false,
        initialTranslatedText: translationResult.translatedText,
        sourceLanguage: translationResult.sourceLanguage || 'auto',
        detectedSourceLanguage: translationResult.sourceLanguage,
        provider: translationResult.provider
      });
    } catch (error) {
      const errorInfo = await this.errorHandler.getErrorForUI(error, 'windows-translation');
      const fallbackProvider = this.translationHandler.getEffectiveProvider(textToTranslate, { provider: this.state.provider });
      WindowsManagerEvents.updateWindow(windowId, {
        isLoading: false,
        isStreaming: false,
        isError: true,
        errorType: errorInfo.type,
        canRetry: errorInfo.canRetry,
        needsSettings: errorInfo.needsSettings,
        initialTranslatedText: errorInfo.message,
        provider: fallbackProvider
      });
    }
  }

  /**
   * Handle provider change request
   */
  async _handleChangeProviderRequest(detail) {
    const windowId = detail.id || this.state.activeWindowId;
    const newProvider = detail.provider;
    const textToTranslate = this.state.originalText;

    if (!windowId || !textToTranslate || !newProvider) return;

    this.state.setProvider(newProvider);
    WindowsManagerEvents.updateWindow(windowId, { isLoading: true, isError: false, initialTranslatedText: '', provider: newProvider });

    try {
      const translationResult = await this.facade._startTranslationProcess(textToTranslate, windowId);
      if (!translationResult) return;

      WindowsManagerEvents.updateWindow(windowId, {
        isLoading: false,
        isStreaming: false,
        isError: false,
        initialTranslatedText: translationResult.translatedText,
        sourceLanguage: translationResult.sourceLanguage || 'auto',
        detectedSourceLanguage: translationResult.sourceLanguage,
        targetLanguage: translationResult.targetLanguage,
        provider: translationResult.provider
      });
    } catch (error) {
      const errorInfo = await this.errorHandler.getErrorForUI(error, 'windows-translation-retry');      
      WindowsManagerEvents.updateWindow(windowId, {
        isLoading: false,
        isStreaming: false,
        isError: true,
        errorType: errorInfo.type,
        canRetry: errorInfo.canRetry,
        needsSettings: errorInfo.needsSettings,
        initialTranslatedText: errorInfo.message,
        provider: newProvider
      });
    }
  }

  /**
   * Handle cross-frame outside click
   */
  async _handleCrossFrameOutsideClick() {
    if (window.__TRANSLATION_WINDOW_IS_DRAGGING === true || window.__TRANSLATION_WINDOW_JUST_DRAGGED === true) return;
    if (this.state.hasActiveElements) {
      await this.facade.dismiss(true);
    }
  }

  /**
   * Handle outside click
   */
  async _handleOutsideClick() {
    if (this.state.shouldPreventDismissal) return;
    if (window.__TRANSLATION_WINDOW_IS_DRAGGING === true || window.__TRANSLATION_WINDOW_JUST_DRAGGED === true) return;

    let textSelectionManager = null;
    if (window.textSelectionManager) {
      textSelectionManager = window.textSelectionManager;
    } else if (window.TranslateItTextSelectionManager) {
      textSelectionManager = window.TranslateItTextSelectionManager;
    }

    if (textSelectionManager && (textSelectionManager.isDragging || textSelectionManager.justFinishedDrag || textSelectionManager.preventDismissOnNextClear)) {
      return;
    }

    const hasStoredMobileText = this.facade.displayManager.shouldUseMobileUI() && this.state.originalText;
    if (this.state.hasActiveElements || hasStoredMobileText) {
      await this.facade.dismiss(true);
    }
  }

  /**
   * Handle icon click
   */
  _handleIconClick() {
    const context = this.clickManager.handleIconClick(this.state.iconClickContext);
    if (!context) return;

    if (globalState && typeof globalState === 'object') {
      globalState.preventTextFieldIconCreation = true;
    }

    if (context.iconId) {
      WindowsManagerEvents.iconClicked({ id: context.iconId, text: context.text, position: context.position });
    }

    this.facade.dismissalManager._cleanupIcon(false);
    this.facade.displayManager._showWindow(context.text, context.position);
    this.clickManager.completeIconTransition();
    
    setTimeout(() => {
      if (globalState && typeof globalState === 'object') {
        globalState.preventTextFieldIconCreation = false;
      }
    }, WindowsConfig.TIMEOUTS.PENDING_WINDOW_RESET);
  }

  /**
   * Handle icon click event from the Vue UI Host
   */
  async _handleIconClickFromVue(detail) {
    if (!detail || !detail.id) return;
    if (this.state.isProcessing) return;

    const now = Date.now();
    if (this.facade._lastProcessedClick && this.facade._lastProcessedClick.id === detail.id && (now - this.facade._lastProcessedClick.timestamp) < 500) {
      return;
    }

    const { id, text, position } = detail;
    this.facade._lastProcessedClick = { id, timestamp: now };
    this.state.setProcessing(true);

    if (globalState && typeof globalState === 'object') {
      globalState.preventTextFieldIconCreation = true;
    }

    this.facade._isIconToWindowTransition = true;
    const showPromise = this.facade.displayManager._showWindow(text, position);

    setTimeout(() => {
      this.state.setIconMode(false);
      WindowsManagerEvents.dismissIcon(id);
      this.facade.dismissalManager._removeDismissListener();
    }, 120);

    await showPromise;
    setTimeout(() => {
      if (globalState && typeof globalState === 'object') {
        globalState.preventTextFieldIconCreation = false;
      }
      this.state.setProcessing(false);
      this.facade._isIconToWindowTransition = false;
      this.facade._lastProcessedClick = null;
    }, WindowsConfig.TIMEOUTS.PENDING_WINDOW_RESET);
  }

  /**
   * Handle window creation request from iframe
   */
  async _handleWindowCreationRequest(data) {
    if (!this.crossFrameManager.isTopFrame) return;

    try {
      let adjustedPosition = { ...data.position };
      // Note: positionCalculator logic was removed from WM but kept in sub-modules if needed
      // Here it seems we need it for iframe support
      
      const windowId = `translation-window-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      WindowsManagerEvents.showWindow({
        id: windowId,
        selectedText: data.selectedText,
        position: adjustedPosition,
        mode: 'window'
      });
      
      this.state.setOriginalText(data.selectedText);
      this.state.setTranslationCancelled(false);
      this.state.setIconMode(false);
      this.state.setVisible(true);
      
      this.facade._startTranslationProcess(data.selectedText, windowId)
        .then(result => {
          if (result) {
            WindowsManagerEvents.updateWindow(windowId, {
              initialSize: 'normal',
              isLoading: false,
              initialTranslatedText: result.translatedText,
              sourceLanguage: result.sourceLanguage || 'auto',
              detectedSourceLanguage: result.sourceLanguage,
              targetLanguage: result.targetLanguage,
              provider: result.provider
            });
          }
        })
        .catch(async (error) => {
          const errorInfo = await this.errorHandler.getErrorForUI(error, 'windows-translation');
          WindowsManagerEvents.updateWindow(windowId, {
            initialSize: 'normal',
            isLoading: false,
            isStreaming: false,
            isError: true,
            errorType: errorInfo.type,
            initialTranslatedText: errorInfo.message
          });
        });
      
      this.crossFrameManager.notifyWindowCreated(data.frameId, true, windowId);
    } catch (error) {
      this.crossFrameManager.notifyWindowCreated(data.frameId, false, null, error.message);
    }
  }

  /**
   * Handle window creation response for iframe
   */
  _handleWindowCreatedResponse(data) {
    if (this.crossFrameManager.isTopFrame) return;
    if (data.success) {
      this.state.setVisible(true);
      this.state.mainDocumentWindowId = data.windowId;
      this.clickManager.addOutsideClickListener();
    }
  }

  /**
   * Handle text selection window request from iframe
   */
  async _handleTextSelectionWindowRequest(data, sourceWindow) {
    if (!this.crossFrameManager.isTopFrame) return;

    try {
      let adjustedPosition = { ...data.position };
      const allIframes = document.querySelectorAll('iframe');
      let iframe = Array.from(allIframes).find(frame => {
        try { return frame.contentWindow === sourceWindow; } catch { return false; }
      });
      
      if (iframe) {
        const iframeRect = iframe.getBoundingClientRect();
        adjustedPosition.x += iframeRect.left;
        adjustedPosition.y += iframeRect.top;
        adjustedPosition._isViewportRelative = true;
        adjustedPosition._isAbsolute = false;
      }

      await this.facade.show(data.selectedText, adjustedPosition, data.options);
    } catch (error) {
      this.logger.warn('Failed to handle text selection window request from iframe:', error.message);
    }
  }
}
