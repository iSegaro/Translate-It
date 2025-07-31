import { defineConfig } from 'vite'
import { createBaseConfig } from './vite.config.base.js'
import webExtension from 'vite-plugin-web-extension'
import fs from 'fs-extra'
import { resolve } from 'path'
import { generateValidatedManifest } from '../manifest-generator.js'
import pkg from '../../package.json' with { type: 'json' };

// Plugin to copy static files and fix HTML paths for extension structure
function fixExtensionPaths() {
  const copyStaticFiles = async (outDir) => {
    // Copy offscreen files
    const publicOffscreenJs = resolve(process.cwd(), 'public/offscreen.js');
    const htmlOffscreenHtml = resolve(process.cwd(), 'html/offscreen.html');
    
    if (await fs.pathExists(publicOffscreenJs)) {
      await fs.copy(publicOffscreenJs, resolve(outDir, 'offscreen.js'));
      console.log('📄 Copied offscreen.js');
    }
    
    if (await fs.pathExists(htmlOffscreenHtml)) {
      await fs.copy(htmlOffscreenHtml, resolve(outDir, 'html/offscreen.html'));
      console.log('📄 Copied offscreen.html');
    }

    // Copy CSS files for content scripts (CRITICAL FIX)
    const stylesDir = resolve(process.cwd(), 'src/styles');
    const outStylesDir = resolve(outDir, 'src/styles');
    if (await fs.pathExists(stylesDir)) {
      await fs.ensureDir(outStylesDir);
      await fs.copy(stylesDir, outStylesDir);
      console.log('✅ Copied CSS files from src/styles/ to build directory');
    }
  };

  const fixHtmlPaths = async (outDir) => {
    const htmlDir = resolve(outDir, 'html');
    
    // Ensure html directory exists
    await fs.ensureDir(htmlDir);
    
    // Fix paths in HTML files
    const htmlFiles = ['popup.html', 'sidepanel.html', 'options.html', 'offscreen.html'];
    
    for (const htmlFile of htmlFiles) {
      const srcPath = resolve(outDir, htmlFile);
      const destPath = resolve(htmlDir, htmlFile);
      
      if (await fs.pathExists(srcPath)) {
        let content = await fs.readFile(srcPath, 'utf-8');
        
        // Fix all absolute paths to relative paths
        content = content.replace(/src="\/([^"]+)"/g, 'src="../$1"');
        content = content.replace(/href="\/([^"]+)"/g, 'href="../$1"');
        content = content.replace(/src='\/([^']+)'/g, "src='../$1'");
        content = content.replace(/href='\/([^']+)'/g, "href='../$1'");
        
        // Write to html/ directory
        await fs.writeFile(destPath, content);
        
        // Remove original
        await fs.remove(srcPath);
      }
    }
  };
  
  return {
    name: 'fix-extension-paths',
    // Production build
    writeBundle: {
      order: 'pre',
      handler: async (options) => {
        await copyStaticFiles(options.dir);
        await fixHtmlPaths(options.dir);
      }
    },
    // Development server mode  
    configureServer(server) {
      // Serve HTML files from /html/ path with correct structure
      server.middlewares.use('/html', (req, res, next) => {
        if (req.url.endsWith('.html')) {
          const filename = req.url.substring(1); // Remove leading slash
          const rootPath = resolve(process.cwd(), filename);
          
          if (fs.existsSync(rootPath)) {
            let content = fs.readFileSync(rootPath, 'utf-8');
            
            // For development server, keep original paths but ensure they work from /html/ context
            // The development server will serve assets from root, so relative paths from html/ should go up one level
            content = content.replace(/src="\/src\/app\/main\/([^"]+)"/g, 'src="/src/app/main/$1"');
            
            res.setHeader('Content-Type', 'text/html');
            res.end(content);
            return;
          }
        }
        next();
      });
      
      // Also handle direct HTML file access from root
      server.middlewares.use((req, res, next) => {
        if (req.url.match(/\/(popup|sidepanel|options)\.html$/)) {
          const filename = req.url.substring(1);
          const rootPath = resolve(process.cwd(), filename);
          
          if (fs.existsSync(rootPath)) {
            let content = fs.readFileSync(rootPath, 'utf-8');
            
            // For root-level access, paths should work as-is for development
            res.setHeader('Content-Type', 'text/html');
            res.end(content);
            return;
          }
        }
        next();
      });
    },
    // Handle hot updates in watch mode
    handleHotUpdate: {
      order: 'pre',
      handler: async (ctx) => {
        if (ctx.file.endsWith('.html')) {
          console.log('🔄 HTML file updated, fixing paths...');
          
          // Get the output directory from build options
          const outDir = resolve(process.cwd(), `dist/chrome/Translate-It-v${pkg.version}`);
          
          // Only fix paths if the output directory exists (not in pure dev mode)
          if (await fs.pathExists(outDir)) {
            await fixHtmlPaths(outDir);
          }
        }
      }
    }
  };
}

