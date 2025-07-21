const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const pkg = require("../package.json");

/**
 * Firefox Extension Validation Script
 * Enhanced validation with detailed reporting similar to Chrome validator
 */

const FIREFOX_BUILD_DIR = `./Build-Extension/Firefox/Translate-It-v${pkg.version}/`;

async function validateFirefoxExtension() {
  console.log(
    "╔═══════════════════════════════════════════════════════════════╗"
  );
  console.log(
    "║                 🦊 FIREFOX EXTENSION VALIDATOR                ║"
  );
  console.log(
    "╚═══════════════════════════════════════════════════════════════╝\n"
  );

  const results = {
    errors: 0,
    warnings: 0,
    notices: 0,
    checks: [],
  };

  try {
    // Step 1: Build Directory Check
    console.log("┌─ BUILD DIRECTORY VALIDATION");
    console.log("├─ Checking Firefox build directory...");
    if (!fs.existsSync(FIREFOX_BUILD_DIR)) {
      throw new Error(
        `Firefox build directory not found: ${FIREFOX_BUILD_DIR}`
      );
    }
    console.log("├─ ✅ Firefox build directory found");
    console.log("└─ Path: " + FIREFOX_BUILD_DIR + "\n");

    // Step 2: Manifest Validation
    console.log("┌─ MANIFEST.JSON VALIDATION");
    console.log("├─ Checking manifest file existence...");
    const manifestPath = path.join(FIREFOX_BUILD_DIR, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error("manifest.json not found in Firefox build");
    }
    console.log("├─ ✅ manifest.json found");

    console.log("├─ Parsing manifest structure...");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    console.log("├─ Validating required fields...");
    // Firefox-specific manifest checks
    if (
      !manifest.manifest_version ||
      (manifest.manifest_version !== 2 && manifest.manifest_version !== 3)
    ) {
      throw new Error("Firefox extension must use Manifest V2 or V3");
    }
    console.log(`├─ ✅ Manifest Version: V${manifest.manifest_version}`);

    if (!manifest.name || !manifest.version || !manifest.description) {
      throw new Error(
        "Missing required manifest fields: name, version, or description"
      );
    }
    console.log(`├─ ✅ Extension Name: ${manifest.name}`);
    console.log(`├─ ✅ Extension Version: ${manifest.version}`);
    console.log(`└─ ✅ Manifest validation completed\n`);

    // Step 3: Mozilla Add-ons Linter
    console.log("┌─ MOZILLA ADDONS-LINTER VALIDATION");
    console.log("├─ Running official Firefox validation...");

    const addonLinterCommand = `addons-linter "${FIREFOX_BUILD_DIR}"`;

    try {
      const output = execSync(addonLinterCommand, { encoding: "utf8" });

      // Parse addons-linter output
      const lines = output.split("\n");
      const summaryLine = lines.find((line) =>
        line.includes("Validation Summary:")
      );

      if (summaryLine) {
        console.log("├─ ✅ addons-linter execution completed");

        // Extract validation results
        let errors = 0,
          warnings = 0,
          notices = 0;
        for (const line of lines) {
          if (line.includes("errors") && line.trim().match(/^errors\s+\d+/)) {
            errors = parseInt(line.trim().split(/\s+/)[1]);
          }
          if (
            line.includes("warnings") &&
            line.trim().match(/^warnings\s+\d+/)
          ) {
            warnings = parseInt(line.trim().split(/\s+/)[1]);
          }
          if (line.includes("notices") && line.trim().match(/^notices\s+\d+/)) {
            notices = parseInt(line.trim().split(/\s+/)[1]);
          }
        }

        results.errors += errors;
        results.warnings += warnings;
        results.notices += notices;

        console.log("├─ VALIDATION RESULTS:");
        console.log(
          `├─   Errors:   ${errors === 0 ? "✅ " + errors : "❌ " + errors}`
        );
        console.log(
          `├─   Warnings: ${warnings === 0 ? "✅ " + warnings : "⚠️ " + warnings}`
        );
        console.log(
          `├─   Notices:  ${notices === 0 ? "✅ " + notices : "ℹ️ " + notices}`
        );

        // Report results
        if (errors > 0) {
          console.log("└─ ❌ FAILED: addons-linter found critical errors\n");
          throw new Error(`addons-linter found ${errors} error(s)`);
        } else {
          console.log("└─ ✅ PASSED: Mozilla validation successful\n");
        }
      }
    } catch (error) {
      // Check if it's a validation error or command error
      if (error.stdout && error.stdout.includes("Validation Summary:")) {
        // Parse the error output for validation issues
        const errorOutput = error.stdout;
        console.log("├─ DETAILED OUTPUT:");
        console.log(
          errorOutput
            .split("\n")
            .map((line) => "│  " + line)
            .join("\n")
        );
        console.log("└─ ❌ FAILED: addons-linter validation failed\n");
        throw new Error("addons-linter validation failed with issues");
      } else {
        console.log("└─ ❌ FAILED: addons-linter execution error\n");
        throw new Error(`addons-linter execution failed: ${error.message}`);
      }
    }

    // Step 4: Firefox-Specific Analysis
    console.log("┌─ FIREFOX-SPECIFIC ANALYSIS");

    const issues = [];
    const warnings = [];
    const info = [];

    console.log("├─ Analyzing Firefox compatibility...");

    // Check for Firefox-specific features
    if (
      manifest.browser_specific_settings &&
      manifest.browser_specific_settings.gecko
    ) {
      info.push("Firefox-specific settings configured");
      if (manifest.browser_specific_settings.gecko.id) {
        info.push(
          `Extension ID: ${manifest.browser_specific_settings.gecko.id}`
        );
      }
    }

    // Check permissions
    if (manifest.permissions && manifest.permissions.length > 0) {
      console.log("├─ Analyzing permissions...");

      if (manifest.permissions.includes("tabs")) {
        info.push("Uses tabs permission (can access tab information)");
      }

      if (manifest.permissions.includes("storage")) {
        info.push("Uses storage permission (can store data)");
      }

      if (manifest.permissions.includes("<all_urls>")) {
        info.push("Uses <all_urls> permission (universal website access required for translation)");
      }
    }

    // Check host permissions (Firefox uses this for <all_urls>)
    if (manifest.host_permissions && manifest.host_permissions.length > 0) {
      console.log("├─ Analyzing host permissions...");
      info.push(`Host permissions defined: ${manifest.host_permissions.length} entries`);
      if (manifest.host_permissions.includes("<all_urls>")) {
        info.push("Uses <all_urls> host permission (universal website access required for translation)");
      }
    }

    // Check for background scripts vs service worker
    if (manifest.background) {
      console.log("├─ Analyzing background implementation...");
      if (manifest.background.scripts && manifest.manifest_version === 3) {
        // Firefox V3 still uses background.scripts (not service_worker yet)
        info.push("Uses background.scripts (Firefox MV3 compatible)");
      } else if (manifest.background.service_worker && manifest.manifest_version === 3) {
        info.push("Uses service_worker (Manifest V3 standard)");
      } else if (manifest.background.scripts && manifest.manifest_version === 2) {
        info.push("Uses background.scripts (Manifest V2 standard)");
      } else if (
        manifest.background.service_worker &&
        manifest.manifest_version === 2
      ) {
        issues.push(
          "Manifest V2 should use background.scripts instead of service_worker"
        );
      } else {
        info.push("Background implementation is correctly configured");
      }
    }

    // Display results in organized format
    console.log("├─ ANALYSIS RESULTS:");

    if (issues.length > 0) {
      console.log("├─   Issues Found:");
      issues.forEach((issue) => {
        console.log(`├─     ❌ ${issue}`);
        results.warnings++; // Count as warnings for summary
      });
    }

    if (warnings.length > 0) {
      console.log("├─   Warnings:");
      warnings.forEach((warning) => {
        console.log(`├─     ⚠️  ${warning}`);
        results.warnings++;
      });
    }

    if (info.length > 0) {
      console.log("├─   Information:");
      info.forEach((infoItem) => {
        console.log(`├─     ℹ️  ${infoItem}`);
      });
    }

    if (issues.length === 0 && warnings.length === 0) {
      console.log("├─   ✅ No compatibility issues found");
    }

    console.log("└─ Firefox analysis completed\n");

    // Step 5: Package Analysis
    console.log("┌─ PACKAGE SIZE & STRUCTURE ANALYSIS");
    console.log("├─ Analyzing extension package...");
    const stats = getDirectoryStats(FIREFOX_BUILD_DIR);

    const sizeMB = (stats.totalSize / 1024 / 1024).toFixed(2);
    const sizeLimit = 200; // Firefox limit in MB

    console.log("├─ PACKAGE STATISTICS:");
    console.log(`├─   Total Files: ${stats.fileCount}`);
    console.log(`├─   Total Size:  ${sizeMB} MB`);
    console.log(`├─   Size Limit:  ${sizeLimit} MB (Firefox Add-ons)`);

    // Firefox has different size limits
    if (stats.totalSize > sizeLimit * 1024 * 1024) {
      console.log("└─ ❌ FAILED: Package size exceeds Firefox limit\n");
      throw new Error(
        `Extension size (${sizeMB}MB) exceeds Firefox Add-ons limit (${sizeLimit}MB)`
      );
    } else {
      const percentageUsed = (
        (stats.totalSize / (sizeLimit * 1024 * 1024)) *
        100
      ).toFixed(1);
      console.log(`├─   Usage:       ${percentageUsed}% of allowed size`);
      console.log("└─ ✅ PASSED: Package size within limits\n");
    }

    // Final Summary
    console.log(
      "╔═══════════════════════════════════════════════════════════════╗"
    );
    console.log(
      "║                  🦊 FIREFOX VALIDATION SUMMARY                ║"
    );
    console.log(
      "╠═══════════════════════════════════════════════════════════════╣"
    );
    console.log(
      `║  Status:  ${results.errors === 0 ? "✅ PASSED" : "❌ FAILED"}                                           ║`
    );
    console.log(
      `║  Errors:    ${results.errors.toString().padStart(3, " ")}                                               ║`
    );
    console.log(
      `║  Warnings:  ${results.warnings.toString().padStart(3, " ")}                                               ║`
    );
    console.log(
      `║  Notices:   ${results.notices.toString().padStart(3, " ")}                                               ║`
    );
    console.log(
      "╠═══════════════════════════════════════════════════════════════╣"
    );
    console.log(
      "║  🦊 Firefox Extension Ready for Add-ons Store Submission!     ║"
    );
    console.log(
      "╚═══════════════════════════════════════════════════════════════╝\n"
    );
   
    
  } catch (error) {
    console.log(
      "╔═══════════════════════════════════════════════════════════════╗"
    );
    console.log(
      "║                 🦊 FIREFOX VALIDATION FAILED                  ║"
    );
    console.log(
      "╠═══════════════════════════════════════════════════════════════╣"
    );
    console.log(`║  ❌ Error: ${error.message.padEnd(51, " ")}║`);
    console.log(
      "╠═══════════════════════════════════════════════════════════════╣"
    );
    console.log(
      "║  Please fix the above issues and run validation again.        ║"
    );
    console.log(
      "╚═══════════════════════════════════════════════════════════════╝\n"
    );
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
validateFirefoxExtension();
