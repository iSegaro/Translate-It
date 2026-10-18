import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBashEnvPreload } from './test-helpers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const setupPath = join(root, 'scripts/setup/setup.cjs');
const source = readFileSync(setupPath, 'utf8');
const { setupProject, parseVersion, compareVersions, isSupportedNodeVersion, MIN_NODE_VERSION, getMinPnpm } = createRequire(import.meta.url)(setupPath);

function runSetup({ failInstall = false, pnpmVersion = getMinPnpm() } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'setup-test-'));
  const callsFile = join(dir, 'calls.jsonl');
  const mockScript = join(dir, 'mock-pnpm.mjs');
  const executable = process.platform === 'win32' ? join(dir, 'pnpm.cmd') : join(dir, 'pnpm');
  writeFileSync(mockScript, `import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.MOCK_CALLS, JSON.stringify(args) + '\\n');
if (args[0] === '--version') process.stdout.write(process.env.MOCK_PNPM_VERSION + '\\n');
else if (args[0] === 'install' && process.env.MOCK_FAIL_INSTALL === 'true') process.exitCode = 1;
`);
  const wrapper = process.platform === 'win32'
    ? `@echo off\r\nnode "${mockScript}" %*\r\nexit /b %ERRORLEVEL%\r\n`
    : `#!/bin/sh\nexec node "${mockScript}" "$@"\n`;
  writeFileSync(executable, wrapper);
  if (process.platform !== 'win32') chmodSync(executable, 0o755);
  try {
    const result = spawnSync(process.execPath, [setupPath], {
      cwd: root,
      encoding: 'utf8',
      env: createBashEnvPreload(dir, {
        ...process.env,
        PATH: `${dir}${delimiter}${process.env.PATH}`,
        MOCK_CALLS: callsFile,
        MOCK_FAIL_INSTALL: String(failInstall),
        MOCK_PNPM_VERSION: pnpmVersion,
      }),
    });
    if (result.error) throw result.error;
    return {
      ...result,
      output: `${result.stdout}${result.stderr}`,
      calls: existsSync(callsFile) ? readFileSync(callsFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [],
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runInjectedPrerequisites(versions) {
  const output = [];
  const originalLog = console.log;
  const originalError = console.error;
  let index = 0;
  console.log = (...args) => output.push(args.join(' '));
  console.error = (...args) => output.push(args.join(' '));
  try {
    const status = setupProject({
      execSync: (command) => {
        const value = versions[index++];
        if (value instanceof Error) throw value;
        return command === 'pnpm install --frozen-lockfile' ? '' : value;
      },
    });
    return { status, output: output.join('\n'), calls: index };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

describe('development setup', () => {
  it('checks versions, installs frozen dependencies, and prints real next steps without building', () => {
    const result = runSetup();
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('SETUP COMPLETED SUCCESSFULLY');
    for (const nextStep of ['build:chrome', 'build:firefox', 'dev:chrome', 'dev:firefox', 'watch:chrome', 'watch:firefox', 'test:run', 'lint:styles', 'validate:chrome', 'validate:firefox', 'chrome://extensions', 'about:debugging']) {
      expect(result.output).toContain(nextStep);
    }
    expect(result.calls).toContainEqual(['install', '--frozen-lockfile']);
    expect(result.calls.some(args => args.some(arg => /build|validate|web-ext|add/.test(arg)))).toBe(false);
    const executableSource = source.split('\n').filter(line => !line.includes('log(\'  Production builds:') && !line.includes('log(\'  Validate:')).join('\n');
    expect(executableSource).not.toMatch(/readline|askQuestion|askMultipleChoice|pnpm add|run build|run validate|execSync\(['"]pnpm run (?:build|validate)/);
  });

  it('parses and compares versions and rejects missing or incompatible prerequisites', () => {
    expect(parseVersion('v22.22.2')).toEqual([22, 22, 2]);
    expect(parseVersion('not-a-version')).toBeNull();
    expect(compareVersions('22.22.2', MIN_NODE_VERSION)).toBe(0);
    expect(compareVersions('22.22.1', MIN_NODE_VERSION)).toBe(-1);
    const minPnpm = getMinPnpm();
    expect(minPnpm).toBe('12.11.2');

    const nodeBoundaries = [
      ['20.19.0', false],
      ['21.0.0', false],
      ['22.22.1', false],
      ['22.22.2', true],
      ['22.23.1', true],
      ['23.0.0', false],
      ['24.14.9', false],
      ['24.15.0', true],
      ['25.0.0', false],
      ['26.0.0', true],
    ];
    for (const [version, supported] of nodeBoundaries) {
      expect(isSupportedNodeVersion(version), version).toBe(supported);
      const injected = runInjectedPrerequisites([`v${version}`, minPnpm]);
      expect(injected.status, version).toBe(supported ? 0 : 1);
    }

    const oldNode = runInjectedPrerequisites(['v20.19.0']);
    expect(oldNode.status).toBe(1);
    expect(oldNode.output).toContain('22.22.2+');
    expect(oldNode.calls).toBe(1);
    const oldPnpm = runInjectedPrerequisites(['v22.22.2', '11.0.0']);
    expect(oldPnpm.status).toBe(1);
    expect(oldPnpm.output).toContain('major version 12');
    expect(oldPnpm.calls).toBe(2);
    const missingPnpm = runInjectedPrerequisites(['v22.22.2', new Error('missing')]);
    expect(missingPnpm.status).toBe(1);
    expect(missingPnpm.output).toContain('pnpm not found');
  });

  it('fails installation without printing success and shows accurate troubleshooting', () => {
    const result = runSetup({ failInstall: true });
    expect(result.status).toBe(1);
    expect(result.output).not.toContain('SETUP COMPLETED SUCCESSFULLY');
    expect(result.output).toContain('Node.js 22.22.2+ in 22.x, 24.15.0+ in 24.x, or 26+');
    expect(result.output).toContain(`pnpm ${getMinPnpm()}`);
    expect(result.output).toContain('pnpm install --frozen-lockfile');
    expect(result.calls).toContainEqual(['install', '--frozen-lockfile']);
  });
});
