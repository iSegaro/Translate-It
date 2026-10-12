import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const files = process.argv.slice(2);
if (files.length === 0 || files.some((argument) => argument.startsWith('-'))) {
  console.error('Usage: pnpm run format <file...>');
  process.exitCode = 2;
} else {
  const require = createRequire(import.meta.url);
  const prettierBin = require.resolve('prettier/bin/prettier.cjs');
  const result = spawnSync(process.execPath, [prettierBin, '--write', ...files], { stdio: 'inherit' });
  if (result.error) {
    console.error(result.error.message);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
}
