/**
 * Benchmark test configuration.
 *
 * Intentionally isolated from the product test configuration so benchmark
 * infrastructure can evolve independently (corpus runner, performance tests,
 * custom reporters, coverage, and benchmark-specific setup).
 */

import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../../src', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['benchmarks/region-ocr/tests/**/*.test.js']
  }
})
