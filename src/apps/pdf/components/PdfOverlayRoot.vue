<template>
  <div
    :ref="setRoot"
    class="pdf-overlay-root"
  />
</template>

<script setup>
defineProps({
  setRoot: {
    type: Function,
    default: () => {}
  }
})
</script>

<style lang="scss" scoped>
// ── PdfOverlayRoot ────────────────────────────────────────────
//
// Single overlay layer for the PDF Viewer. All teleported overlays
// (drawer, dialog, context menu, tooltip, command palette) render
// inside this fixed-position container.
//
// Layer ordering (defined in PdfApp.scss):
//   20  status     — PdfStatusBanner
//   30  toolbar    — PdfToolbar
//   40  popup      — anchored popovers (OCR, language)
//   50  overlay    — THIS LAYER. Above toolbar, below PdfWindowsHost
//   2147483647    — PdfWindowsHost (translation window, always on top)
//
// This layer must remain above the toolbar. To avoid regressions,
// review these constraints before changing positioning or z-index.

.pdf-overlay-root {
  position: fixed;
  inset: 0;
  z-index: var(--pdf-layer-overlay);
  pointer-events: none;

  > * {
    pointer-events: auto;
  }
}
</style>
