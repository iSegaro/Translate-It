import { describe, expect, it } from 'vitest'
import { OCRBenchmarkReportBuilder } from './OCRBenchmarkReportBuilder.js'

describe('OCRBenchmarkReportBuilder', () => {
  it('builds an immutable report without summary data', () => {
    const evaluations = Object.freeze([Object.freeze({ providerId: 'provider', result: Object.freeze({}) })])

    const report = new OCRBenchmarkReportBuilder().build(evaluations)

    expect(report).toEqual({ evaluations })
    expect(Object.isFrozen(report)).toBe(true)
    expect(Object.isFrozen(report.evaluations)).toBe(true)
  })
})
