// src/background.js

import { logME } from "./utils/helpers.js";

// Import listeners to activate them
// import "./listeners/Injection.js";
import "./listeners/onMessage.js"; // Listener for runtime messages
import "./offscreen.js";
import "./listeners/onStartup.js";
import "./listeners/onAlarm_chrome.js";
import "./listeners/onInstalled.js"; // Listener for extension installation/update
// Potentially import other listeners like onCommand, onActionClicked etc. if needed

logME("[Translate-It] ✅ Main script loaded, listeners attached.");

// Global error handling setup or other initializations can stay here if needed
// For instance, if ErrorHandler needs to be a singleton accessible everywhere:
// import { ErrorHandler } from "./services/ErrorService.js";
// export const globalErrorHandler = new ErrorHandler(); // Example

// Note: State variables like selectElementStates and injectionInProgress
// will now reside within the module that primarily uses them (onMessage.js in this case).
