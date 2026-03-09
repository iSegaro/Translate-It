/**
 * i18n Note Purge Tool
 * This script removes the "note": "UNTRANSLATED" fields from a specific localization file.
 * 
 * Usage:
 *   pnpm i18n:purge <locale_code>
 * 
 * Example:
 *   pnpm i18n:purge de
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const projectRoot = path.resolve(__dirname, '..', '..');
const LOCALES_DIR = path.join(projectRoot, '_locales');

const targetLocale = process.argv[2];

if (!targetLocale) {
  console.error('❌ Error: Please specify a locale code.');
  console.log('Usage: pnpm i18n:purge <locale_code>');
  process.exit(1);
}

const filePath = path.join(LOCALES_DIR, targetLocale, 'messages.json');

if (!fs.existsSync(filePath)) {
  console.error(`❌ Error: Locale file not found at ${filePath}`);
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function purgeNotesInFile() {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    let modified = false;

    Object.keys(data).forEach(key => {
      if (data[key] && data[key].note) {
        delete data[key].note;
        modified = true;
      }
    });

    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
      console.log(`✅ Success! [${targetLocale}] is now clean.`);
    } else {
      console.log(`ℹ️ No "UNTRANSLATED" notes found in [${targetLocale}].`);
    }
  } catch (error) {
    console.error(`❌ Error processing file:`, error.message);
  }
}

console.log(`\n⚠️  WARNING: You are about to purge all "UNTRANSLATED" notes from [${targetLocale}].`);
console.log(`   - Once purged, you won't be able to easily identify which strings still need translation.`);
console.log(`   - It is HIGHLY RECOMMENDED to have a backup or commit your changes before proceeding.\n`);

rl.question(`❓ Are you sure you want to proceed for [${targetLocale}]? (y/N): `, (answer) => {
  if (answer.toLowerCase() === 'y') {
    purgeNotesInFile();
  } else {
    console.log('❌ Operation cancelled.');
  }
  rl.close();
});
