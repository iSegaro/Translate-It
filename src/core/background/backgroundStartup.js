const MAX_STARTUP_ATTEMPTS = 2;
const STARTUP_RETRY_DELAY = 100;

/**
 * Retry transient lifecycle initialization without recreating its state owner.
 */
export async function initializeBackgroundService(backgroundService, postInitialize, {
  maxAttempts = MAX_STARTUP_ATTEMPTS,
  retryDelay = STARTUP_RETRY_DELAY,
  shouldRetry = () => true,
  sleep = (delay) => new Promise(resolve => setTimeout(resolve, delay)),
} = {}) {
  let error;
  let initialized = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await backgroundService.initialize();
      initialized = true;
      break;
    } catch (caughtError) {
      error = caughtError;
      if (attempt === maxAttempts || !shouldRetry(caughtError)) break;
      await sleep(retryDelay);
    }
  }

  if (!initialized) throw error;
  await postInitialize();
}
