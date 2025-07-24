(function () {
  'use strict';

  const injectTime = performance.now();
  (async () => {
    if ("")
      await import(
        /* @vite-ignore */
        chrome.runtime.getURL("")
      );
    await import(
      /* @vite-ignore */
      chrome.runtime.getURL("vendor/vite-client.js")
    );
    const { onExecute } = await import(
      /* @vite-ignore */
      chrome.runtime.getURL("content.bundle.js.js")
    );
    onExecute?.({ perf: { injectTime, loadTime: performance.now() - injectTime } });
  })().catch(console.error);

})();
