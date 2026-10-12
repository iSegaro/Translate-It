const { execSync: defaultExecSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MIN_NODE_VERSION = '20.19.0';

function parseVersion(version) {
  const match = String(version).trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

function isSupportedNodeVersion(version) {
  const parsed = parseVersion(version);
  if (!parsed) return false;
  const [major] = parsed;
  if (major === 20) return compareVersions(version, '20.19.0') >= 0;
  if (major === 22) return compareVersions(version, '22.12.0') >= 0;
  return major >= 24;
}

function getMinPnpm() {
  try {
    const { packageManager } = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
    const version = packageManager?.match(/^pnpm@(.+)$/)?.[1];
    return parseVersion(version) ? version : '12.0.0';
  } catch {
    return '12.0.0';
  }
}

function printTroubleshooting(error) {
  error('\n💡 Troubleshooting:');
  error('   - Use Node.js 22 (minimum 20.19.0 for Vite 8) and pnpm 12.8.1.');
  error('   - Check your internet connection and retry: pnpm install --frozen-lockfile');
  error('   - Do not remove or regenerate pnpm-lock.yaml to resolve setup errors.');
}

function setupProject({ execSync = defaultExecSync } = {}) {
  const log = console.log;
  const error = console.error;
  log('╔═══════════════════════════════════════════════════════════════╗');
  log('║              🗳️ TRANSLATE-IT PROJECT SETUP                    ║');
  log('╚═══════════════════════════════════════════════════════════════╝\n');
  log('Checking prerequisites...');

  const requirements = [
    { command: 'node --version', name: 'Node.js', minimum: MIN_NODE_VERSION, compatible: isSupportedNodeVersion },
    { command: 'pnpm --version', name: 'pnpm', minimum: getMinPnpm(), compatible: (version, minimum) => parseVersion(version)?.[0] === parseVersion(minimum)[0] },
  ];

  for (const requirement of requirements) {
    let version;
    try {
      version = execSync(requirement.command, { encoding: 'utf8' }).trim();
    } catch {
      error(`❌ ${requirement.name} not found or could not be run.`);
      error(`   Install ${requirement.name} ${requirement.minimum}+ and run setup again.`);
      printTroubleshooting(error);
      return 1;
    }
    log(`✅ ${requirement.name}: ${version}`);
    if (!parseVersion(version) || !requirement.compatible(version, requirement.minimum)) {
      error(requirement.name === 'Node.js'
        ? `❌ Node.js ${version} is incompatible; supported versions are 20.19.0+ in 20.x, 22.12.0+, or 24+ (Node 22 recommended).`
        : `❌ ${requirement.name} ${version} is incompatible; required major version ${parseVersion(requirement.minimum)[0]} (packageManager: pnpm@${requirement.minimum}).`);
      printTroubleshooting(error);
      return 1;
    }
  }

  try {
    log('\n📦 Installing dependencies with the frozen lockfile...');
    execSync('pnpm install --frozen-lockfile', { stdio: 'inherit' });
  } catch (installError) {
    error(`\n❌ Dependency installation failed: ${installError.message}`);
    printTroubleshooting(error);
    return 1;
  }

  log('\n SETUP COMPLETED SUCCESSFULLY!');
  log('\nNext steps:');
  log('  Development builds: pnpm run build:chrome / pnpm run build:firefox');
  log('  Watch changes:      pnpm run watch:chrome / pnpm run watch:firefox');
  log('  Tests:              pnpm run test:run');
  log('  Lint:               pnpm run lint and pnpm run lint:styles');
  log('  Validate:           pnpm run validate / pnpm run validate:chrome / pnpm run validate:firefox');
  log('  Chrome unpacked:    chrome://extensions (enable Developer mode, then Load unpacked)');
  log('  Firefox temporary:  about:debugging (This Firefox, then Load Temporary Add-on)');
  return 0;
}

if (require.main === module) process.exitCode = setupProject();

module.exports = { setupProject, parseVersion, compareVersions, isSupportedNodeVersion, MIN_NODE_VERSION, getMinPnpm };
