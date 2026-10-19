import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sourceFiles = [
  'src/components/shared/ProviderSelector.vue',
  'src/features/page-translation/components/PageTranslationButton.vue',
  'src/apps/subtitle/SubtitleApp.vue',
  'src/features/subtitle-translation/components/SubtitleViewer.vue',
  'src/features/subtitle-translation/components/SubtitleProgressPanel.vue',
  'src/features/subtitle-translation/components/SubtitleFileDropzone.vue',
];

describe('local icon asset contract', () => {
  it('keeps icon consumers on bundled local SVG assets and removes runtime Iconify', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const removedPackage = ['@iconify', 'vue'].join('/');
    expect(pkg.dependencies).not.toHaveProperty(removedPackage);

    for (const path of sourceFiles) {
      const source = readFileSync(path, 'utf8');
      expect(source, path).not.toContain(removedPackage);
      expect(source, path).toMatch(/@\/icons\/ui\/[^'"\n]+\.svg\?url/);
    }
  });
});
