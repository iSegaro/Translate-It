import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const stylelintBin = join(root, 'node_modules/stylelint/bin/stylelint.mjs');

function printConfig(file) {
  const result = spawnSync(process.execPath, [stylelintBin, '--print-config', file], {
    cwd: root,
    encoding: 'utf8',
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

describe('root Stylelint config path matching', () => {
  it('applies the intended critical, utility, legacy, and ordinary rules', () => {
    expect(printConfig('src/assets/styles/critical/probe.scss').rules).toMatchObject({
      'declaration-no-important': null,
      'selector-max-specificity': null,
    });
    expect(printConfig('src/assets/styles/utilities/probe.scss').rules).toMatchObject({
      'declaration-no-important': null,
      'selector-max-specificity': ['0,4,1'],
    });
    expect(printConfig('src/assets/styles/layout/_options.scss').rules).toMatchObject({
      'declaration-no-important': null,
      'selector-max-specificity': null,
      'selector-class-pattern': null,
    });
    expect(printConfig('src/assets/styles/components/_toast.scss').rules).toMatchObject({
      'declaration-no-important': [true],
      'selector-max-specificity': ['0,4,1'],
    });
  }, 30_000);

  it('auto-discovers the root config and keeps Vue files ignored', () => {
    const ignored = spawnSync(process.execPath, [stylelintBin, 'src/apps/options/components/InterfaceLocaleSelector.vue'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(ignored.error).toBeUndefined();
    expect(ignored.status, ignored.stderr).toBe(0);
    expect(ignored.stdout).toBe('');

    const discovery = spawnSync(process.execPath, [stylelintBin, '--print-config', 'src/assets/styles/layout/_options.scss'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(discovery.error).toBeUndefined();
    expect(discovery.status, discovery.stderr).toBe(0);
    const config = JSON.parse(discovery.stdout);
    expect(config.rules['selector-max-specificity']).toBeNull();
    expect(config.ignoreFiles).toContain(join(root, 'src/**/*.vue'));
  }, 30_000);
});
