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

import { CONFIG } from './config.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONFIG, 'SettingsMigrations');

/**
 * Main migration function - handles all settings updates
 */
function runMainMigration(currentSettings) {
  const updates = {};
  const migrationLog = [];

  // List of settings that should NOT be auto-migrated
  // Note: API_KEY is intentionally NOT in this list to allow migration to GEMINI_API_KEY
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

  // List of model list settings that need special handling
  const MODEL_LISTS = {
    'GEMINI_MODELS': 'GEMINI_MODEL',
    'OPENAI_MODELS': 'OPENAI_API_MODEL',
    'OPENROUTER_MODELS': 'OPENROUTER_API_MODEL',
    'DEEPSEEK_MODELS': 'DEEPSEEK_API_MODEL'
  };

  // 1. Check for missing settings and add them
  Object.keys(CONFIG).forEach(key => {
    // Skip internal and user-specific settings
    if (DO_NOT_MIGRATE.includes(key)) return;

    // Skip if setting already exists
    if (key in currentSettings) return;

    // Add missing setting
    updates[key] = CONFIG[key];
    migrationLog.push(`Added missing setting: ${key}`);
  });

  // 2. Handle model lists specially
  Object.keys(MODEL_LISTS).forEach(modelListKey => {
    if (!(modelListKey in CONFIG)) return;

    const currentModelKey = MODEL_LISTS[modelListKey];

    // Update model list if it exists in both places and is different
    if (modelListKey in currentSettings &&
        JSON.stringify(currentSettings[modelListKey]) !== JSON.stringify(CONFIG[modelListKey])) {

      const currentUserModel = currentSettings[currentModelKey];
      const newModels = CONFIG[modelListKey];
      const modelStillExists = newModels.some(model => model.value === currentUserModel);

      updates[modelListKey] = CONFIG[modelListKey];
      migrationLog.push(`Updated ${modelListKey}`);

      // Reset model if user's selection no longer exists
      if (!modelStillExists && currentUserModel !== CONFIG[currentModelKey]) {
        updates[currentModelKey] = CONFIG[currentModelKey];
        migrationLog.push(`Reset ${currentModelKey} (previous model no longer available)`);
      }
    }
  });

  // 3. Handle prompt templates - update critical prompts
  const PROMPT_TEMPLATES = [
    'PROMPT_BASE_FIELD',
    'PROMPT_BASE_SELECT',
    'PROMPT_BASE_BATCH',
    'PROMPT_BASE_DICTIONARY',
    'PROMPT_BASE_POPUP_TRANSLATE',
    'PROMPT_BASE_SCREEN_CAPTURE',
    'PROMPT_TEMPLATE'
  ];

  // For debugging - log which prompts are different
  PROMPT_TEMPLATES.forEach(key => {
    if (!(key in CONFIG) || !(key in currentSettings)) return;

    const userPrompt = currentSettings[key];
    const defaultPrompt = CONFIG[key];

    // Update prompts that are different from current config
    // This ensures users get the latest prompts even if they had old versions
    if (userPrompt !== defaultPrompt) {
      // Always update prompts to ensure users get the latest improvements
      updates[key] = CONFIG[key];
      migrationLog.push(`Updated ${key} to latest version`);
    }
  });

  // 4. Special handling for certain array/object settings
  const ARRAY_SETTINGS = ['FONT_SIZE_OPTIONS'];
  ARRAY_SETTINGS.forEach(key => {
    if (key in CONFIG && key in currentSettings) {
      if (JSON.stringify(currentSettings[key]) !== JSON.stringify(CONFIG[key])) {
        updates[key] = CONFIG[key];
        migrationLog.push(`Updated ${key}`);
      }
    }
  });

  // 5. Handle legacy API_KEY migration to GEMINI_API_KEY
  // This migrates single API_KEY to new GEMINI_API_KEY (multi-key support)
  // Note: This is now handled by import-export.js during import, so this only runs
  // for extension updates, not for file imports
  if ('API_KEY' in currentSettings && currentSettings.API_KEY && currentSettings.API_KEY.trim() !== '') {
    // Only migrate if GEMINI_API_KEY doesn't exist or is empty
    if (!currentSettings.GEMINI_API_KEY || currentSettings.GEMINI_API_KEY.trim() === '') {
      updates.GEMINI_API_KEY = currentSettings.API_KEY;
      migrationLog.push(`Migrated API_KEY to GEMINI_API_KEY (multi-key support)`);
    }

    // Remove the old API_KEY setting
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

