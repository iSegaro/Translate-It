import { createApp } from "vue";
import { createPinia } from "pinia";
import DOMPurify from "dompurify";
import { MessagingStandards, MessageFormat } from "../core/MessagingStandards.js";

class ContentScriptVueBridge {
  constructor() {
    this.vueInstances = new Map();
    this.pinia = createPinia();
    this.isInitialized = false;
    this.componentRegistry = new Map();
    this.messenger = MessagingStandards.getMessenger('content');

    this.actionMap = {
      CREATE_VUE_MICRO_APP: this.handleCreateMicroApp,
      DESTROY_VUE_MICRO_APP: this.handleDestroyMicroApp,
      SHOW_TRANSLATION_TOOLTIP: this.handleShowTooltip,
      HIDE_TRANSLATION_TOOLTIP: this.handleHideTooltip,
      START_SCREEN_CAPTURE: this.handleStartScreenCapture,
      SHOW_CAPTURE_PREVIEW: this.handleShowCapturePreview,
    };
  }

  async initialize() {
    if (this.isInitialized) return;
    try {
      await this.registerComponents();
      this.setupMessageListener();
      this.isInitialized = true;
    } catch (error) {
      console.error("[Vue Bridge] Failed to initialize:", error);
    }
  }

  async registerComponents() {
    const components = {
      TranslationTooltip: () => import("../components/content/TranslationTooltip.vue"),
      ScreenSelector: () => import("../components/content/ScreenSelector.vue"),
      CapturePreview: () => import("../components/content/CapturePreview.vue"),
    };
    for (const [name, loader] of Object.entries(components)) {
      this.componentRegistry.set(name, async () => (await loader()).default);
    }
  }

  setupMessageListener() {
    this.messageHandler = (message, sender, sendResponse) => {
      if (!MessageFormat.validate(message)) {
        console.warn("[Vue Bridge] Received invalid message format:", message);
        return;
      }

      const handler = this.actionMap[message.action];
      if (handler) {
        handler(message.data, sendResponse);
        return true; // Keep channel open for async response
      }
    };

    browser.runtime.onMessage.addListener(this.messageHandler);
  }

  async createMicroApp(componentName, props = {}, target = null) {
    const componentLoader = this.componentRegistry.get(componentName);
    if (!componentLoader) throw new Error(`Component ${componentName} not found`);
    const component = await componentLoader();
    const container = target || this.createContainer();
    const app = createApp(component, props);
    app.use(this.pinia);
    app.config.globalProperties.$bridge = this;
    app.mount(container);
    const instanceId = `vue-${Date.now()}`;
    this.vueInstances.set(instanceId, { app, container, componentName, props });
    return instanceId;
  }

  destroyMicroApp(instanceId) {
    const instance = this.vueInstances.get(instanceId);
    if (instance) {
      instance.app.unmount();
      instance.container.remove();
      this.vueInstances.delete(instanceId);
      return true;
    }
    return false;
  }

  createContainer(cssText = '') {
    const container = document.createElement("div");
    container.className = "translate-it-vue-container";
    container.style.cssText = `position: fixed; z-index: 2147483647; pointer-events: auto; ${cssText}`;
    document.body.appendChild(container);
    return container;
  }

