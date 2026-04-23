// src/core/content-scripts/chunks/lazy-styles.js
/**
 * Lazy-loaded style definitions to prevent circular dependencies.
 */

// 1. Windows UI styles (Translation Window & Icon)
export const windowsUiStyles = import.meta.glob([
  '@/features/windows/components/**/*.scss', 
  '!**/_*.scss'
], { query: '?inline', import: 'default', eager: true });

// 2. Screen Capture UI styles (Includes the specific components in src/components/content)
export const screenCaptureUiStyles = import.meta.glob([
  '@/components/content/**/*.scss',
  '@/features/screen-capture/components/**/*.scss', 
  '!**/_*.scss'
], { query: '?inline', import: 'default', eager: true });

// 3. FAB UI styles (Desktop FAB feature)
export const fabUiStyles = import.meta.glob([
  '@/apps/content/components/desktop/**/*.scss', 
  '!**/_*.scss'
], { query: '?inline', import: 'default', eager: true });

// 4. Sheet UI styles (Mobile Sheet feature)
export const sheetUiStyles = import.meta.glob([
  '@/apps/content/components/mobile/**/*.scss', 
  '!**/_*.scss'
], { query: '?inline', import: 'default', eager: true });

// 5. Shared UI styles
export const sharedStyles = import.meta.glob([
  '@/components/shared/**/*.scss',
  '@/components/base/**/*.scss',
  '@/apps/content/components/**/*.scss',
  '@/features/**/components/**/*.scss',
  // Exclude features that handle their own style injection
  '!**/features/windows/**',
  '!**/features/screen-capture/**',
  '!**/components/content/**',
  '!**/apps/content/components/desktop/**',
  '!**/apps/content/components/mobile/**',
  '!**/_*.scss'
], { query: '?inline', import: 'default', eager: true });
