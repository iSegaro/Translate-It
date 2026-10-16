import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { ESLint } from 'eslint';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = join(root, 'src/apps/options/components/InterfaceLocaleSelector.vue');
const eslint = join(root, 'node_modules/eslint/bin/eslint.js');

function lintFile(file) {
  return spawnSync(process.execPath, [eslint, '--format', 'json', file], {
    cwd: root,
    encoding: 'utf8',
  });
}

function lintText(text) {
  return spawnSync(process.execPath, [eslint, '--format', 'json', '--stdin', '--stdin-filename', 'src/apps/options/components/InterfaceLocaleSelector.vue'], {
    cwd: root,
    encoding: 'utf8',
    input: text,
  });
}

describe('Prettier Vue output and ESLint layout rules', () => {
  it('disables only Prettier-conflicting layout rules outside Options', async () => {
    const filename = join(root, 'src/apps/pdf/components/PdfAppBrand.vue');
    const eslintApi = new ESLint({ cwd: root });
    const sourceText = readFileSync(filename, 'utf8');
    const options = await prettier.resolveConfig(filename);
    const formatted = await prettier.format(sourceText, { ...options, filepath: filename });
    const [result] = await eslintApi.lintText(formatted, { filePath: filename });
    expect(result.messages).toHaveLength(0);

    const outsideOptions = await eslintApi.calculateConfigForFile(filename);
    const optionsConfig = await eslintApi.calculateConfigForFile(source);
    for (const rule of [
      'vue/html-indent',
      'vue/html-closing-bracket-newline',
      'vue/singleline-html-element-content-newline',
    ]) {
      expect(outsideOptions.rules[rule][0]).toBe(0);
      expect(optionsConfig.rules[rule][0]).toBe(1);
    }
    expect(outsideOptions.rules['vue/max-attributes-per-line'][0]).toBe(1);
    const [unrelatedViolation] = await eslintApi.lintText('<template><div class="a" id="b"></div></template>', { filePath: filename });
    expect(unrelatedViolation.messages.map(message => message.ruleId)).toContain('vue/max-attributes-per-line');
  });

  it('formats the locale selector without the eight original Vue layout warnings and keeps rules active', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vue-prettier-eslint-'));
    const copy = join(dir, 'InterfaceLocaleSelector.vue');
    copyFileSync(source, copy);
    try {
      const original = JSON.parse(lintFile(source).stdout)[0];
      expect(original.warningCount).toBe(0);

      const options = await prettier.resolveConfig(source);
      writeFileSync(copy, await prettier.format(readFileSync(copy, 'utf8'), { ...options, filepath: source }));
      const formattedLint = JSON.parse(lintText(readFileSync(copy, 'utf8')).stdout)[0];
      expect(formattedLint.warningCount).toBe(0);
      expect(formattedLint.messages).toHaveLength(0);

      const violating = lintText('<template><div class="a" id="b"></div></template>');
      const violations = JSON.parse(violating.stdout)[0].messages.map(message => message.ruleId);
      expect(violations).toContain('vue/max-attributes-per-line');
      expect(violations).toContain('vue/html-self-closing');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
