import fs from 'fs-extra';
import { resolve } from 'path';

/**
 * Vite plugin that ensures live-dubbing AudioWorklet assets are emitted to a stable,
 * web-accessible location for both Firefox content scripts and Chrome offscreen.
 * Source files remain single source of truth; this plugin copies them to
 * `assets/live-dubbing/` in the output directory for dev and prod builds.
 * Chrome continues to work because the runtime URL is resolved via
 * `browser.runtime.getURL` fallback, and Firefox's AudioWorklet can load the
 * stable extension URL once it is declared web_accessible.
 */
export function liveDubbingWorkletsPlugin() {
  return {
    name: 'copy-live-dubbing-worklets',
    apply: 'build',
    async writeBundle(options) {
      const outDir = options.dir;
      if (!outDir) return;
      const srcDir = process.cwd();
      const worklets = [
        'src/features/live-dubbing/offscreen/liveDubbingCapture.worklet.js',
        'src/features/live-dubbing/offscreen/liveDubbingPlayback.worklet.js',
      ];
      const destDir = resolve(outDir, 'assets/live-dubbing');
      await fs.ensureDir(destDir);
      for (const rel of worklets) {
        const srcPath = resolve(srcDir, rel);
        const fileName = rel.split('/').pop();
        const destPath = resolve(destDir, fileName);
        if (await fs.pathExists(srcPath)) {
          await fs.copy(srcPath, destPath);
        }
      }
    },
  };
}
