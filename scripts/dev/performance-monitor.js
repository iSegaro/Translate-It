import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      buildTime: null,
      bundleSize: {},
      testResults: {},
      timestamp: Date.now()
    }
  }

  async run() {
    console.log('📊 Performance Monitoring Report')
    console.log('=' .repeat(40))
    
    try {
      await this.measureBuildTime()
      await this.analyzeBundleSize()
      await this.runTestBenchmarks()
      await this.generateReport()
      
      console.log('\n✅ Performance monitoring complete!')
      
    } catch (error) {
      console.error('❌ Performance monitoring failed:', error.message)
      process.exit(1)
    }
  }

  async measureBuildTime() {
    console.log('\n⏱️  Measuring build performance...')
    
    const startTime = Date.now()
    
    try {
      // Clean previous build
      if (fs.existsSync('dist-vue')) {
        execSync('rimraf dist-vue', { stdio: 'pipe' })
      }
      
      // Measure production build time
      execSync('pnpm run build:vue:production', { stdio: 'pipe' })
      
      const buildTime = Date.now() - startTime
      this.metrics.buildTime = buildTime
      
      console.log(`   Build completed in ${buildTime}ms (${(buildTime/1000).toFixed(2)}s)`)
      
      // Performance benchmarks
      if (buildTime > 30000) { // 30 seconds
        console.log('   ⚠️  Build time exceeds 30s - consider optimization')
      } else if (buildTime > 15000) { // 15 seconds
        console.log('   💡 Build time good, room for improvement')
      } else {
        console.log('   🚀 Excellent build performance!')
      }
      
    } catch (error) {
      throw new Error(`Build failed: ${error.message}`)
    }
  }

  async analyzeBundleSize() {
    console.log('\n📦 Analyzing bundle sizes...')
    
    const distPath = 'dist-vue'
    
    if (!fs.existsSync(distPath)) {
      throw new Error('Build output not found')
    }
    
    const bundleStats = this.calculateBundleStats(distPath)
    this.metrics.bundleSize = bundleStats
    
    console.log(`   Total bundle size: ${(bundleStats.totalSize / 1024).toFixed(2)}KB`)
    console.log(`   Gzipped estimate: ${(bundleStats.totalSize * 0.3 / 1024).toFixed(2)}KB`)
    
    // Entry point analysis
    Object.entries(bundleStats.entries).forEach(([name, size]) => {
      const sizeKB = (size / 1024).toFixed(2)
      console.log(`   ${name}: ${sizeKB}KB`)
    })
    
    // Performance targets
    const targets = {
      popup: 80 * 1024,
      sidepanel: 90 * 1024,
      options: 100 * 1024
    }
    
    let allTargetsMet = true
    Object.entries(targets).forEach(([entry, target]) => {
      const htmlFile = `${entry}.html`
      if (bundleStats.entries[htmlFile]) {
        const size = bundleStats.entries[htmlFile]
        if (size > target) {
          allTargetsMet = false
          console.log(`   ⚠️  ${htmlFile} exceeds target (${(target/1024)}KB)`)
        }
      }
    })
    
    if (allTargetsMet) {
      console.log('   ✅ All bundle size targets met!')
    }
  }

  calculateBundleStats(distPath) {
    const stats = {
      totalSize: 0,
      entries: {},
      chunks: {},
      assets: {}
    }
    
    const readDirRecursive = (dir, prefix = '') => {
      const files = fs.readdirSync(dir, { withFileTypes: true })
      
      for (const file of files) {
        const fullPath = path.join(dir, file.name)
        const relativePath = path.join(prefix, file.name)
        
        if (file.isDirectory()) {
          readDirRecursive(fullPath, relativePath)
        } else {
          const stat = fs.statSync(fullPath)
          const size = stat.size
          stats.totalSize += size
          
          if (file.name.endsWith('.html')) {
            stats.entries[file.name] = size
          } else if (file.name.endsWith('.js')) {
            stats.chunks[file.name] = size
          } else {
            stats.assets[file.name] = size
          }
        }
      }
    }
    
    readDirRecursive(distPath)
    return stats
  }

  async runTestBenchmarks() {
    console.log('\n🧪 Running test benchmarks...')
    
    try {
      // Run unit tests and measure time
      const unitTestStart = Date.now()
      const unitTestResult = execSync('pnpm run test:vue:run', { 
        stdio: 'pipe',
        encoding: 'utf8'
      })
      const unitTestTime = Date.now() - unitTestStart
      
      // Parse test results
      const testResults = this.parseTestResults(unitTestResult)
      
      this.metrics.testResults = {
        unitTestTime,
        ...testResults
      }
      
      console.log(`   Unit tests completed in ${unitTestTime}ms`)
      console.log(`   Tests passed: ${testResults.passed}/${testResults.total}`)
      
      if (testResults.failed > 0) {
        console.log(`   ⚠️  ${testResults.failed} tests failed`)
      } else {
        console.log('   ✅ All tests passed!')
      }
      
    } catch (error) {
      console.log('   ⚠️  Test execution failed')
      this.metrics.testResults = {
        error: error.message
      }
    }
  }

  parseTestResults(output) {
    const results = {
      total: 0,
      passed: 0,
      failed: 0
    }
    
    // Parse vitest output
    const lines = output.split('\n')
    for (const line of lines) {
      if (line.includes('Test Files')) {
        const match = line.match(/(\d+) passed/)
        if (match) {
          results.passed = parseInt(match[1])
        }
        const failMatch = line.match(/(\d+) failed/)
        if (failMatch) {
          results.failed = parseInt(failMatch[1])
        }
      }
      
      if (line.includes('Tests  ')) {
        const testMatch = line.match(/(\d+) passed/)
        if (testMatch) {
          results.total = parseInt(testMatch[1]) + results.failed
        }
      }
    }
    
    if (results.total === 0) {
      // Fallback parsing
      const passedMatch = output.match(/(\d+) passed/)
      if (passedMatch) {
        results.passed = parseInt(passedMatch[1])
        results.total = results.passed
      }
    }
    
    return results
  }

  async generateReport() {
    console.log('\n📋 Performance Report Summary')
    console.log('-'.repeat(30))
    
    // Build performance grade
    let buildGrade = 'A'
    if (this.metrics.buildTime > 30000) buildGrade = 'D'
    else if (this.metrics.buildTime > 20000) buildGrade = 'C'
    else if (this.metrics.buildTime > 10000) buildGrade = 'B'
    
    console.log(`🏗️  Build Performance: Grade ${buildGrade}`)
    console.log(`   Time: ${(this.metrics.buildTime / 1000).toFixed(2)}s`)
    
    // Bundle size grade
    const totalSizeKB = this.metrics.bundleSize.totalSize / 1024
    let sizeGrade = 'A'
    if (totalSizeKB > 500) sizeGrade = 'D'
    else if (totalSizeKB > 300) sizeGrade = 'C'
    else if (totalSizeKB > 200) sizeGrade = 'B'
    
    console.log(`📦 Bundle Size: Grade ${sizeGrade}`)
    console.log(`   Total: ${totalSizeKB.toFixed(2)}KB`)
    
    // Test performance grade
    let testGrade = 'A'
    if (this.metrics.testResults.error) {
      testGrade = 'F'
    } else if (this.metrics.testResults.failed > 0) {
      testGrade = 'C'
    } else if (this.metrics.testResults.unitTestTime > 10000) {
      testGrade = 'B'
    }
    
    console.log(`🧪 Test Performance: Grade ${testGrade}`)
    if (this.metrics.testResults.unitTestTime) {
      console.log(`   Time: ${(this.metrics.testResults.unitTestTime / 1000).toFixed(2)}s`)
    }
    
    // Overall grade
    const grades = [buildGrade, sizeGrade, testGrade]
    const gradeValues = grades.map(g => 
      g === 'A' ? 4 : g === 'B' ? 3 : g === 'C' ? 2 : g === 'D' ? 1 : 0
    )
    const avgGrade = gradeValues.reduce((a, b) => a + b, 0) / gradeValues.length
    const overallGrade = avgGrade >= 3.5 ? 'A' : avgGrade >= 2.5 ? 'B' : avgGrade >= 1.5 ? 'C' : 'D'
    
    console.log(`\n🎯 Overall Performance: Grade ${overallGrade}`)
    
    // Save report to file
    const reportPath = 'performance-report.json'
    const report = {
      timestamp: new Date().toISOString(),
      grades: {
        build: buildGrade,
        bundle: sizeGrade,
        test: testGrade,
        overall: overallGrade
      },
      metrics: this.metrics
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
    console.log(`\n📄 Report saved to ${reportPath}`)
    
    // Recommendations
    this.generateRecommendations(buildGrade, sizeGrade, testGrade)
  }

  generateRecommendations(buildGrade, sizeGrade, testGrade) {
    console.log('\n💡 Recommendations:')
    
    if (buildGrade === 'C' || buildGrade === 'D') {
      console.log('   🏗️  Build Optimization:')
      console.log('      - Enable parallel builds')
      console.log('      - Use build caching')
      console.log('      - Optimize dependency resolution')
    }
    
    if (sizeGrade === 'C' || sizeGrade === 'D') {
      console.log('   📦 Bundle Optimization:')
      console.log('      - Enable code splitting')
      console.log('      - Use dynamic imports')
      console.log('      - Remove unused dependencies')
      console.log('      - Optimize images and assets')
    }
    
    if (testGrade === 'C' || testGrade === 'D') {
      console.log('   🧪 Test Optimization:')
      console.log('      - Use test parallelization')
      console.log('      - Optimize test setup')
      console.log('      - Fix failing tests')
    }
    
    if (buildGrade === 'A' && sizeGrade === 'A' && testGrade === 'A') {
      console.log('   🎉 Excellent performance! No recommendations needed.')
    }
  }
}

// Run performance monitoring if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const monitor = new PerformanceMonitor()
  monitor.run().catch(error => {
    console.error('Performance monitoring failed:', error)
    process.exit(1)
  })
}

export { PerformanceMonitor }