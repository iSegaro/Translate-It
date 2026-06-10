/**
 * Settings Migration System
 * 
 * Registry of historical default prompt templates used for safe prompt migrations.
 *
 * If a user's prompt matches one of these historical defaults, it is assumed
 * that the prompt was never customized and can be safely upgraded to the
 * latest CONFIG default.
 *
 * Migration rules:
 * - Missing prompt -> replaced with current CONFIG default.
 * - Empty prompt -> replaced with current CONFIG default.
 * - Historical default -> upgraded to current CONFIG default.
 * - Any other value -> treated as a user customization and preserved.
 *
 * IMPORTANT:
 * Whenever a default prompt template is changed in CONFIG, the previous
 * default value MUST be added to the corresponding array below.
 *
 * Example:
 *
 * Before:
 * CONFIG.PROMPT_TEMPLATE = "Prompt A"
 *
 * After:
 * CONFIG.PROMPT_TEMPLATE = "Prompt B"
 *
 * Add:
 * HISTORICAL_PROMPT_DEFAULTS.PROMPT_TEMPLATE.push("Prompt A")
 *
 * This allows users who still have the old unmodified default to receive
 * the new version automatically, while preserving customized prompts.
 *
 * Versioning Notes:
 * - Keep historical defaults grouped by release/version when possible.
 * - Do not remove old entries unless you are certain no supported upgrade
 *   path can reference them anymore.
 * - Users may upgrade across multiple versions, so migrations must support
 *   direct upgrades from older releases.
 *
 * Example:
 *
 * PROMPT_TEMPLATE: [
 *   // v1.17.0 default
 *   "Prompt A",
 *
 *   // v1.18.0 default
 *   "Prompt B"
 * ]
 *
 * NOTE:
 * PROMPTS_VERSION must not be used to force-overwrite prompt templates.
 * User customizations must always be preserved.
 */

import { CONFIG, TranslationMode } from './config.js';
import { PROMPT_REGISTRY } from './PromptRegistry.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONFIG, 'SettingsMigrations');

/**
 * Registry of historical default prompt templates to identify unmodified user prompts.
 * If a user's prompt matches one of these, it means they never customized it, 
 * so it is safe to auto-upgrade to the latest default template.
 */
export const HISTORICAL_PROMPT_DEFAULTS = {
  // Example:
  // PROMPT_TEMPLATE: [
  // v1.17.0 default
  //   `Old prompt...`,
  //
  // v1.18.0 default
  //   `Previous prompt...`
  // ],
  //
  // When changing a default prompt in CONFIG, add the previous
  // default value here before replacing it.

  PROMPT_TEMPLATE: [],
  PROMPT_TEMPLATE_AUTO: [],
  PROMPT_BASE_FIELD: [],
  PROMPT_BASE_FIELD_AUTO: [],
  PROMPT_BASE_POPUP_TRANSLATE: [],
  PROMPT_BASE_DICTIONARY: [],
  PROMPT_SUBTITLE_USER: []
};

/**
 * Migrate MODE_PROVIDERS keys from old format (underscore) to new format (hyphenated/MessageContexts)
 */
function migrateModeProviderKeys(currentSettings, updates, migrationLog) {
  if (!currentSettings.MODE_PROVIDERS) return;

  const providers = { ...currentSettings.MODE_PROVIDERS };
  let changed = false;

  // Mapping of old keys to new keys using standard TranslationMode constants
  const MAPPING = {
    'select_element': TranslationMode.Select_Element,
    'popup_translate': TranslationMode.Popup_Translate,
    'sidepanel_translate': TranslationMode.Sidepanel_Translate,
    'screen_capture': TranslationMode.ScreenCapture,
    'screen-capture': TranslationMode.ScreenCapture,
    'selection': TranslationMode.Selection,
    'field': TranslationMode.Field,
    'page': TranslationMode.Page
  };

  Object.entries(MAPPING).forEach(([oldKey, newKey]) => {
    if (oldKey in providers && providers[oldKey] !== undefined && providers[oldKey] !== null) {
      // Always migrate old value to new key if new key is missing or null
      if (!(newKey in providers) || providers[newKey] === null) {
        providers[newKey] = providers[oldKey];
        migrationLog.push(`Migrated MODE_PROVIDERS.${oldKey} to ${newKey}`);
        changed = true;
      }
      // Always delete the old legacy key regardless
      delete providers[oldKey];
      changed = true;
    } else if (oldKey in providers) {
      // Just delete the old key if it's undefined or null
      delete providers[oldKey];
      changed = true;
    }
  });

  if (changed) {
    updates.MODE_PROVIDERS = providers;
  }
}

