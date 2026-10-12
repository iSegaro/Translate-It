import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function runFormat(args, options = {}) {
  return spawnSync(process.execPath, [join(root, 'scripts/dev/format.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 5000,
    ...options,
  });
}

describe('format command', () => {
  it('requires explicit files without consuming stdin or changing files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'format-test-'));
    const fixture = join(dir, 'unchanged.js');
    const contents = 'const value=1;\n';
    writeFileSync(fixture, contents);
    try {
      for (const [args, options] of [
        [[], {}],
        [[], { input: 'stdin must not be formatted' }],
        [['--write'], {}],
        [['--stdin-filepath', 'example.js'], { input: 'stdin must not be formatted' }],
      ]) {
        const result = runFormat(args, options);
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(2);
        expect(result.stderr).toContain('Usage: pnpm run format <file...>');
        expect(readFileSync(fixture, 'utf8')).toBe(contents);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('formats only an explicitly provided file and is wired through package.json', () => {
    expect(packageJson.scripts.format).toBe('node scripts/dev/format.mjs');
    const dir = mkdtempSync(join(tmpdir(), 'format-test-'));
    const fixture = join(dir, 'fixture with spaces.js');
    writeFileSync(fixture, 'const value=1;\n');
    try {
      const result = runFormat([fixture]);
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(fixture, 'utf8')).toBe('const value = 1;\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
