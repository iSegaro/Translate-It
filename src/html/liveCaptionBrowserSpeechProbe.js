const BROWSER_SPEECH_PROBE_ACTION = 'live-caption/offscreen/browser-speech/probe';

function resolveRecognitionConstructor(recognitionConstructor = null) {
  return recognitionConstructor
    || globalThis.SpeechRecognition
    || globalThis.webkitSpeechRecognition
    || null;
}

function getUserAgent() {
  return typeof navigator?.userAgent === 'string' ? navigator.userAgent : null;
}

function buildBaseProbeResult() {
  return {
    runtime: 'offscreen',
    hasSpeechRecognition: typeof globalThis.SpeechRecognition === 'function',
    hasWebkitSpeechRecognition: typeof globalThis.webkitSpeechRecognition === 'function',
    canConstruct: false,
    canStart: false,
    errorName: null,
    errorMessage: null,
    userAgent: getUserAgent()
  };
}

function createSpeechRecognitionStartProbe(recognition, timeoutMs = 750) {
  let settled = false;
  let timeoutId = null;

  const promise = new Promise((resolve) => {
    const cleanup = () => {
      if (timeoutId != null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const settle = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(result);
    };

    recognition.onstart = () => {
      settle({
        canStart: true,
        errorName: null,
        errorMessage: null
      });
    };

    recognition.onerror = (event) => {
      settle({
        canStart: false,
        errorName: event?.error || event?.name || 'SpeechRecognitionError',
        errorMessage: event?.message || event?.messageText || 'Speech recognition failed to start'
      });
    };

    recognition.onend = () => {
      if (!settled) {
        settle({
          canStart: false,
          errorName: 'SpeechRecognitionEnded',
          errorMessage: 'Speech recognition ended before start was observed'
        });
      }
    };

    timeoutId = setTimeout(() => {
      settle({
        canStart: false,
        errorName: 'SpeechRecognitionTimeout',
        errorMessage: 'Speech recognition start timed out'
      });
    }, timeoutMs);
  });

  return {
    promise,
    cancel: () => {
      if (timeoutId != null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      settled = true;
    }
  };
}

export async function probeBrowserSpeechRuntime({
  recognitionConstructor = null,
  timeoutMs = 750
} = {}) {
  const result = buildBaseProbeResult();
  const Recognition = resolveRecognitionConstructor(recognitionConstructor);

  if (typeof Recognition !== 'function') {
    return result;
  }

  let recognition = null;
  let startProbe = null;

  try {
    recognition = new Recognition();
    result.canConstruct = true;
  } catch (error) {
    result.errorName = error?.name || 'SpeechRecognitionConstructionError';
    result.errorMessage = error?.message || 'Speech recognition constructor failed';
    return result;
  }

  try {
    startProbe = createSpeechRecognitionStartProbe(recognition, timeoutMs);
    recognition.start();
    const startResult = await startProbe.promise;
    result.canStart = startResult.canStart;
    result.errorName = startResult.errorName;
    result.errorMessage = startResult.errorMessage;
    startProbe.cancel();
  } catch (error) {
    startProbe?.cancel?.();
    result.canStart = false;
    result.errorName = error?.name || 'SpeechRecognitionStartError';
    result.errorMessage = error?.message || 'Speech recognition start failed';
  } finally {
    try {
      if (recognition) {
        if (typeof recognition.abort === 'function') {
          recognition.abort();
        } else if (typeof recognition.stop === 'function') {
          recognition.stop();
        }
      }
    } catch {
      // Ignore probe cleanup failures.
    }
  }

  return result;
}

export async function handleBrowserSpeechProbeRequest({
  logger = console,
  recognitionConstructor = null,
  timeoutMs = 750
} = {}) {
  const result = await probeBrowserSpeechRuntime({
    recognitionConstructor,
    timeoutMs
  });

  logger.info('[Offscreen] Browser speech probe result', {
    runtime: result.runtime,
    hasSpeechRecognition: result.hasSpeechRecognition,
    hasWebkitSpeechRecognition: result.hasWebkitSpeechRecognition,
    canConstruct: result.canConstruct,
    canStart: result.canStart,
    errorName: result.errorName,
    errorMessage: result.errorMessage,
    userAgent: result.userAgent
  });

  return result;
}

export function installBrowserSpeechProbeGlobal({ logger = console, recognitionConstructor = null, timeoutMs = 750 } = {}) {
  globalThis.liveCaptionBrowserSpeechProbe = () =>
    handleBrowserSpeechProbeRequest({ logger, recognitionConstructor, timeoutMs });
  globalThis.__LIVE_CAPTION_BROWSER_SPEECH_PROBE__ = globalThis.liveCaptionBrowserSpeechProbe;
}

export {
  BROWSER_SPEECH_PROBE_ACTION
};
