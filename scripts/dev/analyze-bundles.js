import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const analyzeBundles = () => {
  console.log('🔍 Analyzing Vue bundles...')
  
  try {
    // Build with bundle analysis
    console.log('Building with analysis mode...')
    process.env.ANALYZE_BUNDLE = 'true'
    execSync('pnpm run build:vue', { stdio: 'inherit' })
    
    console.log('\n📊 Bundle Analysis Results:')
    console.log('='.repeat(50))
    
    // Read build statistics
    const distPath = path.resolve(process.cwd(), 'dist-vue')
    
    if (!fs.existsSync(distPath)) {
      console.error('❌ Build output not found at:', distPath)
      process.exit(1)
    }
    
    // Analyze bundle sizes
    const bundleStats = analyzeBundleSizes(distPath)
    
    // Display results
    displayBundleStats(bundleStats)
    
    // Check size targets
    checkSizeTargets(bundleStats)
    
    console.log('\n✅ Bundle analysis complete!')
    console.log('📈 Check the generated stats.html for detailed visualization')
    
  } catch (error) {
    console.error('❌ Bundle analysis failed:', error.message)
    process.exit(1)
  }
}

function analyzeBundleSizes(distPath) {
  const stats = {
    entries: {},
    chunks: {},
    assets: {},
    total: 0
  }
  
  // Read all files in dist directory
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
        const ext = path.extname(file.name)
        
        stats.total += size
        
        // Categorize files
        if (file.name.endsWith('.html')) {
          stats.entries[file.name] = { size, path: relativePath }
        } else if (ext === '.js') {
          if (file.name.includes('chunk') || file.name.includes('vendor')) {
            stats.chunks[file.name] = { size, path: relativePath }
          } else {
            stats.assets[file.name] = { size, path: relativePath, type: 'js' }
          }
        } else if (ext === '.css') {
          stats.assets[file.name] = { size, path: relativePath, type: 'css' }
        } else {
          stats.assets[file.name] = { size, path: relativePath, type: 'other' }
        }
      }
    }
  }
  
  readDirRecursive(distPath)
  return stats
}

function displayBundleStats(stats) {
  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
  
  console.log('\n📦 Entry Points:')
  Object.entries(stats.entries).forEach(([name, info]) => {
    console.log(`  ${name}: ${formatSize(info.size)}`)
  })
  
  console.log('\n🧩 JavaScript Chunks:')
  const sortedChunks = Object.entries(stats.chunks)
    .sort(([,a], [,b]) => b.size - a.size)
  
  sortedChunks.forEach(([name, info]) => {
    console.log(`  ${name}: ${formatSize(info.size)}`)
  })
  
  console.log('\n🎨 Assets:')
  const assetsByType = {}
  Object.entries(stats.assets).forEach(([name, info]) => {
    if (!assetsByType[info.type]) assetsByType[info.type] = []
    assetsByType[info.type].push([name, info])
  })
  
  Object.entries(assetsByType).forEach(([type, assets]) => {
    console.log(`  ${type.toUpperCase()}:`)
    assets
      .sort(([,a], [,b]) => b.size - a.size)
      .slice(0, 5) // Show top 5 largest assets per type
      .forEach(([name, info]) => {
        console.log(`    ${name}: ${formatSize(info.size)}`)
      })
  })
  
  console.log(`\n📏 Total Bundle Size: ${formatSize(stats.total)}`)
}

function checkSizeTargets(stats) {
  const targets = {
    'popup.html': 80 * 1024,      // 80KB
    'sidepanel.html': 90 * 1024,  // 90KB
    'options.html': 100 * 1024    // 100KB
  }
  
  console.log('\n🎯 Size Target Analysis:')
  console.log('-'.repeat(40))
  
  let allTargetsMet = true
  
  Object.entries(targets).forEach(([entry, target]) => {
    if (stats.entries[entry]) {
      const size = stats.entries[entry].size
      const status = size <= target ? '✅' : '❌'
      const percentage = ((size / target) * 100).toFixed(1)
      
      console.log(`${status} ${entry}: ${(size/1024).toFixed(2)}KB / ${target/1024}KB (${percentage}%)`)
      
      if (size > target) {
        allTargetsMet = false
        const excess = size - target
        console.log(`    ⚠️  Exceeds target by ${(excess/1024).toFixed(2)}KB`)
      }
    } else {
      console.log(`⚪ ${entry}: Not found`)
    }
  })
  
  // Check total bundle size
  const totalTarget = 300 * 1024 // 300KB total
  const totalSize = stats.total
  const totalStatus = totalSize <= totalTarget ? '✅' : '❌'
  
  console.log(`\n${totalStatus} Total Bundle: ${(totalSize/1024).toFixed(2)}KB / ${totalTarget/1024}KB`)
  
  if (allTargetsMet && totalSize <= totalTarget) {
    console.log('\n🎉 All bundle size targets met!')
  } else {
    console.log('\n⚠️  Some bundles exceed size targets')
    console.log('💡 Consider:')
    console.log('   - Code splitting for large features')
    console.log('   - Lazy loading of non-critical components')
    console.log('   - Tree shaking optimization')
    console.log('   - Asset optimization (images, fonts)')
    
    if (process.env.CI) {
      process.exit(1)
    }
  }
}

// Run analysis if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  analyzeBundles()
}

export { analyzeBundles }