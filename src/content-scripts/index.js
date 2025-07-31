// Content script entry point for Vue build
// This is a bridge between the existing content script and Vue build system

import browser from "webextension-polyfill";

// Import and initialize Vue bridge
import { vueBridge } from "./vue-bridge.js";

// Import and initialize content script TTS handler
import { contentTTSHandler } from "./content-tts-handler.js";

// Import NotificationManager
import NotificationManager from "../managers/NotificationManager.js";

// Import EventHandler and InstanceManager
import EventHandler from "../core/EventHandler.js";
import { getTranslationHandlerInstance } from "../core/InstanceManager.js";

// Import the new SelectElementManager
import { SelectElementManager } from "./select-element-manager.js";

console.log("Content script loaded via Vue build system");
console.log("Vue bridge initialized:", vueBridge.isInitialized);
console.log("Content TTS Handler loaded:", !!contentTTSHandler);

// Initialize TranslationHandler and EventHandler
const translationHandler = getTranslationHandlerInstance();
const eventHandler = new EventHandler(translationHandler, translationHandler.featureManager);
const selectElementManager = new SelectElementManager();

// Initialize SelectElementManager
selectElementManager.initialize();