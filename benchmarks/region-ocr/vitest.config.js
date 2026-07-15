/**
 * Benchmark test configuration.
 *
 * Intentionally isolated from the product test configuration so benchmark
 * infrastructure can evolve independently (corpus runner, performance tests,
 * custom reporters, coverage, and benchmark-specific setup).
 */

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['benchmarks/region-ocr/tests/**/*.test.js']
  }
})
