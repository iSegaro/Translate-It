export class OCRBenchmarkReportBuilder {
  build(evaluations) {
    return Object.freeze({
      evaluations: Object.freeze([...evaluations])
    })
  }
}
