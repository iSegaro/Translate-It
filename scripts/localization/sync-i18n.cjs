/**
 * i18n Sync Script - Ensures all language files are consistent with the English reference.
 * 
 * Usage:
 *   node scripts/sync-i18n.cjs [--fix]
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '../../_locales');
const REFERENCE_LANG = 'en';
const REFERENCE_FILE = path.join(LOCALES_DIR, REFERENCE_LANG, 'messages.json');

const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');

function readJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    return null;
  }
}

function writeJson(filePath, data) {
  try {
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, content + '\n', 'utf8');
    return true;
  } catch (error) {
    console.error(`Error writing to ${filePath}:`, error.message);
    return false;
  }
}

async function sync() {
  console.log('🌐 Starting i18n Synchronization Check...');
  
  const reference = readJson(REFERENCE_FILE);
  if (!reference) return;

  const refKeys = Object.keys(reference);
  const locales = fs.readdirSync(LOCALES_DIR).filter(f => {
    const stat = fs.statSync(path.join(LOCALES_DIR, f));
    return stat.isDirectory() && f !== REFERENCE_LANG;
  });

  let totalIssues = 0;

  for (const locale of locales) {
    const filePath = path.join(LOCALES_DIR, locale, 'messages.json');
    const data = readJson(filePath);
    if (!data) continue;

    console.log(`\nChecking [${locale}]...`);
    
    const currentKeys = Object.keys(data);
    const missingKeys = refKeys.filter(k => !currentKeys.includes(k));
    const extraKeys = currentKeys.filter(k => !refKeys.includes(k));

    if (missingKeys.length > 0) {
      console.log(`❌ Missing ${missingKeys.length} keys.`);
      totalIssues += missingKeys.length;
      
      if (shouldFix) {
        missingKeys.forEach(k => {
          data[k] = { ...reference[k], note: 'UNTRANSLATED' };
        });
      }
    }

    if (extraKeys.length > 0) {
      console.log(`⚠️ Extra ${extraKeys.length} keys (not in reference).`);
      if (shouldFix) {
        extraKeys.forEach(k => delete data[k]);
      }
    }

    if (shouldFix && (missingKeys.length > 0 || extraKeys.length > 0)) {
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
    console.log('✨ All localization files are perfectly in sync!');
  } else {
    console.log(`Found issues across languages.`);
    if (!shouldFix) {
      console.log('💡 Run with --fix to automatically resolve.');
    }
  }
}

sync();
