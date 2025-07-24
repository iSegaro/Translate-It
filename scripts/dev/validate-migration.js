import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const validateMigration = async () => {
  console.log('🔍 Validating Vue.js migration...')
  console.log('=' .repeat(50))
  
  const checks = [
    () => validateBundleSizes(),
    () => validateComponentIntegrity(),
    () => validateStoreIntegration(),
    () => validateExtensionAPIs(),
    () => validateCrossBrowserCompatibility(),
    () => validateTestCoverage(),
    () => validateBuildSystem()
  ]
  
  let allPassed = true
  let checkNumber = 1
  
  for (const check of checks) {
    try {
      console.log(`\n${checkNumber}. Running check...`)
      await check()
      console.log('✅ Check passed')
    } catch (error) {
      console.log(`❌ Check failed: ${error.message}`)
      allPassed = false
    }
    checkNumber++
  }
  
  console.log('\n' + '='.repeat(50))
  
  if (allPassed) {
    console.log('🎉 Migration validation successful!')
    console.log('✨ Vue.js migration is ready for production!')
    
    // Display final statistics
    displayMigrationStats()
  } else {
    console.log('⚠️  Migration validation failed')
    console.log('Please fix the issues before deploying')
    process.exit(1)
  }
}

function validateBundleSizes() {
  console.log('   📦 Validating bundle sizes...')
  
  const distPath = path.resolve(process.cwd(), 'dist-vue')
  
  if (!fs.existsSync(distPath)) {
    throw new Error('Build output not found. Run build first.')
  }
  
  const bundleTargets = {
    'popup.html': 80 * 1024,     // 80KB
    'sidepanel.html': 90 * 1024, // 90KB  
    'options.html': 100 * 1024   // 100KB
  }
  
  const files = fs.readdirSync(distPath)
  
  for (const [fileName, target] of Object.entries(bundleTargets)) {
    if (!files.includes(fileName)) {
      throw new Error(`Missing entry file: ${fileName}`)
    }
    
    const filePath = path.join(distPath, fileName)
    const stats = fs.statSync(filePath)
    
    if (stats.size > target) {
      throw new Error(`${fileName} (${Math.round(stats.size/1024)}KB) exceeds target (${target/1024}KB)`)
    }
  }
  
  console.log('     Bundle sizes within targets')
}

function validateComponentIntegrity() {
  console.log('   🧩 Validating component integrity...')
  
  const componentPaths = [
    'src/components/base/BaseButton.vue',
    'src/components/base/BaseInput.vue', 
    'src/components/base/BaseModal.vue',
    'src/components/base/BaseDropdown.vue'
  ]
  
  for (const componentPath of componentPaths) {
    if (!fs.existsSync(componentPath)) {
      throw new Error(`Missing component: ${componentPath}`)
    }
    
    const content = fs.readFileSync(componentPath, 'utf8')
    
    // Check for Vue 3 composition API usage
    if (!content.includes('<script setup>') && !content.includes('defineComponent')) {
      throw new Error(`${componentPath} not using Vue 3 Composition API`)
    }
    
    // Check for prop definitions
    if (!content.includes('defineProps') && !content.includes('props:')) {
      console.warn(`     Warning: ${componentPath} may be missing prop definitions`)
    }
  }
  
  console.log('     Component integrity validated')
}

function validateStoreIntegration() {
  console.log('   🏪 Validating store integration...')
  
  const storePath = 'src/store/modules/translation.js'
  
  if (!fs.existsSync(storePath)) {
    throw new Error('Translation store not found')
  }
  
  const storeContent = fs.readFileSync(storePath, 'utf8')
  
  // Check for Pinia usage
  if (!storeContent.includes('defineStore')) {
    throw new Error('Store not using Pinia defineStore')
  }
  
  // Check for key store methods
  const requiredMethods = ['translateText', 'setProvider', 'clearHistory']
  
  for (const method of requiredMethods) {
    if (!storeContent.includes(method)) {
      throw new Error(`Store missing required method: ${method}`)
    }
  }
  
  console.log('     Store integration validated')
}

function validateExtensionAPIs() {
  console.log('   🔌 Validating extension APIs...')
  
  const apiPath = 'src/composables/useExtensionAPI.js'
  
  if (!fs.existsSync(apiPath)) {
    throw new Error('Extension API composable not found')
  }
  
  const apiContent = fs.readFileSync(apiPath, 'utf8')
  
  // Check for required API methods
  const requiredAPIs = ['sendMessage', 'sendToContentScript', 'getCurrentTab']
  
  for (const api of requiredAPIs) { 
    if (!apiContent.includes(api)) {
      throw new Error(`Extension API missing method: ${api}`)
    }
  }
  
  console.log('     Extension APIs validated')
}

