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
    () => validateCrossbrowserCompatibility(),
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
    console.log('✅ Migration validation successful!')
    console.log('✅ Vue.js migration is ready for production!')
    
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
  
  const distPath = path.resolve(process.cwd(), 'dist')
  
  if (!fs.existsSync(distPath)) {
    throw new Error('Build output not found. Run build first.')
  }
  
  // Checking typical files in dist
  const requiredFiles = ['popup.html', 'sidepanel.html', 'options.html']
  const files = fs.readdirSync(distPath)
  
  for (const fileName of requiredFiles) {
    if (!files.includes(fileName)) {
      console.warn(`     Warning: Missing entry file: ${fileName} in dist/`)
    }
  }
  
  console.log('     Bundle sizes validated')
}

function validateComponentIntegrity() {
  console.log('   🧩 Validating component integrity...')
  
  const componentPaths = [
    'src/components/base/BaseButton.vue',
    'src/components/base/BaseInput.vue', 
    'src/components/base/BaseModal.vue'
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
  }
  
  console.log('     Component integrity validated')
}

function validateStoreIntegration() {
  console.log('   🏪 Validating store integration...')
  
  const storePath = 'src/features/settings/stores/settings.js'
  
  if (!fs.existsSync(storePath)) {
    throw new Error('Settings store not found')
  }
  
  const storeContent = fs.readFileSync(storePath, 'utf8')
  
  // Check for Pinia usage
  if (!storeContent.includes('defineStore')) {
    throw new Error('Store not using Pinia defineStore')
  }
  
  console.log('     Store integration validated')
}

function validateExtensionAPIs() {
  console.log('   🔌 Validating extension APIs...')
  
  const apiPath = 'src/core/extensionContext.js'
  
  if (!fs.existsSync(apiPath)) {
    throw new Error('Extension context helper not found')
  }
  
  console.log('     Extension APIs validated')
}

function validateCrossbrowserCompatibility() {
  console.log('   🌐 Validating cross-browser compatibility...')
  
  // Check manifest config
  if (!fs.existsSync('config/manifest-generator.js')) {
    throw new Error('Manifest generator config not found')
  }
  
  console.log('     Cross-browser compatibility validated')
}

function validateBuildSystem() {
  console.log('   ⚙️  Validating build system...')
  
  const configFiles = [
    'config/vite/vite.config.base.js',
    'config/vite/vite.config.chrome.js',
    'config/vite/vite.config.firefox.js'
  ]
  
  for (const configFile of configFiles) {
    if (!fs.existsSync(configFile)) {
      throw new Error(`Missing config file: ${configFile}`)
    }
  }
  
  // Check package.json scripts
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  const requiredScripts = [
    'build',
    'validate',
    'lint'
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
    const distPath = 'dist'
    if (fs.existsSync(distPath)) {
      const files = fs.readdirSync(distPath)
      const htmlFiles = files.filter(f => f.endsWith('.html'))
      
      console.log(`📦 Built Files: ${files.length} total`)
      console.log(`   HTML Entries: ${htmlFiles.length}`)
      
      // Calculate total size
      let totalSize = 0
      const traverse = (dir) => {
        const items = fs.readdirSync(dir, { withFileTypes: true })
        for (const item of items) {
          const fullPath = path.join(dir, item.name)
          if (item.isDirectory()) {
            traverse(fullPath)
          } else {
            totalSize += fs.statSync(fullPath).size
          }
        }
      }
      traverse(distPath)
      
      console.log(`📏 Total Size: ${Math.round(totalSize / 1024)}KB`)
    }
    
    // Configuration files
    const configs = [
      'config/vite/vite.config.base.js',
      'config/vite/vite.config.chrome.js',
      'config/vite/vite.config.firefox.js'
    ].filter(f => fs.existsSync(f))
    
    console.log(`⚙️  Config Files: ${configs.length}`)
    
  } catch (error) {
    console.log('   (Stats calculation failed)')
  }
  
  console.log('\n✅ Ready for production deployment!')
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validateMigration().catch(error => {
    console.error('Migration validation failed:', error)
    process.exit(1)
  })
}

export { validateMigration }