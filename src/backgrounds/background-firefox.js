// src/backgrounds/background-firefox.js

import { logME } from "../utils/helpers.js";

// Firefox doesn't need offscreen document import
import "../listeners/onMessage.js"; // Listener for runtime messages
import "../listeners/onInstalled.js"; // Listener for extension installation/update
import "../listeners/onContextMenu.js"; // Listener for context menu actions
import "../listeners/onCommand.js"; // Listener for command shortcuts
import "../listeners/onNotificationClicked.js"; // Listener for Install/Update Notification 

logME("[Translate-It Firefox] ✅ Main script loaded, listeners attached.");