/**
 * Migrate BILINGUAL_TRANSLATION_MODES keys from old format to new format
 */
function migrateBilingualModeKeys(currentSettings, updates, migrationLog) {
  if (!currentSettings.BILINGUAL_TRANSLATION_MODES) return;

  const modes = { ...currentSettings.BILINGUAL_TRANSLATION_MODES };
  let changed = false;

  const MAPPING = {
    'select_element': TranslationMode.Select_Element,
    'popup_translate': TranslationMode.Popup_Translate,
    'sidepanel_translate': TranslationMode.Sidepanel_Translate,
    'screen_capture': TranslationMode.ScreenCapture,
    'screen-capture': TranslationMode.ScreenCapture,
    'selection': TranslationMode.Selection,
    'field': TranslationMode.Field,
    'page': TranslationMode.Page,
    'dictionary': TranslationMode.Dictionary_Translation
  };

  Object.entries(MAPPING).forEach(([oldKey, newKey]) => {
    if (oldKey in modes && modes[oldKey] !== undefined && modes[oldKey] !== null) {
      if (!(newKey in modes) || modes[newKey] === null) {
        modes[newKey] = modes[oldKey];
        migrationLog.push(`Migrated BILINGUAL_TRANSLATION_MODES.${oldKey} to ${newKey}`);
        changed = true;
      }
      delete modes[oldKey];
      changed = true;
    } else if (oldKey in modes) {
      delete modes[oldKey];
      changed = true;
    }
  });

  if (changed) {
    updates.BILINGUAL_TRANSLATION_MODES = modes;
  }
}

/**
 * Main migration function - handles all settings updates
 */