const baseConfig = createBaseConfig('chrome')

export default defineConfig({
  ...baseConfig,
  build: {
    ...baseConfig.build,
    outDir: `dist/chrome/Translate-It-v${pkg.version}`,
  },
  plugins: [
    ...(baseConfig.plugins || []),
    fixExtensionPaths(),
    webExtension({
      manifest: async () => {
          console.log('🚀 Generating Chrome manifest...');
          const manifest = generateValidatedManifest('chrome');
          manifest.background = {
            service_worker: 'src/background/index.js',
            type: 'module'
          };
          // content_scripts are already defined in manifest generator, no need to add extra ones
          console.log('✅ Chrome manifest generated and validated');
          return manifest;
        },
      htmlViteConfig: {
        ...baseConfig,
        build: {
          ...baseConfig.build,
          outDir: `dist/chrome/Translate-It-v${pkg.version}`,
          modulePreload: false
        }
      },
      scriptViteConfig: {
        ...baseConfig,
        build: {
          ...baseConfig.build,
          outDir: `dist/chrome/Translate-It-v${pkg.version}`,
          emptyOutDir: false,
          rollupOptions: {
            output: { format: 'es' }
          }
        }
      },
      transformManifest: async (manifest) => {
        const outDir = `dist/chrome/Translate-It-v${pkg.version}`;
        await fs.ensureDir(outDir);
        await fs.ensureDir(resolve(outDir, 'html'));
        
        // Copy required assets
        const srcDir = process.cwd();
        await fs.copy(resolve(srcDir, '_locales'), resolve(outDir, '_locales'));
        await fs.copy(resolve(srcDir, 'src/assets/icons'), resolve(outDir, 'icons'));
        
        // Copy CSS files for content scripts (CRITICAL FIX)
        const stylesDir = resolve(srcDir, 'src/styles');
        const outStylesDir = resolve(outDir, 'src/styles');
        if (await fs.pathExists(stylesDir)) {
          await fs.ensureDir(outStylesDir);
          await fs.copy(stylesDir, outStylesDir);
          console.log('✅ Copied CSS files from src/styles/ to build directory');
        }
        
        // Copy Changelog.md for About page
        const changelogSrc = resolve(srcDir, 'Changelog.md');
        const changelogDest = resolve(outDir, 'Changelog.md');
        if (await fs.pathExists(changelogSrc)) {
          await fs.copy(changelogSrc, changelogDest);
        }
        
        // Copy browser polyfill
        const polyfillSrc = resolve(srcDir, 'node_modules/webextension-polyfill/dist/browser-polyfill.js');
        const polyfillDest = resolve(outDir, 'browser-polyfill.js');
        if (await fs.pathExists(polyfillSrc)) {
          await fs.copy(polyfillSrc, polyfillDest);
        }
        
        // HTML files are now handled by the fixExtensionPaths plugin
        
        const file = resolve(outDir, 'manifest.json');
        await fs.writeJson(file, manifest, { spaces: 2 });
        return manifest;
      },
      disableAutoLaunch: true
    }),
  ],
  server: {
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
  },
})