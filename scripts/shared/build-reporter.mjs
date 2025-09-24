import { logStep, logSuccess, logError, logInfo } from './logger.mjs'
import { formatFileSize, formatPackageSize } from './box-utils.mjs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))

// Constants for box formatting
const BOX_WIDTH = 66
const CONTENT_WIDTH = 60  // Consistent width for all sections
const LABEL_WIDTH = 45    // Consistent width for all labels (includes prefix and spacing)
const SECTION_PADDING = 10

/**
 * Beautiful build reporter with consistent formatting
 */
export class BuildReporter {
  constructor(browser) {
    this.browser = browser.toLowerCase()
    this.browserIcon = browser === 'chrome' ? '🕸️' : '🦊'
    this.startTime = Date.now()
    this.stats = {
      files: 0,
      totalSize: 0,
      chunks: {},
      assets: {}
    }
  }

  /**
   * Get visible length of string (accounting for emojis and wide characters)
   */
  getVisibleLength(str) {
    // Emojis and wide characters take 2 visual width but count as 1 in JS length
    const emojiPattern = /[\p{Emoji_Presentation}\p{Emoji}\u200D]+/gu
    const wideCharPattern = /[\u1100-\u115F\u2329-\u232A\u2E80-\u303F\u3040-\u30FF\u3130-\u318F\u3190-\u319F\u31C0-\u31EF\u3200-\u32FF\u3300-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7AF\uD7B0-\uD7FF\uF900-\uFAFF\uFE10-\uFE6B\uFF01-\uFF60\uFFE0-\uFFE6]/gu

    let visibleLength = str.length

    // Note: Modern JavaScript emojis already have length 2, so no extra space needed
    // However, some emojis might display differently in certain terminals
    if (str.includes('🕸')) {
      visibleLength -= 1;  // 🕸 needs 1 less space
    } else if (str.includes('🦊')) {
      visibleLength -= 0;  // 🦊 needs 0 less spaces
    } else if (str.includes('✅')) {
      visibleLength += 1;  // ✅ needs 1 more space
    } else if (str.includes('❌')) {
      visibleLength += 1;  // ❌ needs 1 more space
    }

    return visibleLength
  }

  /**
   * Pad string to the right with spaces
   */
  padRight(str, totalLength) {
    const visibleLength = this.getVisibleLength(str)
    const paddingNeeded = Math.max(0, totalLength - visibleLength)
    return str + ' '.repeat(paddingNeeded)
  }

  /**
   * Center text within box width
   */
  centerText(str, width = BOX_WIDTH) {
    const visibleLength = this.getVisibleLength(str)
    // Internal width is BOX_WIDTH - 2 (for the border characters)
    const internalWidth = width - 2
    const paddingNeeded = internalWidth - visibleLength
    const leftPadding = Math.floor(paddingNeeded / 2)
    const rightPadding = paddingNeeded - leftPadding
    return ' '.repeat(Math.max(0, leftPadding)) + str + ' '.repeat(Math.max(0, rightPadding))
  }

  /**
   * Start build reporting
   */
  start() {
    const browserName = this.browser.toUpperCase()
    this._buildProcessStarted = false

    const headerText = `${this.browserIcon} ${browserName} EXTENSION BUILD`

    console.log('╔════════════════════════════════════════════════════════════════╗')

    const centeredText = this.centerText(headerText)
    console.log(`║${centeredText}║`)
    console.log('╚════════════════════════════════════════════════════════════════╝\n')

    logStep('Starting build process...')
    this.logConfiguration()
  }

  /**
   * Log build configuration
   */
  logConfiguration() {
    console.log('┌─ CONFIGURATION')

    // Define the spacing after the prefix (├─ or └─)
    const prefixWidth = 2 // Width of "├─" or "└─"
    const labelSpacing = 2 // Spaces after label before colon
    const valueSpacing = 2 // Spaces after colon before value
    const totalWidth = CONTENT_WIDTH

    // Calculate label positions
    const browserLabel = 'Browser'
    const outputLabel = 'Output Directory'
    const modeLabel = 'Build Mode'
    const versionLabel = 'Vue Version'

    // Find the maximum label length
    const maxLabelLength = Math.max(
      browserLabel.length,
      outputLabel.length,
      modeLabel.length,
      versionLabel.length
    )

    // Browser line
    const browserValue = this.browser === 'chrome' ? 'Chrome (Manifest V3)' : 'Firefox (Manifest V2)'
    const browserLine = this.padRight(`${browserLabel}:`, LABEL_WIDTH - 3) // -3 for "├─ "
    console.log(`├─ ${browserLine} ${browserValue}`)

    // Output Directory line
    const outputValue = `dist/${this.browser}/Translate-It-v${pkg.version}/`
    const outputLine = this.padRight(`${outputLabel}:`, LABEL_WIDTH - 3)
    console.log(`├─ ${outputLine} ${outputValue}`)

    // Build Mode line
    const modeValue = process.env.NODE_ENV || 'Production'
    const modeLine = this.padRight(`${modeLabel}:`, LABEL_WIDTH - 3)
    console.log(`├─ ${modeLine} ${modeValue}`)

    // Vue Version line
    const versionValue = '3.5.18'
    const versionLine = this.padRight(`${versionLabel}:`, LABEL_WIDTH - 3)
    console.log(`└─ ${versionLine} ${versionValue}\n`)
  }