  handleCreateMicroApp = async (data, sendResponse) => {
    try {
      const { componentName, props, position } = data;
      const target = position ? this.createContainer(`top: ${position.y}px; left: ${position.x}px;`) : null;
      const instanceId = await this.createMicroApp(componentName, props, target);
      sendResponse({ success: true, instanceId });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  handleDestroyMicroApp = ({ instanceId }, sendResponse) => {
    sendResponse({ success: this.destroyMicroApp(instanceId) });
  }

  handleShowTooltip = async ({ text, position }, sendResponse) => {
    this.hideAllTooltips();
    const instanceId = await this.createMicroApp(
      "TranslationTooltip",
      { text, position, onClose: () => this.destroyMicroApp(instanceId) },
      this.createContainer(`top: ${position.y}px; left: ${position.x}px;`)
    );
    sendResponse({ success: true, instanceId });
  }

  handleHideTooltip = (data, sendResponse) => {
    this.hideAllTooltips();
    sendResponse({ success: true });
  }

  handleStartScreenCapture = async (data, sendResponse) => {
    this.hideAllOverlays();
    const instanceId = await this.createMicroApp("ScreenSelector", {
      onSelect: async (result) => {
        try {
          const response = await this.messenger.sendMessage({ action: "PROCESS_SCREEN_CAPTURE", data: result });
          if (response.success && data.showPreview !== false) {
            await this.showCapturePreview(result, instanceId);
          } else if (!response.success) {
            throw new Error(response.error || "Failed to process capture");
          }
        } catch (error) {
          this.showCaptureError(error.message, instanceId);
        }
      },
      onCancel: () => {
        this.destroyMicroApp(instanceId);
        this.messenger.sendMessage({ action: "SCREEN_CAPTURE_CANCELLED" });
      },
      onError: (error) => this.showCaptureError(error.message, instanceId),
      ...data,
    });
    sendResponse({ success: true, instanceId });
  }

  showCapturePreview = async (captureResult, selectorInstanceId) => {
    this.destroyMicroApp(selectorInstanceId);
    await this.createMicroApp("CapturePreview", {
      ...captureResult,
      onClose: (id) => this.destroyMicroApp(id),
      onRetake: (id) => { this.destroyMicroApp(id); this.handleStartScreenCapture({ showPreview: true }, () => {}); },
      onTranslate: (result) => this.messenger.sendMessage({ action: "TRANSLATION_COMPLETED", data: result }),
      onSave: (result) => this.messenger.sendMessage({ action: "SAVE_TRANSLATION", data: result }),
    });
  }

  showCaptureError = (message, instanceId = null) => {
    if (instanceId) this.destroyMicroApp(instanceId);
    const errorContainer = this.createContainer(`top: 20px; left: 50%; transform: translateX(-50%);`);
    errorContainer.innerHTML = DOMPurify.sanitize(`
      <div style="
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #f44336;
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        font-size: 14px;
        z-index: 2147483647;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideDown 0.3s ease;
      ">
        <span style="margin-right: 8px;">⚠️</span>
        <span>Screen Capture Error: ${message}</span>
        <button onclick="this.parentElement.parentElement.remove()" style="
          background: none;
          border: none;
          color: white;
          margin-left: 12px;
          cursor: pointer;
          font-size: 16px;
        ">×</button>
      </div>
    `);
    setTimeout(() => errorContainer.remove(), 5000);
  }

  handleAdvancedScreenCapture = async (data, sendResponse) => {
    try {
      const { mode = "manual", detectText = false, autoTranslate = false } = data;
      if (mode === "auto") {
        await this.performAutoCapture(detectText, autoTranslate, sendResponse);
      } else {
        await this.handleStartScreenCapture(data, sendResponse);
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  performAutoCapture = async (detectText, autoTranslate, sendResponse) => {
    try {
      const captureResponse = await this.messenger.sendMessage({ action: "CAPTURE_FULL_SCREEN" });
      if (!captureResponse.success) throw new Error(captureResponse.error || "Failed to capture screen");

      if (detectText) {
        const analysisResponse = await this.messenger.sendMessage({ action: "ANALYZE_IMAGE_TEXT", data: { imageData: captureResponse.data.imageData } });
        if (analysisResponse.success && analysisResponse.data.textRegions?.length > 0) {
          await this.showTextRegionSelector(captureResponse.data.imageData, analysisResponse.data.textRegions, autoTranslate);
          sendResponse({ success: true, mode: "text-regions" });
        } else {
          await this.handleStartScreenCapture({ showPreview: true }, sendResponse);
        }
      } else {
        if (autoTranslate) {
          await this.performDirectTranslation(captureResponse.data.imageData, sendResponse);
        } else {
          await this.showCapturePreview(captureResponse.data, null);
          sendResponse({ success: true, mode: "preview" });
        }
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  showTextRegionSelector = async (imageData, textRegions, autoTranslate) => {
    const instanceId = await this.createMicroApp("TextRegionSelector", {
      imageData,
      textRegions,
      onRegionSelect: async (region) => {
        if (autoTranslate) {
          const croppedImageData = await this.cropImage(imageData, region);
          await this.performDirectTranslation(croppedImageData);
        } else {
          const croppedImageData = await this.cropImage(imageData, region);
          await this.showCapturePreview({ imageData: croppedImageData, coordinates: region }, instanceId);
        }
      },
      onCancel: () => this.destroyMicroApp(instanceId),
    });
    return instanceId;
  }

  performDirectTranslation = async (imageData, sendResponse = null) => {
    try {
      const translationResponse = await this.messenger.sendMessage({ action: "TRANSLATE_IMAGE_DIRECT", data: { imageData } });
      if (translationResponse.success) {
        await this.showTranslationResult(translationResponse.data);
        sendResponse?.({ success: true, translation: translationResponse.data });
      } else {
        throw new Error(translationResponse.error || "Translation failed");
      }
    } catch (error) {
      sendResponse?.({ success: false, error: error.message });
      throw error;
    }
  }

  showTranslationResult = async (translationData) => {
    const position = { x: window.innerWidth / 2 - 150, y: 50 };
    const instanceId = await this.createMicroApp(
      "TranslationTooltip",
      { ...translationData, position, onClose: () => this.destroyMicroApp(instanceId) },
      this.createContainer(`top: ${position.y}px; left: ${position.x}px;`)
    );
    return instanceId;
  }

  handleShowTextRegions = async (data, sendResponse) => {
    try {
      const { imageData, textRegions, autoTranslate = false } = data;
      const instanceId = await this.showTextRegionSelector(imageData, textRegions, autoTranslate);
      sendResponse({ success: true, instanceId });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  cropImage = async (imageData, region) => {
    return imageData;
  }

  hideAllTooltips = () => {
    for (const [id, instance] of this.vueInstances) {
      if (instance.componentName === "TranslationTooltip") this.destroyMicroApp(id);
    }
  }

  hideAllOverlays = () => {
    for (const [id, instance] of this.vueInstances) {
      if (["ScreenSelector", "CapturePreview"].includes(instance.componentName)) this.destroyMicroApp(id);
    }
  }

  cleanup = () => {
    for (const instanceId of this.vueInstances.keys()) this.destroyMicroApp(instanceId);
    this.isInitialized = false;
  }
}

export const vueBridge = new ContentScriptVueBridge();
if (!/^(chrome|moz)-extension:\/\//.test(window.location.protocol)) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => vueBridge.initialize());
  } else {
    vueBridge.initialize();
  }
  window.addEventListener("beforeunload", () => vueBridge.cleanup());
}
