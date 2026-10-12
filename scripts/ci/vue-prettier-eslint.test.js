import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = join(root, 'src/apps/options/components/InterfaceLocaleSelector.vue');
const eslint = join(root, 'node_modules/eslint/bin/eslint.js');
const eslintConfig = join(root, 'config/eslint.config.js');

function lintFile(file) {
  return spawnSync(process.execPath, [eslint, '--config', eslintConfig, '--format', 'json', file], {
    cwd: root,
    encoding: 'utf8',
  });
}

function lintText(text) {
  return spawnSync(process.execPath, [eslint, '--config', eslintConfig, '--format', 'json', '--stdin', '--stdin-filename', 'src/apps/options/components/InterfaceLocaleSelector.vue'], {
    cwd: root,
    encoding: 'utf8',
    input: text,
  });
}

describe('Prettier Vue output and ESLint layout rules', () => {
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
