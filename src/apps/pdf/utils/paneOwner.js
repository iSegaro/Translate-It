/**
 * Pane owner enum — identifies which pane is the authoritative scroll target.
 *
 * Shared pane ownership primitive.
 * Used by Navigation routing and Transition anchor resolution.
 * Single source of truth — no duplicates in the codebase.
 */
export const PANE_OWNER = Object.freeze({
  ORIGINAL: 'original',
  TRANSLATED: 'translated',
})
