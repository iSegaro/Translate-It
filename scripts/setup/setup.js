const { execSync } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

/**
 * Complete Project Setup Script
 * Sets up the entire Translate-It extension project from scratch
 */

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.toLowerCase().trim());
    });
  });
}

function askMultipleChoice(question, options, defaultChoice) {
  const optionsText = options.map((opt, i) => `${i + 1}. ${opt.label}`).join('\n     ');
  const prompt = `${question}\n     ${optionsText}\n   Choice (${defaultChoice}): `;
  
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      const choice = answer.trim() || defaultChoice;
      const index = parseInt(choice) - 1;
      
      if (index >= 0 && index < options.length) {
        resolve(options[index]);
      } else {
        resolve(options[parseInt(defaultChoice) - 1]);
      }
    });
  });
}

async function runCommand(command, description, optional = false, silent = false) {
  if (!silent) console.log(`📦 ${description}...`);
  try {
    execSync(command, { stdio: silent ? 'pipe' : 'inherit' });
    if (!silent) console.log(`✅ ${description} completed`);
    return true;
  } catch (error) {
    if (optional) {
      if (!silent) console.log(`⚠️  ${description} failed (optional)`);
      return false;
    } else {
      console.error(`❌ ${description} failed: ${error.message}`);
      throw error;
    }
  }
}

function checkPrerequisites() {
  console.log('🔍 Checking prerequisites...');
  
  const requirements = [
    { cmd: 'node --version', name: 'Node.js', min: 'v18.0.0' },
    { cmd: 'pnpm --version', name: 'pnpm', min: '8.0.0' }
  ];
  
  for (const req of requirements) {
    try {
      const version = execSync(req.cmd, { encoding: 'utf8' }).trim();
      console.log(`✅ ${req.name}: ${version}`);
    } catch (error) {
      console.error(`❌ ${req.name} not found or not working`);
      console.error(`   Please install ${req.name} ${req.min}+ and try again`);
      process.exit(1);
    }
  }
}

async function setupProject() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║              🚀 TRANSLATE-IT PROJECT SETUP                    ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  
  console.log('Welcome to Translate-It Extension setup!');
  console.log('This script will configure your development environment.\n');
  
  try {
    // 1. Prerequisites Check
    checkPrerequisites();
    
    // 2. Install Core Dependencies
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📦 CORE DEPENDENCIES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    await runCommand('pnpm install', 'Installing core dependencies', false, true);
    
    // 3. Development Tools Setup
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🛠️  DEVELOPMENT TOOLS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Ask about Chrome Validator
    const chromeValidator = await askQuestion('\nDo you want to install Chrome validator? (y/N): ');
    
    if (chromeValidator === 'y' || chromeValidator === 'yes') {
      await runCommand('pnpm add -D web-ext', 'Installing Chrome validator (web-ext)');
    } else {
      console.log('⏭️  Skipping Chrome validator (you can install later with: pnpm run setup:chrome-validator)');
    }
    
    // 4. Build Configuration
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🏗️  BUILD CONFIGURATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const buildOptions = [
      { label: 'Development build only', value: 'dev' },
      { label: 'Production build only', value: 'prod' },
      { label: 'Both builds (recommended)', value: 'both' }
    ];
    
    const buildChoice = await askMultipleChoice(
      '\nWhich build would you like to create initially?',
      buildOptions,
      '3'
    );
    
    switch (buildChoice.value) {
      case 'dev':
        await runCommand('pnpm run build:chrome', 'Building Chrome development', false, true);
        await runCommand('pnpm run build:firefox', 'Building Firefox development', false, true);
        break;
      case 'prod':
        await runCommand('pnpm run build', 'Building production versions', false, true);
        break;
      case 'both':
        await runCommand('pnpm run build:chrome', 'Building Chrome development', false, true);
        await runCommand('pnpm run build:firefox', 'Building Firefox development', false, true);
        await runCommand('pnpm run build', 'Building production versions', false, true);
        break;
    }
    
    // 5. Validation
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ VALIDATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const runValidation = await askQuestion('\nRun validation checks now? (Y/n): ');
    
    if (runValidation !== 'n' && runValidation !== 'no') {
      await runCommand('pnpm run validate:firefox', 'Validating Firefox extension', true);
      
      if (chromeValidator === 'y' || chromeValidator === 'yes') {
        await runCommand('pnpm run validate:chrome', 'Validating Chrome extension', true);
      }
    } else {
      console.log('⏭️  Skipping validation (you can run later with: pnpm run validate)');
    }
    
    // 6. Final Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 SETUP COMPLETED SUCCESSFULLY!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log('\n📋 Project Information:');
    console.log('   Name: Translate-It Extension');
    console.log('   Type: Cross-browser web extension');
    console.log('   browsers: Chrome & Firefox');
    
    console.log('\n🚀 Available Commands:');
    console.log('   Development:');
    console.log('     pnpm run watch:chrome     - Watch Chrome development');
    console.log('     pnpm run watch:firefox    - Watch Firefox development');
    console.log('   Building:');
    console.log('     pnpm run build           - Build production versions');
    console.log('     pnpm run build:chrome    - Build Chrome only');
    console.log('     pnpm run build:firefox   - Build Firefox only');
    console.log('   Quality Assurance:');
    console.log('     pnpm run lint            - Lint source code');
    console.log('     pnpm run validate        - Validate extensions');
    console.log('     pnpm run validate:firefox - Validate Firefox only');
    if (chromeValidator === 'y' || chromeValidator === 'yes') {
      console.log('     pnpm run validate:chrome  - Validate Chrome');
    }
    console.log('   Publishing:');
    console.log('     pnpm run source          - Create source archive');
    console.log('     pnpm run publish         - Full publishing workflow');
    
    console.log('\n💡 Next Steps:');
    console.log('   1. Review the generated builds in Build-Extension/ folder');
    console.log('   2. Load the extension in your browser for testing:');
    console.log('      - Chrome: chrome://extensions/ (Enable Developer Mode)');
    console.log('      - Firefox: about:debugging (This Firefox → Load Temporary Add-on)');
    console.log('   3. Start development with: pnpm run watch:chrome or pnpm run watch:firefox');
    console.log('   4. Read CLAUDE.md for detailed development guidelines');
    
    if (chromeValidator !== 'y' && chromeValidator !== 'yes') {
      console.log('\n⚡ Optional:');
      console.log('   Install Chrome validator later: pnpm run setup:chrome-validator');
    }
    
    console.log('\n🎯 Happy coding! 🚀\n');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   - Ensure you have Node.js 18+ and pnpm 8+ installed');
    console.error('   - Check your internet connection');
    console.error('   - Try running: pnpm cache clean && pnpm store prune');
    console.error('   - Run setup again: pnpm run setup');
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Only run if called directly (not imported)
if (require.main === module) {
  setupProject();
}

module.exports = { setupProject };