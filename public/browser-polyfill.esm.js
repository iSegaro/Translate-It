// ESM wrapper around the UMD webextension-polyfill
// Loads the UMD polyfill and re-exports the global `browser` object as the default export.
import './browser-polyfill.js';
// The UMD script defines `browser` on globalThis
export default browser;
export const browserPolyfill = browser;
