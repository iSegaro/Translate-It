#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { glob } from 'glob'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')

class CSSAnalyzer {
  constructor() {
    this.results = {
      totalFiles: 0,
      totalClasses: 0,
      importantDeclarations: 0,
      duplicateClasses: new Map(),
      classUsage: new Map(),
      filesWithStyles: new Set(),
      importantLocations: [],
      issues: []
    }
  }

  async analyze() {
    console.log('🔍 Starting CSS Analysis...\n')

    // Find all style files
    const styleFiles = await this.findStyleFiles()
    console.log(`📁 Found ${styleFiles.length} style files`)

    // Find all Vue files
    const vueFiles = await this.findVueFiles()
    console.log(`📁 Found ${vueFiles.length} Vue files`)

    // Analyze SCSS/CSS files
    for (const file of styleFiles) {
      await this.analyzeStyleFile(file)
    }

    // Analyze Vue files
    for (const file of vueFiles) {
      await this.analyzeVueFile(file)
    }

    // Analyze JavaScript class usage
    await this.analyzeJsClassUsage()

    // Generate report
    this.generateReport()
  }

  async findStyleFiles() {
    return await glob('src/assets/styles/**/*.{scss,css}', { cwd: rootDir })
  }

  async findVueFiles() {
    return await glob('src/**/*.{vue,js,ts}', { cwd: rootDir })
  }

  async analyzeStyleFile(filePath) {
    const fullPath = path.join(rootDir, filePath)
    const content = fs.readFileSync(fullPath, 'utf8')

    this.results.totalFiles++

    // Count !important declarations
    const importantMatches = content.match(/!important/g)
    if (importantMatches) {
      const count = importantMatches.length
      this.results.importantDeclarations += count

      // Find line numbers for !important
      const lines = content.split('\n')
      lines.forEach((line, index) => {
        if (line.includes('!important')) {
          this.results.importantLocations.push({
            file: filePath,
            line: index + 1,
            content: line.trim()
          })
        }
      })
    }

    // Extract CSS classes
    const classRegex = /\.([a-zA-Z][a-zA-Z0-9_-]*)/g
    let match
    while ((match = classRegex.exec(content)) !== null) {
      const className = match[1]

      // Skip pseudo-classes and keyframes
      if (className.startsWith(':') || className.startsWith('@')) continue

      this.results.totalClasses++

      if (this.results.classUsage.has(className)) {
        this.results.classUsage.get(className).push(filePath)
      } else {
        this.results.classUsage.set(className, [filePath])
      }
    }

    this.results.filesWithStyles.add(filePath)
  }

  async analyzeVueFile(filePath) {
    const fullPath = path.join(rootDir, filePath)
    const content = fs.readFileSync(fullPath, 'utf8')

    // Extract class usage from templates
    const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/)
    if (templateMatch) {
      const templateContent = templateMatch[1]

      // Find all class attributes
      const classAttrRegex = /class=["']([^"']*?)["']/g
      let classMatch
      while ((classMatch = classAttrRegex.exec(templateContent)) !== null) {
        const classes = classMatch[1].split(/\s+/)
        classes.forEach(cls => {
          // Skip dynamic bindings
          if (cls.includes('{{') || cls.includes('${')) return

          if (this.results.classUsage.has(cls)) {
            this.results.classUsage.get(cls).push(filePath)
          } else {
            this.results.classUsage.set(cls, [filePath])
          }
        })
      }
    }

