// Shared bounded retry for content critical startup.
// Retries same core instance, reuses valid base, avoids competing document owners.

export const CONTENT_STARTUP_MAX_ATTEMPTS = 2;
export const CONTENT_STARTUP_RETRY_DELAY = 100;

function defaultSleep(delay) {
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * @param {object} core - content core with initializeCritical and baseInitialized
 * @param {object} [options]
 * @param {number} [options.maxAttempts=2]
 * @param {number} [options.retryDelay=100]
 * @param {(delay:number)=>Promise<void>} [options.sleep]
 * @returns {Promise<boolean>}
 */
export async function initializeContentCore(core, {
  maxAttempts = CONTENT_STARTUP_MAX_ATTEMPTS,
  retryDelay = CONTENT_STARTUP_RETRY_DELAY,
  sleep = defaultSleep,
} = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ok = await core.initializeCritical();
    if (ok) return true;
    if (attempt === maxAttempts) break;

    // Duplicate injection: another core owns document, do not compete.
    if (!core.baseInitialized && window.translateItContentScriptLoaded) {
      break;
    }

    await sleep(retryDelay);
  }
  return false;
}

export default initializeContentCore;
