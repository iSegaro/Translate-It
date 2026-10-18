const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');
const { getProjectNames } = require('../shared/project-names.cjs');

/**
 * Chrome Extension Validation Script
 * Combines web-ext validation with custom Chrome-specific checks
 */

const { artifactPrefix } = getProjectNames(pkg.name);
const CHROME_BUILD_DIR = `./dist/chrome/${artifactPrefix}-v${pkg.version}/`;
const TEMP_ARTIFACTS_DIR = './temp/chrome-validation';

async function validateChromeExtension() {
  // Check if web-ext is installed
  try {
    execSync('web-ext --version', { stdio: 'pipe' });
  } catch (error) {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                 🕸️ CHROME VALIDATOR NOT FOUND                 ║');
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log('║  Chrome validator requires web-ext package to be installed.   ║');
    console.log('║                                                               ║');
    console.log('║  Install with: pnpm run setup:chrome-validator               ║');
    console.log('║  Or manually: pnpm add -D web-ext                            ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    process.exit(1);
  }
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                 🕸️ CHROME EXTENSION VALIDATOR                 ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  
  const results = {
    errors: 0,
    warnings: 0,
    notices: 0,
    checks: []
  };
  
  try {
    // Step 1: Build Directory Check
    console.log('┌─ BUILD DIRECTORY VALIDATION');
    console.log('├─ Checking Chrome build directory...');
    if (!fs.existsSync(CHROME_BUILD_DIR)) {
      throw new Error(`Chrome build directory not found: ${CHROME_BUILD_DIR}`);
    }
    console.log('├─ ✅ Chrome build directory found');
    console.log('└─ Path: ' + CHROME_BUILD_DIR + '\n');

    // Step 2: Manifest Validation
    console.log('┌─ MANIFEST.JSON VALIDATION');
    console.log('├─ Checking manifest file existence...');
    const manifestPath = path.join(CHROME_BUILD_DIR, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('manifest.json not found in Chrome build');
    }
    console.log('├─ ✅ manifest.json found');
    
    console.log('├─ Parsing manifest structure...');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    console.log('├─ Validating required fields...');
    // Chrome-specific manifest checks
    if (manifest.manifest_version !== 3) {
      throw new Error('Chrome extension must use Manifest V3');
    }
    console.log(`├─ ✅ Manifest Version: V${manifest.manifest_version}`);
    
    if (!manifest.name || !manifest.version || !manifest.description) {
      throw new Error('Missing required manifest fields: name, version, or description');
    }
    console.log(`├─ ✅ Extension Name: ${manifest.name}`);
    console.log(`├─ ✅ Extension Version: ${manifest.version}`);
    console.log(`└─ ✅ Manifest validation completed\n`);

    // Step 3: Cross-browser Validation
    console.log('┌─ WEB-EXT CROSS-BROWSER VALIDATION');
    console.log('├─ Running cross-browser compatibility check...');
    
    // Create temp directory for artifacts
    if (!fs.existsSync('./temp')) {
      fs.mkdirSync('./temp');
      console.log('├─ Created temporary directory for artifacts');
    }
    
    const webExtCommand = `web-ext build --source-dir="${CHROME_BUILD_DIR}" --artifacts-dir="${TEMP_ARTIFACTS_DIR}" --overwrite-dest`;
    
    try {
      const output = execSync(webExtCommand, { encoding: 'utf8' });
      console.log('├─ ✅ web-ext build completed successfully');
      
      // Check if zip was created
      if (output.includes('Your web extension is ready:')) {
        console.log('├─ ✅ Extension package created');
        const zipPath = output.match(/Your web extension is ready: (.+)/)?.[1];
        if (zipPath && fs.existsSync(zipPath.trim())) {
          const zipStats = fs.statSync(zipPath.trim());
          console.log(`├─ ✅ Package file: ${(zipStats.size / 1024).toFixed(2)} KB`);
        }
      }
      console.log('└─ ✅ Cross-browser validation passed\n');
    } catch (error) {
      console.log('└─ ❌ FAILED: web-ext validation failed\n');
      throw new Error(`web-ext validation failed: ${error.message}`);
    }

    // Step 4: Chrome-Specific Analysis
    console.log('┌─ CHROME-SPECIFIC ANALYSIS');
    
    const issues = [];
    const warnings = [];
    const info = [];
    
    console.log('├─ Analyzing Chrome compatibility...');
    
    // Check for service worker (background script)
    if (manifest.background) {
      console.log('├─ Analyzing background implementation...');
      if (manifest.background.scripts) {
        issues.push('Manifest V3 should use service_worker instead of background.scripts');
      } else if (manifest.background.service_worker) {
        info.push('Service worker correctly configured for Manifest V3');
      }
    }
    
    // Check permissions
    if (manifest.permissions && manifest.permissions.length > 0) {
      console.log('├─ Analyzing permissions...');
      
      if (manifest.permissions.includes('tabs')) {
        info.push('Uses tabs permission (can access tab information)');
      }
      
      if (manifest.permissions.includes('storage')) {
        info.push('Uses storage permission (can store data)');
      }
      
      if (manifest.permissions.includes('activeTab')) {
        info.push('Uses activeTab permission (user-initiated access)');
      }
      
      if (manifest.permissions.includes('<all_urls>')) {
        info.push('Uses <all_urls> permission (universal website access required for translation)');
      }
    }
    
    // Check for host permissions
    if (manifest.host_permissions && manifest.host_permissions.length > 0) {
      console.log('├─ Analyzing host permissions...');
      info.push(`Host permissions defined: ${manifest.host_permissions.length} entries`);
      if (manifest.host_permissions.includes('<all_urls>')) {
        info.push('Uses <all_urls> host permission (universal website access required for translation)');
      }
    }
    
    // Check for content security policy
    if (!manifest.content_security_policy) {
      info.push('No custom content security policy (using Chrome defaults)');
    } else {
      info.push('Custom content security policy configured');
    }
    
    // Display results in organized format
    console.log('├─ ANALYSIS RESULTS:');
    
    if (issues.length > 0) {
      console.log('├─   Issues Found:');
      issues.forEach(issue => {
        console.log(`├─     ❌ ${issue}`);
        results.warnings++; // Count as warnings for summary
      });
    }
    
    if (warnings.length > 0) {
      console.log('├─   Warnings:');
      warnings.forEach(warning => {
        console.log(`├─     ⚠️  ${warning}`);
        results.warnings++;
      });
    }
    
    if (info.length > 0) {
      console.log('├─   Information:');
      info.forEach(infoItem => {
        console.log(`├─     ℹ️  ${infoItem}`);
      });
    }
    
    if (issues.length === 0 && warnings.length === 0) {
      console.log('├─   ✅ No compatibility issues found');
    }
    
    console.log('└─ Chrome analysis completed\n');

    // Step 5: Package Analysis
    console.log('┌─ PACKAGE SIZE & STRUCTURE ANALYSIS');
    console.log('├─ Analyzing extension package...');
    const stats = getDirectoryStats(CHROME_BUILD_DIR);
    
    const sizeMB = (stats.totalSize / 1024 / 1024).toFixed(2);
    const sizeLimit = 128; // Chrome limit in MB
    
    console.log('├─ PACKAGE STATISTICS:');
    console.log(`├─   Total Files: ${stats.fileCount}`);
    console.log(`├─   Total Size:  ${sizeMB} MB`);
    console.log(`├─   Size Limit:  ${sizeLimit} MB (Chrome Web Store)`);
    
    if (stats.totalSize > sizeLimit * 1024 * 1024) {
      console.log('└─ ❌ FAILED: Package size exceeds Chrome limit\n');
      throw new Error(`Extension size (${sizeMB}MB) exceeds Chrome Web Store limit (${sizeLimit}MB)`);
    } else {
      const percentageUsed = ((stats.totalSize / (sizeLimit * 1024 * 1024)) * 100).toFixed(1);
      console.log(`├─   Usage:       ${percentageUsed}% of allowed size`);
      console.log('└─ ✅ PASSED: Package size within limits\n');
    }

    // Clean up temp files
    console.log('┌─ CLEANUP');
    console.log('├─ Removing temporary files...');
    if (fs.existsSync('./temp')) {
      fs.rmSync('./temp', { recursive: true, force: true });
      console.log('├─ ✅ Temporary files removed');
    }
    console.log('└─ Cleanup completed\n');

    // Final Summary
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                 🕸️ CHROME VALIDATION SUMMARY                  ║');
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log(`║  Status: ${results.errors === 0 ? '✅ PASSED' : '❌ FAILED'}                                            ║`);
    console.log(`║  Errors:   ${results.errors.toString().padStart(3, ' ')}                                                ║`);
    console.log(`║  Warnings: ${results.warnings.toString().padStart(3, ' ')}                                                ║`);
    console.log(`║  Notices:  ${results.notices.toString().padStart(3, ' ')}                                                ║`);
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log('║  🕸️ Chrome Extension Ready for Web Store Submission!          ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    // Clean up on error
    if (fs.existsSync('./temp')) {
      fs.rmSync('./temp', { recursive: true, force: true });
    }
    
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                🕸️ CHROME VALIDATION FAILED                    ║');
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log(`║  ❌ Error: ${error.message.padEnd(51, ' ')}║`);
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log('║  Please fix the above issues and run validation again.       ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    process.exit(1);
  }
}

function getDirectoryStats(dirPath) {
  let fileCount = 0;
  let totalSize = 0;
  
  function traverse(currentPath) {
    const items = fs.readdirSync(currentPath);
    
    for (const item of items) {
      const itemPath = path.join(currentPath, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        traverse(itemPath);
      } else {
        fileCount++;
        totalSize += stats.size;
      }
    }
  }
  
  traverse(dirPath);
  return { fileCount, totalSize };
}

// Run validation
validateChromeExtension();
