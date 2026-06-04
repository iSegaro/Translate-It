import { describe, it, expect } from 'vitest';
import { normalizeGoogleSlashDashArtifact } from './GoogleSlashDashNormalization.js';

describe('normalizeGoogleSlashDashArtifact', () => {
  it('normalizes duplicated slash-dash when the source contains /-', () => {
    expect(normalizeGoogleSlashDashArtifact('+ //-', '+ /-')).toBe('+ /-');
  });

  it('normalizes a standalone duplicated slash-dash token when the source contains /-', () => {
    expect(normalizeGoogleSlashDashArtifact('//-', '/-')).toBe('/-');
  });

  it('does not change URLs or other content when the source does not contain /-', () => {
    const translated = 'Visit https://example.com/a-b';
    expect(normalizeGoogleSlashDashArtifact(translated, 'plain text')).toBe(translated);
  });

  it('does not normalize duplicated slash text when the source does not contain /-', () => {
    const translated = 'alpha //- beta';
    expect(normalizeGoogleSlashDashArtifact(translated, 'alpha beta')).toBe(translated);
  });
});
