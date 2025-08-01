/**
 * Message action definitions for standardized communication
 */
export class MessageActions {
  // Core actions
  static PING = 'ping';
  static GET_INFO = 'getInfo';
  
  // Translation actions
  static TRANSLATE = 'TRANSLATE';
  static FETCH_TRANSLATION = 'fetchTranslation';
  static BATCH_TRANSLATE = 'BATCH_TRANSLATE';
  static GET_PROVIDERS = 'GET_PROVIDERS';
  static TEST_PROVIDER = 'TEST_PROVIDER';
  static TRANSLATION_RESULT_UPDATE = 'TRANSLATION_RESULT_UPDATE';

  // Select Element
  static GET_SELECT_ELEMENT_STATE = 'getSelectElementState';
  static PROCESS_SELECTED_ELEMENT = 'PROCESS_SELECTED_ELEMENT';
  
  // Floating Window
  static TRANSLATION_COMPLETE = 'translationComplete';
  
  // Sidepanl
  static OPEN_SIDE_PANEL = 'openSidePanel';
  static SELECTED_TEXT_FOR_SIDEPANEL = 'selectedTextForSidePanel';

  // History actions
  static GET_HISTORY = 'GET_HISTORY';
  static CLEAR_HISTORY = 'CLEAR_HISTORY';
  static ADD_TO_HISTORY = 'ADD_TO_HISTORY';
  
  // Popup
  static Set_Exclude_Current_Page = 'setExcludeCurrentPage';
  static IS_Current_Page_Excluded = 'isCurrentPageExcluded';
  
  // TTS actions
  static TTS_SPEAK = 'TTS_SPEAK';
  static TTS_STOP = 'TTS_STOP';
  static TTS_PAUSE = 'TTS_PAUSE';
  static TTS_RESUME = 'TTS_RESUME';
  static TTS_GET_VOICES = 'TTS_GET_VOICES';
  static TTS_PLAY_CACHED_AUDIO = 'TTS_PLAY_CACHED_AUDIO';
  static TTS_TEST = 'TTS_TEST';
  static TTS_SPEAK_CONTENT = 'TTS_SPEAK_CONTENT';
  static PLAY_OFFSCREEN_AUDIO = 'playOffscreenAudio';
  
  // Capture actions
  static SCREEN_CAPTURE = 'SCREEN_CAPTURE';
  static CAPTURE_FULL_SCREEN = 'CAPTURE_FULL_SCREEN';
  static START_CAPTURE_SELECTION = 'START_CAPTURE_SELECTION';
  static PROCESS_IMAGE_OCR = 'PROCESS_IMAGE_OCR';
  static CAPTURE_TRANSLATE_IMAGE_DIRECT = 'CAPTURE_TRANSLATE_IMAGE_DIRECT';
  static CAPTURE_TRANSLATION_COMPLETED = 'CAPTURE_TRANSLATION_COMPLETED';
  static CAPTURE_SAVE_TRANSLATION = 'CAPTURE_SAVE_TRANSLATION';
  
  // Selection actions
  static ACTIVATE_SELECT_ELEMENT_MODE = 'activateSelectElementMode';
  static DEACTIVATE_SELECT_ELEMENT_MODE = 'deactivateSelectElementMode';
  static REVERT_SELECT_ELEMENT_MODE = 'revertTranslation';
  
  // Notification actions
  static SHOW_NOTIFICATION = 'SHOW_NOTIFICATION';
  static DISMISS_NOTIFICATION = 'DISMISS_NOTIFICATION';
  
  // Storage actions
  static GET_SETTINGS = 'GET_SETTINGS';
  static SET_SETTINGS = 'SET_SETTINGS';
  static SYNC_SETTINGS = 'SYNC_SETTINGS';

  /**
   * Get all available actions
   * @returns {Array<string>} Array of action names
   */
  static getAllActions() {
    return Object.values(this);
  }

  /**
   * Validate action name
   * @param {string} action - Action to validate
   * @returns {boolean} True if action is valid
   */
  static isValidAction(action) {
    return this.getAllActions().includes(action);
  }
}
