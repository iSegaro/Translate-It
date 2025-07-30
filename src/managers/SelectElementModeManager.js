// src/managers/SelectElementModeManager.js

import { taggleLinks } from "../utils/helpers.js";
import { state } from "../config.js";
import NotificationManager from "./NotificationManager.js";

export default class SelectElementModeManager {
  constructor(eventHandler, translationHandler) {
    this.eventHandler = eventHandler;
    this.translationHandler = translationHandler;
    this.currentHighlightedElement = null;

    // Bind event handlers to this instance
    this.handleMouseOver = this.handleMouseOver.bind(this);
    this.handleMouseOut = this.handleMouseOut.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);

    this.notificationManager = NotificationManager.getInstance();
  }

  activate() {
    console.log("[SelectElementModeManager] Activating select element mode");
    this.translationHandler.select_Element_ModeActive = true;
    state.selectElementActive = true;
    taggleLinks(true); // Enable visual highlighting

    // Add event listeners
    document.addEventListener("mouseover", this.handleMouseOver, true);
    document.addEventListener("mouseout", this.handleMouseOut, true);
    document.addEventListener("click", this.handleClick, true);
    document.addEventListener("keydown", this.handleKeyDown, true);
  }

  deactivate() {
    console.log("[SelectElementModeManager] Deactivating select element mode");
    this.translationHandler.select_Element_ModeActive = false;
    state.selectElementActive = false;
    taggleLinks(false); // Disable visual highlighting and clean up

    // Remove event listeners
    document.removeEventListener("mouseover", this.handleMouseOver, true);
    document.removeEventListener("mouseout", this.handleMouseOut, true);
    document.removeEventListener("click", this.handleClick, true);
    document.removeEventListener("keydown", this.handleKeyDown, true);

    // Clear any lingering highlight
    this.clearHighlight();
  }

  handleMouseOver(event) {
    if (!this.translationHandler.select_Element_ModeActive) return;

    const element = event.target;
    if (element === this.currentHighlightedElement) return;

    this.clearHighlight();
    element.classList.add("translate-it-select-highlight");
    this.currentHighlightedElement = element;
  }

  handleMouseOut(event) {
    if (!this.translationHandler.select_Element_ModeActive) return;

    const element = event.target;
    if (element === this.currentHighlightedElement) {
      // Small delay to prevent flicker when moving between child elements
      setTimeout(() => {
        if (this.currentHighlightedElement === element) {
          this.clearHighlight();
          this.currentHighlightedElement = null;
        }
      }, 50);
    }
  }

  handleClick(event) {
    if (!this.translationHandler.select_Element_ModeActive) return;

    // Prevent default click behavior and propagation
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    // Delegate to EventHandler's specific click handler for select element mode
    this.eventHandler.handleSelect_ElementClick(event);
  }

  handleKeyDown(event) {
    if (!this.translationHandler.select_Element_ModeActive) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.eventHandler.handleEscape(event); // Delegate to EventHandler's escape handler
    }
  }

  clearHighlight() {
    if (this.currentHighlightedElement) {
      this.currentHighlightedElement.classList.remove("translate-it-select-highlight");
      this.currentHighlightedElement = null;
    }
    // Also remove any other lingering highlights from previous sessions/errors
    document.querySelectorAll(".translate-it-select-highlight").forEach(el => {
      el.classList.remove("translate-it-select-highlight");
    });
  }
}
