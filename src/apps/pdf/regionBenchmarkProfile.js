import { createBenchmarkProfile } from './BenchmarkProfile.js'

export const DEFAULT_REGION_BENCHMARK_PROFILE = createBenchmarkProfile({
  id: 'default-region-ocr',
  name: 'Default Region OCR',
  configurations: [
    { scale: 1, language: 'eng' },
    { scale: 1.5, language: 'eng' }
  ]
})