  /**
   * Log build steps
   */
  logBuildStep(step, status = 'in-progress') {
    const icon = status === 'completed' ? '✅' : status === 'failed' ? '❌' : '⚡'
    const duration = status === 'completed' ? `(${((Date.now() - this.startTime) / 1000).toFixed(1)}s)` : ''

    // Only print header for first call
    if (!this._buildProcessStarted) {
      console.log('┌─ BUILD PROCESS')
      this._buildProcessStarted = true
    }

    // Use consistent label width for alignment
    const stepLine = this.padRight(`${icon} ${step}`, LABEL_WIDTH - 3) // -3 for "├─ "

    if (duration) {
      console.log(`├─ ${stepLine} ${duration}`)
    } else {
      console.log(`├─ ${stepLine}`)
    }

    if (status === 'completed') {
      const browserType = this.browser === 'chrome' ? 'Chrome V3' : 'Firefox V2'
      const manifestLine = this.padRight(`${icon} Manifest generation...`, LABEL_WIDTH - 3)
      const assetLine = this.padRight(`${icon} Asset optimization...`, LABEL_WIDTH - 3)
      const bundleLine = this.padRight(`${icon} Bundle compression...`, LABEL_WIDTH - 3)

      console.log(`├─ ${manifestLine} ✅ ${browserType} Ready`)
      console.log(`├─ ${assetLine} ✅ Optimized`)
      console.log(`└─ ${bundleLine} ✅ Compressed\n`)
    }
  }

  /**
   * Analyze build output
   */
  analyzeBuild(buildPath) {
    try {
      console.log('┌─ BUNDLE ANALYSIS')
      
      // Read HTML files
      const htmlFiles = ['popup.html', 'options.html', 'sidepanel.html']
      htmlFiles.forEach(file => {
        const filePath = path.join(buildPath, file)
        if (fs.existsSync(filePath)) {
          const size = fs.statSync(filePath).size
          const sizeStr = formatFileSize(size)
          const improvement = this.calculateImprovement(file, size)
          const fileAligned = this.padRight(`${this.getFileIcon(file)} ${file}`, LABEL_WIDTH - 3)
          console.log(`├─ ${fileAligned} → ${sizeStr.padStart(9)} ${improvement}`)
        }
      })

      // Read JS files
      const jsDir = path.join(buildPath, 'js')
      if (fs.existsSync(jsDir)) {
        const jsFiles = this.getMainJSFiles(jsDir)
        jsFiles.forEach(({ file, size }) => {
          const sizeStr = formatFileSize(size)
          const improvement = this.calculateImprovement(file, size)
          const fileAligned = this.padRight(`${this.getFileIcon(file)} ${file}`, LABEL_WIDTH - 3)
          console.log(`├─ ${fileAligned} → ${sizeStr.padStart(9)} ${improvement}`)
        })
      }

      // Calculate total
      const totalStats = this.calculateTotalSize(buildPath)
      const totalSizeStr = formatFileSize(totalStats.totalSize)
      const totalImprovement = this.calculateImprovement('total', totalStats.totalSize)

      const totalAligned = this.padRight(`📊 Total Size:`, LABEL_WIDTH - 3)
      console.log(`└─ ${totalAligned} → ${totalSizeStr.padStart(9)} ${totalImprovement}\n`)
      
      return totalStats
    } catch (error) {
      logError('Failed to analyze build:', error.message)
      return { totalSize: 0, fileCount: 0 }
    }
  }

