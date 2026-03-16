/**
 * i18n Cleanup Tool
 * This script identifies keys in the English locale that are not referenced in the source code.
 * 
 * Usage: node scripts/check-i18n.cjs [--remove]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Set base directory to the project root (two levels up from /scripts/localization)
const projectRoot = path.resolve(__dirname, '..', '..');
const EN_LOCALE_PATH = path.join(projectRoot, '_locales/en/messages.json');

if (!fs.existsSync(EN_LOCALE_PATH)) {
  console.error(`❌ Error: Locale file not found at ${EN_LOCALE_PATH}`);
  process.exit(1);
}

// 1. Read keys from English locale
const messages = JSON.parse(fs.readFileSync(EN_LOCALE_PATH, 'utf8'));
const allKeys = Object.keys(messages);

console.log(`🔍 Total keys in EN locale: ${allKeys.length}`);

// 2. Define safe patterns (prefixes that are dynamic or core)
const safePrefixes = [
  'provider_', 'api_provider_', 'ERRORS_', 'STATUS_', 'validation_', 
  'history_', 'SIDEPANEL_', 'options_', 'popup_', 'window_', 'action_',
  'help_', 'activation_', 'prompt_', 'api_', 'gemini_', 'openai_', 
  'deepseek_', 'openrouter_', 'webai_', 'lingva_', 'deepl_', 'custom_', 
  'browser_', 'proxy_', 'theme_', 'font_', 'whole_page_'
];

const safeSpecificKeys = [
  'name', 'nameChrome', 'nameFirefox', 'description', 'IsRTL', 
  'app_welcome', 'context_menu_options', 'context_menu_shortcuts', 
  'context_menu_help', 'context_menu_translate_screen', 
  'context_menu_reload_extension', 'context_menu_translate_with_selection', 
  'context_menu_api_provider', 'export_settings_description', 
  'import_settings_description', 'import_success', 
  'notification_update_title', 'notification_update_message', 
  'save_settings_button', 'excluded_sites_label', 'translateSelectedText'
];

const unusedKeys = [];

console.log('🗳️ Searching for unused keys across the project...');

for (const key of allKeys) {
  // Skip safe patterns
  if (safePrefixes.some(p => key.startsWith(p)) || safeSpecificKeys.includes(key)) {
    continue;
  }

  // Search for the key in source files
  try {
    // Search for the key as a string literal
    const searchDirs = ['src', 'html', 'public', 'config'];
    const searchPaths = searchDirs
      .map(d => path.join(projectRoot, d))
      .filter(p => fs.existsSync(p))
      .join(' ');
    
    const manifestPath = path.join(projectRoot, 'manifest.json');
    const extraPaths = fs.existsSync(manifestPath) ? manifestPath : '';
    
    const command = `grep -r "${key}" ${searchPaths} ${extraPaths} --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git || true`;
    const result = execSync(command).toString();
    
    if (!result.trim()) {
      unusedKeys.push(key);
    }
  } catch (error) {
    unusedKeys.push(key);
  }
}

console.log('\n--- Analysis Results ---');
if (unusedKeys.length === 0) {
  console.log('✅ No unused keys found! Everything is clean.');
} else {
  console.log(`❌ Found ${unusedKeys.length} potentially unused keys:`);
  console.log(JSON.stringify(unusedKeys, null, 2));
  
  const shouldRemove = process.argv.includes('--remove');
  if (shouldRemove) {
    console.log('\n🗑️ Removing unused keys from EN locale...');
    unusedKeys.forEach(key => delete messages[key]);
    fs.writeFileSync(EN_LOCALE_PATH, JSON.stringify(messages, null, 2) + '\n');
    console.log('✅ EN locale cleaned. Now running sync script to update other languages...');
    
    try {
      execSync(`node ${path.join(projectRoot, 'scripts/sync-i18n.cjs')} --fix`, { stdio: 'inherit' });
    } catch (e) {
      console.error('❌ Failed to sync after check. Please run sync-i18n.cjs --fix manually.');
    }
  } else {
    console.log('\n💡 Tip: Run with "--remove" flag to automatically delete these keys.');
    console.log('Example: node scripts/check-i18n.cjs --remove');
  }
}
