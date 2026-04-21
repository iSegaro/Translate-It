/**
 * i18n Sync Script - Ensures all language files are consistent with the English reference.
 * 
 * This script is manifest-driven: it reads supported locales from LocaleManifest.js
 * and ensures their folders/files exist in _locales/.
 * 
 * Usage:
 *   pnpm i18n:sync:fix
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const LOCALES_DIR = path.join(projectRoot, '_locales');
const MANIFEST_PATH = path.join(projectRoot, 'src/shared/config/LocaleManifest.js');
const REFERENCE_LANG = 'en';
const REFERENCE_FILE = path.join(LOCALES_DIR, REFERENCE_LANG, 'messages.json');

const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    return null;
  }
}

function writeJson(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, content + '\n', 'utf8');
    return true;
  } catch (error) {
    console.error(`Error writing to ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Extracts locale codes from the LocaleManifest.js file using regex
 * to avoid complex ESM imports in a CJS script.
 */
function getTargetLocales() {
  try {
    const content = fs.readFileSync(MANIFEST_PATH, 'utf8');
    const matches = content.match(/code:\s*['"]([^'"]+)['"]/g);
    if (!matches) return [];
    return matches.map(m => m.match(/['"]([^'"]+)['"]/)[1]).filter(c => c !== REFERENCE_LANG);
  } catch (error) {
    console.error('Error reading LocaleManifest.js:', error.message);
    return [];
  }
}

async function sync() {
  console.log('🌐 Starting i18n Synchronization Check (Manifest-Driven)...');
  
  const reference = readJson(REFERENCE_FILE);
  if (!reference) {
    console.error(`❌ Reference file not found: ${REFERENCE_FILE}`);
    return;
  }

  const refKeys = Object.keys(reference);
  const targetLocales = getTargetLocales();

  if (targetLocales.length === 0) {
    console.warn('⚠️ No target locales found in LocaleManifest.js');
  }

  let totalIssues = 0;

  for (const locale of targetLocales) {
    const filePath = path.join(LOCALES_DIR, locale, 'messages.json');
    let data = readJson(filePath);
    
    if (!data) {
      if (shouldFix) {
        console.log(`✅ Creating new locale: [${locale}]`);
        data = {};
      } else {
        console.log(`❌ Locale folder/file missing for [${locale}].`);
        totalIssues++;
        continue;
      }
    }

    console.log(`\nChecking [${locale}]...`);
    
    const currentKeys = Object.keys(data);
    const missingKeys = refKeys.filter(k => !currentKeys.includes(k));
    const extraKeys = currentKeys.filter(k => !refKeys.includes(k));

    if (missingKeys.length > 0) {
      console.log(`❌ Missing ${missingKeys.length} keys:`);
      missingKeys.forEach(k => console.log(`   - ${k}`));
      totalIssues += missingKeys.length;
      
      if (shouldFix) {
        missingKeys.forEach(k => {
          data[k] = { ...reference[k], note: 'UNTRANSLATED' };
        });
      }
    }

    if (extraKeys.length > 0) {
      console.log(`⚠️ Extra ${extraKeys.length} keys (not in reference):`);
      extraKeys.forEach(k => console.log(`   - ${k}`));
      totalIssues += extraKeys.length;
      if (shouldFix) {
        extraKeys.forEach(k => delete data[k]);
      }
    }

    if (shouldFix && (missingKeys.length > 0 || extraKeys.length > 0 || !fs.existsSync(filePath))) {
      const sortedData = {};
      refKeys.forEach(k => {
        if (data[k]) sortedData[k] = data[k];
      });
      writeJson(filePath, sortedData);
      console.log(`✅ [${locale}] synchronized and sorted.`);
    } else if (missingKeys.length === 0 && extraKeys.length === 0) {
      console.log(`✅ [${locale}] is in sync!`);
    }
  }

  console.log(`\n--- Summary ---`);
  if (totalIssues === 0) {
    console.log('✅ All localization files are perfectly in sync with the manifest!');
  } else {
    console.log(`Found issues across languages.`);
    if (!shouldFix) {
      console.log('💡 Run "pnpm i18n:sync:fix" to automatically create folders and sync keys.');
    }
  }
}

sync();
