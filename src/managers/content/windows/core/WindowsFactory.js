// src/managers/content/windows/core/WindowsFactory.js

import browser from "webextension-polyfill";
import { WindowsConfig } from "./WindowsConfig.js";
import { getScopedLogger } from "../../../../utils/core/logger.js";
import { LOG_COMPONENTS } from "../../../../utils/core/logConstants.js";

/**
 * Factory for creating UI elements used by WindowsManager
 */
export class WindowsFactory {
  constructor() {
  this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'WindowsFactory');
  }

  /**
   * Create popup host element
   */
  createPopupHost(frameId) {
    const host = document.createElement("div");
    host.classList.add(WindowsConfig.CSS_CLASSES.POPUP_HOST);
    host.id = `translate-window-${frameId || 'main'}-${Date.now()}`;
    return host;
  }

  /**
   * Create popup container with shadow root
   */
  createPopupContainer(host) {
    const shadowRoot = host.attachShadow({ mode: "open" });
    const style = this.createPopupStyles();
    shadowRoot.appendChild(style);

    const container = document.createElement("div");
    container.classList.add(WindowsConfig.CSS_CLASSES.POPUP_CONTAINER);
    shadowRoot.appendChild(container);

    return { shadowRoot, container };
  }

  /**
   * Create popup styles
   */
  createPopupStyles() {
    const style = document.createElement("style");
    style.textContent = this.getPopupStylesCSS();
    return style;
  }

  /**
   * Get popup CSS styles
   */
  getPopupStylesCSS() {
    return `
      :host {
        --sw-bg-color: #f8f8f8; --sw-text-color: #333; --sw-border-color: #ddd; --sw-shadow-color: rgba(0,0,0,0.1);
        --sw-original-text-color: #000; --sw-loading-dot-opacity-start: 0.3; --sw-loading-dot-opacity-mid: 0.8;
        --sw-link-color: #0066cc; font-family: Vazirmatn, "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      }
      :host(.theme-dark) {
        --sw-bg-color: #2a2a2a; --sw-text-color: #e0e0e0; --sw-border-color: #444; --sw-shadow-color: rgba(255,255,255,0.08);
        --sw-original-text-color: #fff; --sw-loading-dot-opacity-start: 0.5; --sw-loading-dot-opacity-mid: 1; --sw-link-color: #58a6ff;
      }
      .popup-container { background-color: var(--sw-bg-color); color: var(--sw-text-color); border: 1px solid var(--sw-border-color);
        border-radius: 4px; padding: 8px 12px; font-size: 14px; box-shadow: 0 2px 8px var(--sw-shadow-color); max-width: 300px; overflow-wrap: break-word;
      }
      .loading-container { display: flex; justify-content: center; align-items: center; color: var(--sw-text-color); }
      @keyframes blink { 0% { opacity: var(--sw-loading-dot-opacity-start); } 50% { opacity: var(--sw-loading-dot-opacity-mid); } 100% { opacity: var(--sw-loading-dot-opacity-start); } }
      .loading-dot { font-size: 1.2em; margin: 0 2px; animation: blink 0.7s infinite; }
      .first-line { margin-bottom: 6px; display: flex; align-items: center; 
        user-select: none; padding: 6px 8px; margin: -8px -12px 6px -12px; 
        background-color: var(--sw-border-color); border-radius: 4px 4px 0 0; 
        border-bottom: 1px solid var(--sw-border-color); opacity: 0.9;
      }
      .first-line:hover { opacity: 1; }
      .original-text { font-weight: bold; margin-left: 6px; color: var(--sw-original-text-color); }
      .second-line { margin-top: 4px; }
      .tts-icon { width: 16px; height: 16px; cursor: pointer; margin-right: 6px; vertical-align: middle; }
      :host(.theme-dark) .tts-icon { filter: invert(90%) brightness(1.1); }
      .text-content a { color: var(--sw-link-color); text-decoration: none; }
      .text-content a:hover { text-decoration: underline; }
    `;
  }

  /**
   * Create loading dots animation
   */
  createLoadingDots() {
    const container = document.createElement("div");
    container.classList.add(WindowsConfig.CSS_CLASSES.LOADING_CONTAINER);
    
    [0, 1, 2].forEach(() => {
      const dot = document.createElement("span");
      dot.classList.add(WindowsConfig.CSS_CLASSES.LOADING_DOT);
      dot.textContent = ".";
      container.appendChild(dot);
    });
    
    return container;
  }

  /**
   * Create translate icon element
   */
  createTranslateIcon(targetDocument = document) {
    const icon = targetDocument.createElement("div");
    icon.id = WindowsConfig.IDS.ICON;
    
    let iconUrl;
    try {
      iconUrl = browser.runtime.getURL("icons/extension_icon_32.png");
    } catch {
      throw new Error("Extension context invalidated.");
    }
    
    // Apply icon styles with animation
    Object.assign(icon.style, {
      position: "fixed",
      zIndex: WindowsConfig.Z_INDEX.ICON.toString(),
      width: `${WindowsConfig.POSITIONING.ICON_SIZE}px`,
      height: `${WindowsConfig.POSITIONING.ICON_SIZE}px`,
      backgroundColor: "#f0f0f0",
      backgroundImage: `url('${iconUrl}')`,
      backgroundSize: "16px 16px",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      borderRadius: "50%",
      border: "1px solid #ccc",
      cursor: "pointer",
      boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
      // Initial animation state
      opacity: "0",
      transform: "scale(0.5)",
      transformOrigin: "bottom center",
      transition: `opacity ${WindowsConfig.ANIMATION.ICON_ANIMATION.DURATION}ms ease-out, transform ${WindowsConfig.ANIMATION.ICON_ANIMATION.DURATION}ms ${WindowsConfig.ANIMATION.ICON_ANIMATION.EASING}`
    });
    
    return icon;
  }

  /**
   * Create icon host container
   */
  createIconHost(targetDocument = document) {
    const hostId = WindowsConfig.IDS.ICON_HOST;
    let iconHost = targetDocument.getElementById(hostId);
    
    if (!iconHost) {
      iconHost = targetDocument.createElement("div");
      iconHost.id = hostId;
      targetDocument.body.appendChild(iconHost);
    }
    
    return iconHost;
  }

  /**
   * Create TTS icon
   */
  createTTSIcon(title = "Speak") {
    const icon = document.createElement("img");
    try {
      icon.src = browser.runtime.getURL("icons/speaker.png");
    } catch {
      throw new Error("Extension context invalidated.");
    }
    icon.alt = title;
    icon.title = title;
    icon.classList.add(WindowsConfig.CSS_CLASSES.TTS_ICON);
    return icon;
  }

  /**
   * Create copy icon
   */
  createCopyIcon(title = "Copy") {
    const icon = document.createElement("img");
    try {
      icon.src = browser.runtime.getURL("icons/copy.png");
    } catch {
      throw new Error("Extension context invalidated.");
    }
    icon.alt = title;
    icon.title = title;
    icon.classList.add(WindowsConfig.CSS_CLASSES.TTS_ICON);
    icon.style.marginLeft = "4px";
    return icon;
  }

  /**
   * Create first line (header) of translation popup
   */
  createFirstLine() {
    const firstLine = document.createElement("div");
    firstLine.classList.add(WindowsConfig.CSS_CLASSES.FIRST_LINE);
    return firstLine;
  }

  /**
   * Create drag handle
   */
  createDragHandle() {
    const dragHandle = document.createElement("div");
    dragHandle.style.flex = "1";
    dragHandle.style.cursor = "move";
    dragHandle.style.minHeight = "16px";
    return dragHandle;
  }

  /**
   * Create close button
   */
  createCloseButton() {
    const closeButton = document.createElement("span");
    closeButton.textContent = "✕";
    closeButton.style.opacity = "0.7";
    closeButton.style.fontSize = "14px";
    closeButton.style.cursor = "pointer";
    closeButton.style.padding = "0 4px";
    closeButton.title = "Close";
    return closeButton;
  }

  /**
   * Create second line (content) of translation popup
   */
  createSecondLine() {
    const secondLine = document.createElement("div");
    secondLine.classList.add(WindowsConfig.CSS_CLASSES.SECOND_LINE);
    return secondLine;
  }

  /**
   * Create original text span
   */
  createOriginalTextSpan(text) {
    const span = document.createElement("span");
    span.classList.add(WindowsConfig.CSS_CLASSES.ORIGINAL_TEXT);
    span.textContent = text;
    return span;
  }

  /**
   * Create error message element
   */
  createErrorElement(message) {
    const errorElement = document.createElement("div");
    errorElement.textContent = message;
    errorElement.style.color = "var(--sw-text-color)";
    errorElement.style.padding = "5px";
    return errorElement;
  }
}