function runMainMigration(currentSettings) {
  const updates = {};
  const migrationLog = [];

  // Migrate Mode Provider keys first to ensure new structure is used
  migrateModeProviderKeys(currentSettings, updates, migrationLog);
  
  // Migrate Bilingual Mode keys
  migrateBilingualModeKeys(currentSettings, updates, migrationLog);

  // 1. List of settings that should NOT be auto-migrated (User sensitive data)
  const DO_NOT_MIGRATE = [
    'translationHistory',    // User data
    'EXCLUDED_SITES',        // User's custom exclusions
    'OPENAI_API_KEY',
    'OPENROUTER_API_KEY',
    'DEEPSEEK_API_KEY',
    'DEEPL_API_KEY',
    'CUSTOM_API_KEY',
    'GEMINI_API_KEY',        // New multi-key setting
    'PROXY_USERNAME',        // Credentials
    'PROXY_PASSWORD'
  ];

  // 2. Dynamic Model Detection
  // Automatically identifies all _MODELS lists and their corresponding selection keys
  const modelListKeys = Object.keys(CONFIG).filter(key => key.endsWith('_MODELS'));
  const MODEL_MAPPING = {};
  
  modelListKeys.forEach(listKey => {
    const provider = listKey.replace('_MODELS', '');
    // Preference: [PROVIDER]_API_MODEL, fallback: [PROVIDER]_MODEL
    const modelKey = `${provider}_API_MODEL` in CONFIG ? `${provider}_API_MODEL` : `${provider}_MODEL`;
    if (modelKey in CONFIG) {
      MODEL_MAPPING[listKey] = modelKey;
    }
  });

  // 3. Dynamic Prompt Detection
  // Automatically identifies all editable prompt templates from the registry
  const PROMPT_TEMPLATES = Object.values(PROMPT_REGISTRY)
    .filter(p => p.editable)
    .map(p => p.key);

  // 4. Synchronized Option Lists (UI Options that should always match CONFIG)
  const OPTION_LISTS = [
    'FONT_SIZE_OPTIONS',
    'DEEPL_API_TIER_OPTIONS',
    'DEEPL_FORMALITY_OPTIONS'
  ];

  // --- Start Migration Process ---

  // A. Check for missing settings and add them
  Object.keys(CONFIG).forEach(key => {
    if (DO_NOT_MIGRATE.includes(key)) return;
    if (!(key in currentSettings)) {
      updates[key] = CONFIG[key];
      migrationLog.push(`Added missing setting: ${key}`);
    }
  });

  // B. Handle model lists - Dynamic update & reset if model removed
  Object.entries(MODEL_MAPPING).forEach(([modelListKey, currentModelKey]) => {
    if (!(modelListKey in currentSettings)) return;

    if (JSON.stringify(currentSettings[modelListKey]) !== JSON.stringify(CONFIG[modelListKey])) {
      const currentUserModel = currentSettings[currentModelKey];
      const newModels = CONFIG[modelListKey];
      const modelStillExists = newModels.some(model => model.value === currentUserModel);

      updates[modelListKey] = CONFIG[modelListKey];
      migrationLog.push(`Updated ${modelListKey} list`);

      // Reset selection if user's current model no longer exists in the new list
      if (!modelStillExists && currentUserModel !== CONFIG[currentModelKey]) {
        updates[currentModelKey] = CONFIG[currentModelKey];
        migrationLog.push(`Reset ${currentModelKey} (previous model no longer available)`);
      }
    }
  });

  // C. Handle prompt templates - safe update using historical defaults
  const currentPromptsVersion = currentSettings.PROMPTS_VERSION || 1;
  const targetPromptsVersion = CONFIG.PROMPTS_VERSION || 1;

  PROMPT_TEMPLATES.forEach(key => {
    const defaultPrompt = CONFIG[key];

    // Safety check: skip if key doesn't exist in CONFIG
    if (defaultPrompt === undefined) {
      logger.warn(`Prompt key ${key} is defined in registry but missing in CONFIG.`);
      return;
    }

    // 1. If key is completely missing in user settings, add it
    if (!(key in currentSettings)) {
      updates[key] = defaultPrompt;
      migrationLog.push(`Added missing prompt setting: ${key}`);
      return;
    }

    const userPrompt = currentSettings[key];

    // 2. If stored prompt is empty or null, restore it to current default
    if (!userPrompt || userPrompt.toString().trim() === '') {
      updates[key] = defaultPrompt;
      migrationLog.push(`Restored empty/missing prompt ${key} to default`);
      return;
    }

    // 3. If stored prompt exactly matches current default, leave it
    if (userPrompt === defaultPrompt) {
      return;
    }

    // 4. If stored prompt matches a known historical default, upgrade to current default
    const historicals = HISTORICAL_PROMPT_DEFAULTS[key] || [];
    const isHistorical = historicals.some(hist => hist === userPrompt);
    
    if (isHistorical) {
      updates[key] = defaultPrompt;
      migrationLog.push(`Upgraded legacy default prompt ${key} to latest version`);
      return;
    }

    // 5. Otherwise, treat as user-customized and preserve
    logger.debug(`Preserved user customized prompt: ${key}`);
  });

  // Ensure PROMPTS_VERSION is updated in storage as metadata
  if (targetPromptsVersion > currentPromptsVersion) {
    updates.PROMPTS_VERSION = targetPromptsVersion;
  }

  // D. Synchronize Option Lists
  OPTION_LISTS.forEach(key => {
    if (key in CONFIG && key in currentSettings) {
      if (JSON.stringify(currentSettings[key]) !== JSON.stringify(CONFIG[key])) {
        updates[key] = CONFIG[key];
        migrationLog.push(`Synchronized ${key}`);
      }
    }
  });

  // E. Handle legacy API_KEY migration to GEMINI_API_KEY
  if ('API_KEY' in currentSettings && currentSettings.API_KEY && currentSettings.API_KEY.trim() !== '') {
    if (!currentSettings.GEMINI_API_KEY || currentSettings.GEMINI_API_KEY.trim() === '') {
      updates.GEMINI_API_KEY = currentSettings.API_KEY;
      migrationLog.push(`Migrated API_KEY to GEMINI_API_KEY (multi-key support)`);
    }
    updates.API_KEY = '';
    migrationLog.push(`Removed deprecated API_KEY setting`);
  }

  if (migrationLog.length > 0) {
    logger.debug('Auto-migration completed', {
      addedCount: Object.keys(updates).length,
      migrations: migrationLog
    });
  }

  return { updates, migrationLog };
}


/**
 * Run settings migrations - always checks for missing/updated settings
 */
export async function runSettingsMigrations(currentSettings) {
  logger.info('Running settings migrations check');

  const allUpdates = {};
  const allLogs = [];

  // Always run main migration to check for missing/updated settings
  const { updates, migrationLog } = runMainMigration(currentSettings);
  Object.assign(allUpdates, updates);
  allLogs.push(...migrationLog);

  logger.debug('Settings migrations completed', {
    updatesCount: Object.keys(allUpdates).length,
    logs: allLogs
  });

  return { updates: allUpdates, logs: allLogs };
}