    // Check for scoped styles
    const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/)
    if (styleMatch) {
      this.results.filesWithStyles.add(filePath)
      await this.analyzeStyleContent(styleMatch[1], filePath)
    }
  }

  async analyzeStyleContent(content, sourceFile) {
    // Count !important in style blocks
    const importantMatches = content.match(/!important/g)
    if (importantMatches) {
      this.results.importantDeclarations += importantMatches.length
    }
  }

  async analyzeJsClassUsage() {
    const jsFiles = await glob('src/**/*.{js,ts,vue}', { cwd: rootDir })

    for (const file of jsFiles) {
      const fullPath = path.join(rootDir, file)
      const content = fs.readFileSync(fullPath, 'utf8')

      // Find className assignments
      const classNameRegex = /\.className\s*=\s*["']([^"']*?)["']/g
      let match
      while ((match = classNameRegex.exec(content)) !== null) {
        const classes = match[1].split(/\s+/)
        classes.forEach(cls => {
          if (this.results.classUsage.has(cls)) {
            if (!this.results.classUsage.get(cls).includes(file)) {
              this.results.classUsage.get(cls).push(file)
            }
          } else {
            this.results.classUsage.set(cls, [file])
          }
        })
      }

      // Find classList usage
      const classListRegex = /\.classList\.(add|remove|toggle|contains)\s*\(\s*["']([^"']*?)["']/g
      while ((match = classListRegex.exec(content)) !== null) {
        const cls = match[2]
        if (this.results.classUsage.has(cls)) {
          if (!this.results.classUsage.get(cls).includes(file)) {
            this.results.classUsage.get(cls).push(file)
          }
        } else {
          this.results.classUsage.set(cls, [file])
        }
      }

      // Find querySelector usage
      const queryRegex = /querySelector(All)?\s*\(\s*["']\.([^"']*?)["']/g
      while ((match = queryRegex.exec(content)) !== null) {
        const cls = match[2]
        if (this.results.classUsage.has(cls)) {
          if (!this.results.classUsage.get(cls).includes(file)) {
            this.results.classUsage.get(cls).push(file)
          }
        } else {
          this.results.classUsage.set(cls, [file])
        }
      }
    }
  }

  generateReport() {
    console.log('\n📊 CSS Analysis Report')
    console.log('═'.repeat(50))

    console.log(`\n📈 Summary:`)
    console.log(`   Total files analyzed: ${this.results.totalFiles}`)
    console.log(`   Total unique classes: ${this.results.classUsage.size}`)
    console.log(`   Total !important declarations: ${this.results.importantDeclarations}`)
    console.log(`   Files with styles: ${this.results.filesWithStyles.size}`)

    // Find duplicate classes
    console.log(`\n🔍 Duplicate Classes (used in multiple files):`)
    const duplicates = Array.from(this.results.classUsage.entries())
      .filter(([_, files]) => files.length > 1)
      .sort((a, b) => b[1].length - a[1].length)

    if (duplicates.length > 0) {
      console.log(`   Found ${duplicates.length} potentially conflicting classes:`)
      duplicates.slice(0, 10).forEach(([className, files]) => {
        console.log(`   • ${className}: used in ${files.length} files`)
        files.forEach(file => {
          console.log(`     - ${file}`)
        })
        console.log()
      })
    } else {
      console.log('   No duplicate classes found')
    }

    // Show !important locations
    if (this.results.importantLocations.length > 0) {
      console.log(`\n⚠️  !important Declarations (${this.results.importantDeclarations} total):`)
      console.log('   Top 10 locations:')
      this.results.importantLocations.slice(0, 10).forEach(loc => {
        console.log(`   • ${loc.file}:${loc.line}`)
        console.log(`     ${loc.content}`)
      })
    }

    // Find classes that need migration
    console.log(`\n🎯 Classes requiring migration (no ti- prefix):`)
    const classesToMigrate = Array.from(this.results.classUsage.keys())
      .filter(cls => !cls.startsWith('ti-') && !cls.startsWith('ti-u-') && !cls.includes('['))
      .sort()

    console.log(`   Found ${classesToMigrate.length} classes to migrate:`)

    // Group by category
    const categories = {
      utility: [],
      component: [],
      layout: [],
      state: [],
      other: []
    }

    classesToMigrate.forEach(cls => {
      if (cls.includes('flex') || cls.includes('grid') || cls.includes('display')) {
        categories.utility.push(cls)
      } else if (cls.includes('btn') || cls.includes('input') || cls.includes('modal')) {
        categories.component.push(cls)
      } else if (cls.includes('container') || cls.includes('wrapper') || cls.includes('layout')) {
        categories.layout.push(cls)
      } else if (cls.includes('active') || cls.includes('disabled') || cls.includes('hover')) {
        categories.state.push(cls)
      } else {
        categories.other.push(cls)
      }
    })

    Object.entries(categories).forEach(([category, classes]) => {
      if (classes.length > 0) {
        console.log(`\n   ${category.toUpperCase()} (${classes.length}):`)
        classes.slice(0, 20).forEach(cls => console.log(`     - ${cls}`))
        if (classes.length > 20) {
          console.log(`     ... and ${classes.length - 20} more`)
        }
      }
    })

    // Generate recommendations
    console.log(`\n💡 Recommendations:`)
    console.log('   1. Start with utility classes (least impact)')
    console.log('   2. Focus on high-usage classes first')
    console.log('   3. Create automated migration scripts')
    console.log('   4. Set up CSS linting to enforce new naming convention')
    console.log('   5. Test thoroughly after each migration batch')

    // Save detailed report
    const reportPath = path.join(rootDir, 'css-analysis-report.json')
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: {
        totalFiles: this.results.totalFiles,
        totalClasses: this.results.classUsage.size,
        importantDeclarations: this.results.importantDeclarations,
        filesWithStyles: Array.from(this.results.filesWithStyles)
      },
      duplicates: duplicates,
      importantLocations: this.results.importantLocations,
      classesToMigrate: classesToMigrate,
      detailedUsage: Object.fromEntries(this.results.classUsage)
    }, null, 2))

    console.log(`\n💾 Detailed report saved to: ${reportPath}`)
  }
}

// Run analysis
const analyzer = new CSSAnalyzer()
analyzer.analyze().catch(console.error)