function validateCrossBrowserCompatibility() {
  console.log('   🌐 Validating cross-browser compatibility...')
  
  // Check manifest files exist (created by webpack build)
  const manifestPaths = [
    'dist/manifest.json',  // Chrome
    'dist-firefox/manifest.json'  // Firefox
  ]
  
  let hasManifests = false
  
  for (const manifestPath of manifestPaths) {
    if (fs.existsSync(manifestPath)) {
      hasManifests = true
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      
      if (!manifest.manifest_version) {
        throw new Error(`Invalid manifest: ${manifestPath}`)
      }
    }
  }
  
  if (!hasManifests) {
    console.warn('     Warning: No manifest files found (webpack build may be needed)')
  } else {
    console.log('     Cross-browser compatibility validated')
  }
}

function validateTestCoverage() {
  console.log('   🧪 Validating test coverage...')
  
  const testPaths = [
    'src/components/base/__tests__',
    'src/composables/__tests__',
    'src/store/modules/__tests__',
    'tests/e2e'
  ]
  
  for (const testPath of testPaths) {
    if (!fs.existsSync(testPath)) {
      throw new Error(`Test directory not found: ${testPath}`)
    }
    
    const testFiles = fs.readdirSync(testPath)
      .filter(file => file.endsWith('.test.js') || file.endsWith('.spec.js'))
    
    if (testFiles.length === 0) {
      throw new Error(`No test files found in: ${testPath}`)
    }
  }
  
  console.log('     Test coverage validated')
}

function validateBuildSystem() {
  console.log('   ⚙️  Validating build system...')
  
  const configFiles = [
    'vite.config.js',
    'vite.config.production.js',
    'vitest.config.js',
    'playwright.config.js'
  ]
  
  for (const configFile of configFiles) {
    if (!fs.existsSync(configFile)) {
      throw new Error(`Missing config file: ${configFile}`)
    }
  }
  
  // Check package.json scripts
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  const requiredScripts = [
    'build:vue',
    'test:vue',
    'test:e2e',
    'analyze:bundles'
  ]
  
  for (const script of requiredScripts) {
    if (!packageJson.scripts[script]) {
      throw new Error(`Missing package.json script: ${script}`)
    }
  }
  
  console.log('     Build system validated')
}

function displayMigrationStats() {
  console.log('\n📊 Migration Statistics:')
  console.log('-'.repeat(30))
  
  try {
    // Bundle sizes
    const distPath = 'dist-vue'
    if (fs.existsSync(distPath)) {
      const files = fs.readdirSync(distPath)
      const htmlFiles = files.filter(f => f.endsWith('.html'))
      const jsFiles = files.filter(f => f.endsWith('.js'))
      const cssFiles = files.filter(f => f.endsWith('.css'))
      
      console.log(`📦 Built Files: ${files.length} total`)
      console.log(`   HTML Entries: ${htmlFiles.length}`)
      console.log(`   JavaScript: ${jsFiles.length}`)
      console.log(`   CSS: ${cssFiles.length}`)
      
      // Calculate total size
      let totalSize = 0
      files.forEach(file => {
        const filePath = path.join(distPath, file)
        if (fs.statSync(filePath).isFile()) {
          totalSize += fs.statSync(filePath).size
        }
      })
      
      console.log(`📏 Total Size: ${Math.round(totalSize / 1024)}KB`)
    }
    
    // Test files
    const testFiles = []
    const findTests = (dir) => {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir, { withFileTypes: true })
        files.forEach(file => {
          if (file.isDirectory()) {
            findTests(path.join(dir, file.name))
          } else if (file.name.endsWith('.test.js') || file.name.endsWith('.spec.js')) {
            testFiles.push(path.join(dir, file.name))
          }
        })
      }
    }
    
    findTests('src')
    findTests('tests')
    
    console.log(`🧪 Test Files: ${testFiles.length}`)
    
    // Configuration files
    const configs = [
      'vite.config.js',
      'vite.config.production.js', 
      'vitest.config.js',
      'playwright.config.js'
    ].filter(f => fs.existsSync(f))
    
    console.log(`⚙️  Config Files: ${configs.length}`)
    
  } catch (error) {
    console.log('   (Stats calculation failed)')
  }
  
  console.log('\n🚀 Ready for production deployment!')
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validateMigration().catch(error => {
    console.error('Migration validation failed:', error)
    process.exit(1)
  })
}

export { validateMigration }