import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import { globSync } from 'glob';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const config = join(root, 'config/eslint.config.js');
const eslintBin = join(root, 'node_modules/eslint/bin/eslint.js');
const newlyCovered = [
  ...globSync('src/shared/config/**/*.js'),
  ...globSync('src/features/text-field-interaction/config/**/*.js'),
  'src/config/manifest-generator.test.js',
];
const intentionallyIgnored = [
  'src/public/browser-polyfill.js',
  'src/features/screen-capture/assets/worker.min.js',
  'src/features/screen-capture/assets/tesseract-core-simd-lstm.wasm.js',
  'src/features/screen-capture/assets/tesseract-core-relaxedsimd-lstm.wasm.js',
  'src/features/screen-capture/assets/tesseract-core-lstm.wasm.js',
];
const ignoredScriptModules = globSync('scripts/**/*.mjs', { cwd: root });

describe('ESLint config directory ignores', () => {
  it('lints nested source config modules and retains intentional exclusions', async () => {
    const lint = spawnSync(process.execPath, [eslintBin, '--config', config, '--format', 'json', ...newlyCovered], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(lint.error).toBeUndefined();
    const reports = JSON.parse(lint.stdout);
    expect(lint.status, lint.stderr).toBe(0);
    expect(reports).toHaveLength(newlyCovered.length);
    expect(reports.flatMap(report => report.messages)).toEqual([]);

    const eslint = new ESLint({ overrideConfigFile: config });
    for (const file of newlyCovered) expect(await eslint.isPathIgnored(join(root, file)), file).toBe(false);
    for (const file of intentionallyIgnored) expect(await eslint.isPathIgnored(join(root, file)), file).toBe(true);
    expect(await eslint.isPathIgnored(join(root, 'config/vite/vite.config.chrome.js'))).toBe(true);
    expect(ignoredScriptModules.length).toBeGreaterThan(0);
    for (const file of ignoredScriptModules) expect(await eslint.isPathIgnored(join(root, file)), file).toBe(true);

    const tempDir = mkdtempSync(join(tmpdir(), 'eslint-config-ignore-'));
    try {
      const moduleFile = join(tempDir, 'new-module.mjs');
      writeFileSync(moduleFile, 'export {};\n');
      const tempEslint = new ESLint({ overrideConfigFile: config, cwd: tempDir });
      expect(await tempEslint.isPathIgnored(moduleFile), moduleFile).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }

    const violation = spawnSync(process.execPath, [eslintBin, '--config', config, '--format', 'json', '--stdin', '--stdin-filename', 'src/shared/config/config.js'], {
      cwd: root,
      encoding: 'utf8',
      input: 'const unused = 1;\n',
    });
    const [probe] = JSON.parse(violation.stdout);
    expect(probe.messages.some(message => message.ruleId === 'no-unused-vars' && message.severity === 2)).toBe(true);
  }, 30_000);
});
