#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { glob } from 'glob'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')

// Find all potential conflicting class names
const conflictingPatterns = [
  /\.active\b/g,
  /\.disabled\b/g,
  /\.selected\b/g,
  /\.focused\b/g,
  /.hover\b/g,
  /\.loading\b/g,
  /\.error\b/g,
  /\.success\b/g,
  /\.warning\b/g,
  /\.info\b/g,
  /\.btn\b/g,
  /\.button\b/g,
  /\.input\b/g,
  /\.select\b/g,
  /.checkbox\b/g,
  /.radio\b/g,
  /.modal\b/g,
  /.panel\b/g,
  /.container\b/g,
  /.wrapper\b/g,
  /.content\b/g,
  /.header\b/g,
  /.footer\b/g,
  /.nav\b/g,
  /.menu\b/g,
  /.item\b/g,
  /.list\b/g,
  /.grid\b/g,
  /.flex\b/g,
  /.block\b/g,
  /.inline\b/g,
  /.text\b/g,
  /.icon\b/g,
  /.image\b/g,
  /.card\b/g,
  /.badge\b/g,
  /.tag\b/g,
  /.alert\b/g,
  /.toast\b/g,
  /.tooltip\b/g,
  /.popover\b/g,
  /.dropdown\b/g,
  /.tabs\b/g,
  /.accordion\b/g,
  /.carousel\b/g,
  /.slider\b/g,
  /.progress\b/g,
  /.spinner\b/g,
  /.skeleton\b/g
]

async function auditGlobalClasses() {
  console.log('🔍 Auditing global CSS classes for conflicts...\n')

  const scssFiles = await glob('src/assets/styles/**/*.{scss,css}', { cwd: rootDir })
  const conflicts = new Map()

  for (const file of scssFiles) {
    const fullPath = path.join(rootDir, file)
    const content = fs.readFileSync(fullPath, 'utf8')
    const lines = content.split('\n')

    for (const pattern of conflictingPatterns) {
      let match
      while ((match = pattern.exec(content)) !== null) {
        const className = match[0].substring(1) // Remove the dot
        const lineNum = content.substring(0, match.index).split('\n').length
        const line = lines[lineNum - 1].trim()

        if (!conflicts.has(className)) {
          conflicts.set(className, [])
        }

        conflicts.get(className).push({
          file,
          line: lineNum,
          content: line,
          pattern: pattern.source
        })
      }
    }
  }

  // Report findings
  console.log('📊 Global Class Audit Report')
  console.log('═'.repeat(50))

  if (conflicts.size === 0) {
    console.log('✅ No conflicting global classes found!')
    return
  }

  console.log(`\n⚠️  Found ${conflicts.size} potentially conflicting global classes:\n`)

  // Group by severity
  const highPriority = ['active', 'disabled', 'selected', 'focused', 'loading', 'error', 'success', 'warning', 'info']
  const mediumPriority = ['btn', 'button', 'input', 'select', 'checkbox', 'radio', 'modal', 'panel']
  const lowPriority = Array.from(conflicts.keys()).filter(name =>
    !highPriority.includes(name.split('-')[0]) && !mediumPriority.includes(name.split('-')[0])
  )

  console.log('🔴 HIGH PRIORITY (Direct state conflicts):')
  highPriority.forEach(priority => {
    const matches = Array.from(conflicts.entries()).filter(([name]) => name.startsWith(priority))
    if (matches.length > 0) {
      console.log(`\n  ${priority.toUpperCase()}:`)
      matches.forEach(([name, locations]) => {
        console.log(`    • .${name}`)
        locations.slice(0, 3).forEach(loc => {
          console.log(`      - ${loc.file}:${loc.line}`)
          console.log(`        ${loc.content}`)
        })
        if (locations.length > 3) {
          console.log(`      ... and ${locations.length - 3} more`)
        }
      })
    }
  })

  console.log('\n🟡 MEDIUM PRIORITY (Component conflicts):')
  mediumPriority.forEach(priority => {
    const matches = Array.from(conflicts.entries()).filter(([name]) => name.startsWith(priority))
    if (matches.length > 0) {
      console.log(`\n  ${priority.toUpperCase()}:`)
      matches.forEach(([name, locations]) => {
        console.log(`    • .${name}`)
        locations.slice(0, 2).forEach(loc => {
          console.log(`      - ${loc.file}:${loc.line}`)
        })
      })
    }
  })

  console.log('\n🟢 LOW PRIORITY (Layout/Utility conflicts):')
  console.log(`  Found ${lowPriority.length} classes including container, wrapper, flex, etc.`)

  // Generate migration recommendations
  console.log('\n💡 Migration Recommendations:')
  console.log('1. High priority classes should be migrated first')
  console.log('2. Use ti- prefix for component-specific classes')
  console.log('3. Use ti-u- prefix for utility classes')
  console.log('4. Create explicit mapping for legacy class names')

  // Save detailed report
  const reportPath = path.join(rootDir, 'global-class-audit.json')
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      totalConflicts: conflicts.size,
      highPriority: highPriority.filter(p =>
        Array.from(conflicts.keys()).some(name => name.startsWith(p))
      ).length,
      mediumPriority: mediumPriority.filter(p =>
        Array.from(conflicts.keys()).some(name => name.startsWith(p))
      ).length,
      lowPriority: lowPriority.length
    },
    conflicts: Object.fromEntries(conflicts)
  }, null, 2))

  console.log(`\n💾 Detailed audit saved to: ${reportPath}`)
}

// Run audit
auditGlobalClasses().catch(console.error)