import { defineConfig } from 'vite'
import { createBaseConfig } from './vite.config.base.js'
import webExtension from 'vite-plugin-web-extension'
import fs from 'fs-extra'
import { resolve } from 'path'
import { generateValidatedManifest } from '../manifest-generator.js'
import pkg from '../../package.json' with { type: 'json' };

const baseConfig = createBaseConfig('firefox')

export default defineConfig({
  ...baseConfig,
  
  // Firefox-specific build definitions
  define: {
    ...baseConfig.define,
    __BROWSER__: JSON.stringify('firefox'),
    __MANIFEST_VERSION__: 3
  },
  
  build: {
    ...baseConfig.build,
    outDir: `dist/firefox/Translate-It-v${pkg.version}`,
  },
  
  plugins: [
    ...(baseConfig.plugins || []),
    
    webExtension({
      // Generate dynamic manifest for Firefox
      manifest: () => generateValidatedManifest('firefox'),
      
      // Firefox HTML config
      htmlViteConfig: {
        ...baseConfig,
        resolve: {
          ...baseConfig.resolve,
        },
        build: {
          ...baseConfig.build,
          outDir: `dist/firefox/Translate-It-v${pkg.version}`,
          modulePreload: false
        }
      },
      
      // Firefox script config
      scriptViteConfig: {
        ...baseConfig,
        build: {
          ...baseConfig.build,
          outDir: `dist/firefox/Translate-It-v${pkg.version}`,
          emptyOutDir: false,
          rollupOptions: {
            output: { format: 'es' }
          }
        }
      },
      
      // Write generated manifest.json to disk for dev mode to enable extension auto-install
      transformManifest: async (manifest) => {
        const outDir = `dist/firefox/Translate-It-v${pkg.version}`;
        await fs.ensureDir(outDir);
        await fs.ensureDir(resolve(outDir, 'html'));
        
        // Copy required assets
        const srcDir = process.cwd();
        await fs.copy(resolve(srcDir, '_locales'), resolve(outDir, '_locales'));
        await fs.copy(resolve(srcDir, 'src/assets/icons'), resolve(outDir, 'icons'));
        
        // Copy Changelog.md for About page
        const changelogSrc = resolve(srcDir, 'Changelog.md');
        const changelogDest = resolve(outDir, 'Changelog.md');
        if (await fs.pathExists(changelogSrc)) {
          await fs.copy(changelogSrc, changelogDest);
        }
        
        // Move HTML files to html/ directory and fix their paths
        const htmlFiles = [
          { file: 'popup.html', jsFile: 'popup.js', cssFile: 'popup.css' },
          { file: 'sidepanel.html', jsFile: 'sidepanel.js', cssFile: 'sidepanel.css' },
          { file: 'options.html', jsFile: 'options.js', cssFile: 'options.css' }
        ];
        
        for (const {file, jsFile, cssFile} of htmlFiles) {
          const srcFile = resolve(outDir, file);
          const destFile = resolve(outDir, 'html', file);
          
          if (await fs.pathExists(srcFile)) {
            // Read HTML content
            let htmlContent = await fs.readFile(srcFile, 'utf-8');
            
            // Fix all absolute paths to relative paths
            htmlContent = htmlContent.replace(/src="\//g, 'src="../');
            htmlContent = htmlContent.replace(/href="\//g, 'href="../');
            htmlContent = htmlContent.replace(/src='\//g, "src='../");
            htmlContent = htmlContent.replace(/href='\//g, "href='../");
            // Fix double html/ paths
            htmlContent = htmlContent.replace(/src="..\/ html\//g, 'src="../');
            htmlContent = htmlContent.replace(/href="..\/ html\//g, 'href="../');
            htmlContent = htmlContent.replace(/src='..\/ html\//g, "src='../");
            htmlContent = htmlContent.replace(/href='..\/ html\//g, "href='../");
            
            // Write corrected HTML to html/ directory
            await fs.writeFile(destFile, htmlContent);
            
            // Remove original file
            await fs.remove(srcFile);
          }
        }
        
        const file = resolve(outDir, 'manifest.json');
        await fs.writeJson(file, manifest, { spaces: 2 });
        return manifest;
      },
      // Disable automatic browser launch in dev mode to avoid connection errors
      disableAutoLaunch: true
    })
  ],
  server: {
    port: 3001,
    strictPort: true,
    hmr: {
      port: 3001,
    },
  },
})