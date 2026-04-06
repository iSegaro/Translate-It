/**
 * Settings Migration System
 * Handles automatic migrations for user settings when extension is updated
 *
 * This system automatically:
 * 1. Adds any missing settings from CONFIG to user settings
 * 2. Updates model lists while preserving user selections
 * 3. Updates prompt templates only if user hasn't customized them
 * 4. Preserves user data, API keys, and customizations
 *
 * Migration is triggered only on extension update via InstallHandler
 */

import { CONFIG, TranslationMode } from './config.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONFIG, 'SettingsMigrations');

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
 * Main migration function - handles all settings updates
 */
function runMainMigration(currentSettings) {
  const updates = {};
  const migrationLog = [];

  // Migrate Mode Provider keys first to ensure new structure is used
  migrateModeProviderKeys(currentSettings, updates, migrationLog);

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
  // Automatically identifies all prompt templates to ensure they stay updated
  const PROMPT_TEMPLATES = Object.keys(CONFIG).filter(key => 
    key.startsWith('PROMPT_BASE_') || key === 'PROMPT_TEMPLATE'
  );

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

  // C. Handle prompt templates - update to latest version
  // We only force update if the PROMPTS_VERSION has increased.
  // This allows us to push critical prompt updates (like logical batching) 
  // while preserving user customizations during minor version updates.
  const currentPromptsVersion = currentSettings.PROMPTS_VERSION || 1;
  const targetPromptsVersion = CONFIG.PROMPTS_VERSION || 1;
  const forceUpdatePrompts = targetPromptsVersion > currentPromptsVersion;

  PROMPT_TEMPLATES.forEach(key => {
    if (!(key in currentSettings)) return;

    const userPrompt = currentSettings[key];
    const defaultPrompt = CONFIG[key];

    // Only update if versions differ OR if user somehow has a missing/invalid prompt
    if (forceUpdatePrompts || userPrompt !== defaultPrompt) {
      // If forceUpdatePrompts is false but prompts differ, it means the user 
      // likely customized it, so we SHOULD NOT overwrite unless forceUpdatePrompts is true.
      if (forceUpdatePrompts || !userPrompt) {
        updates[key] = defaultPrompt;
        migrationLog.push(`Updated prompt template ${key} to version ${targetPromptsVersion}`);
      }
    }
  });

  // Ensure PROMPTS_VERSION is updated in storage
  if (forceUpdatePrompts) {
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

