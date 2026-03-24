/**
 * MessagingConstants - Standardized messaging constants
 * Separated from MessagingCore to avoid circular dependencies
 */

export class MessageContexts {
  static POPUP = "popup";
  static SIDEPANEL = "sidepanel";
  static OPTIONS = "options";
  static BACKGROUND = "background";
  static SELECT_ELEMENT = "select-element";
  static CONTENT = "content";
  static OFFSCREEN = "offscreen";
  static EVENT_HANDLER = "event-handler";
  static TTS_MANAGER = "tts-manager";
  static CAPTURE_MANAGER = "capture-manager";
  static SELECTION_MANAGER = "selection-manager";
  static PAGE_TRANSLATION_BATCH = "page-translation-batch";
  static PAGE_TRANSLATION_UI = "page-translation-ui";
  static DICTIONARY = "dictionary";
  static MOBILE_TRANSLATE = "mobile-translate";
  
  // Additional contexts for specialized services
  static TTS_MANAGER_BACKGROUND = "tts-manager-background";
  static API_PROVIDER = "api-provider";
  static TRANSLATION_SERVICE = "translation-service";
}

/**
 * Common reasons for actions, cancellations, and state changes
 */
export class ActionReasons {
  // Cancellation Reasons
  static USER_CANCELLED = "user_cancelled";
  static ESC_KEY_PRESSED = "esc_key_pressed";
  static USER_TYPING = "user_typing";
  static USER_ACTION = "user_action";
  static USER_STOPPED_PAGE_TRANSLATION = "user_stopped_page_translation";
  
  // System & Logic Reasons
  static BUSY_OR_DONE = "busy_or_done";
  static NOT_SUITABLE = "not_suitable";
  static DUPLICATE = "duplicate";
  static ALREADY_EXECUTING = "already_executing";
  static NOT_AUTO_TRANSLATING = "not_auto_translating";
  static NO_REQUEST_FOUND = "no-request-found";
  static SILENT_ERROR = "silent_error";
  
  // UI & Viewport Reasons
  static SCROLL_STARTED = "scroll-started";
  static VIEWPORT_EXIT = "viewport-exit";
  static VIEWPORT_ENTER = "viewport-enter";
  static POSITION_UPDATE = "position-update";
}