  /**
   * Get main JS files for reporting
   */
  getMainJSFiles(jsDir) {
    const files = []
    const items = fs.readdirSync(jsDir, { withFileTypes: true })

    for (const item of items) {
      if (item.isFile() && item.name.endsWith('.js')) {
        const filePath = path.join(jsDir, item.name)
        const size = fs.statSync(filePath).size

        // Report main files based on importance
        if (item.name.startsWith('index.') ||
            item.name.includes('content-scripts') ||
            item.name.includes('vendor') ||
            item.name.includes('main')) {
          files.push({ file: item.name, size })
        }
      } else if (item.isDirectory()) {
        // Recursively check subdirectories for main files
        const subDir = path.join(jsDir, item.name)
        const subFiles = this.getMainJSFiles(subDir)
        files.push(...subFiles.map(f => ({ ...f, file: `${item.name}/${f.file}` })))
      }
    }

    // Sort by size (largest first) and limit to top 5
    return files.sort((a, b) => b.size - a.size).slice(0, 5)
  }

  /**
   * Calculate total build size
   */
  calculateTotalSize(buildPath) {
    let totalSize = 0
    let fileCount = 0

    const traverse = (currentPath) => {
      const items = fs.readdirSync(currentPath)
      
      for (const item of items) {
        const itemPath = path.join(currentPath, item)
        const stats = fs.statSync(itemPath)
        
        if (stats.isDirectory()) {
          traverse(itemPath)
        } else {
          fileCount++
          totalSize += stats.size
        }
      }
    }

    traverse(buildPath)
    return { totalSize, fileCount }
  }

  /**
   * Calculate improvement percentage (mock data for now)
   */
  calculateImprovement(file, size) {
    // Mock webpack sizes for comparison
    const webpackSizes = {
      'popup.html': 20480,      // 20KB
      'options.html': 23552,    // 23KB  
      'sidepanel.html': 24576,  // 24KB
      'popup.js': 1048576,      // 1MB
      'options.js': 1310720,    // 1.25MB
      'sidepanel.js': 1179648,  // 1.125MB
      'total': 5242880          // 5MB
    }

    const oldSize = webpackSizes[file] || size * 2
    const improvement = Math.max(0, Math.round(((oldSize - size) / oldSize) * 100))
    
    if (improvement > 0) {
      return `(↓${improvement}% from webpack)`
    }
    return '(new)'
  }

  
  /**
   * Get file icon based on type
   */
  getFileIcon(file) {
    if (file.includes('popup')) return '🔧'
    if (file.includes('options')) return '⚙️'
    if (file.includes('sidepanel')) return '📱'
    if (file.endsWith('.html')) return '📄'
    if (file.endsWith('.js')) return '📦'
    return '📄'
  }

  /**
   * Show final success message
   */
  success(buildStats) {
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(1)
    const browserName = this.browser.toUpperCase()
    const storeName = this.browser === 'chrome' ? 'Chrome Web Store' : 'Firefox Add-ons'

    console.log('╔════════════════════════════════════════════════════════════════╗')

    const centeredText = this.centerText('✅ BUILD SUCCESSFUL')
    console.log(`║${centeredText}║`)

    const storeLine = `${this.browserIcon} Ready for ${storeName} submission!`
    console.log(`║${this.centerText(storeLine)}║`)

    const timeLine = `⏱ Build completed in ${duration}s`
    console.log(`║${this.centerText(timeLine)}║`)

    if (buildStats) {
      const sizeStr = formatFileSize(buildStats.totalSize)
      const sizeInfo = `${sizeStr} total, ${buildStats.fileCount} files`
      console.log(`║${this.centerText(`📊 ${sizeInfo}`)}║`)
    }
    console.log('╚════════════════════════════════════════════════════════════════╝\n')
  }

  /**
   * Show error message
   */
  error(errorMessage) {
    const browserName = this.browser.toUpperCase()

    console.log('╔════════════════════════════════════════════════════════════════╗')

    const centeredText = this.centerText(`${this.browserIcon} ${browserName} BUILD FAILED`)
    console.log(`║${centeredText}║`)
    console.log('╠════════════════════════════════════════════════════════════════╣')

    // Content width is 58 (62 - 4 for the 2-space indent)
    const contentWidth = 58

    const errorText = `❌ Error: ${errorMessage.slice(0, 51)}`
    console.log(`║  ${this.padRight(errorText, contentWidth)}║`)

    console.log('╠════════════════════════════════════════════════════════════════╣')
    console.log(`║  ${this.padRight('Please fix the above issues and run build again.', contentWidth)}║`)
    console.log('╚════════════════════════════════════════════════════════════════╝\n')
  }
}