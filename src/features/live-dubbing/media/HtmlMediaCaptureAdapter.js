import { MediaCaptureAdapter } from './MediaCaptureAdapter.js';
import { MEDIA_CAPTURE_ERRORS } from './mediaConstants.js';
import { createMediaCaptureFailure } from './mediaContracts.js';

function isObject(value) {
  return Boolean(value) && (typeof value === 'object' || typeof value === 'function');
}

function iterableToArray(value) {
  try {
    return value && typeof value[Symbol.iterator] === 'function' ? [...value] : null;
  } catch {
    throw new TypeError('invalid track collection');
  }
}

function bestEffortTracks(stream) {
  for (const methodName of ['getTracks', 'getAudioTracks']) {
    try {
      const method = stream?.[methodName];
      const tracks = typeof method === 'function' ? iterableToArray(method.call(stream)) : null;
      if (tracks) return tracks;
    } catch {
      // Try the other track getter before giving up cleanup.
    }
  }
  return [];
}

function stopTracks(tracks) {
  for (const track of new Set(tracks)) {
    try {
      track?.stop?.();
    } catch {
      // A broken track must not prevent the remaining captured tracks stopping.
    }
  }
}

function inspectStream(stream) {
  if (!isObject(stream)) {
    return { error: MEDIA_CAPTURE_ERRORS.INVALID_STREAM, tracks: [] };
  }

  let tracks = [];
  let audioTracks;
  let usesAudioTrackGetter = false;
  try {
    const getTracks = stream.getTracks;
    const getAudioTracks = stream.getAudioTracks;
    if (typeof getTracks !== 'function' && typeof getAudioTracks !== 'function') {
      return { error: MEDIA_CAPTURE_ERRORS.INVALID_STREAM, tracks };
    }

    if (typeof getTracks === 'function') {
      tracks = iterableToArray(getTracks.call(stream));
      if (!tracks) {
        let fallbackTracks = [];
        if (typeof getAudioTracks === 'function') {
          try {
            fallbackTracks = iterableToArray(getAudioTracks.call(stream)) || [];
          } catch {
            // The malformed getTracks result remains the canonical failure.
          }
        }
        return { error: MEDIA_CAPTURE_ERRORS.INVALID_STREAM, tracks: fallbackTracks };
      }
    }

    if (typeof getAudioTracks === 'function') {
      usesAudioTrackGetter = true;
      audioTracks = iterableToArray(getAudioTracks.call(stream));
      if (!audioTracks) return { error: MEDIA_CAPTURE_ERRORS.INVALID_STREAM, tracks };
    } else {
      audioTracks = tracks.filter(track => track?.kind === 'audio');
    }

    if (typeof getTracks !== 'function') tracks = audioTracks;
  } catch {
    return { error: MEDIA_CAPTURE_ERRORS.EXCEPTION, tracks: tracks.length ? tracks : bestEffortTracks(stream) };
  }

  const hasLiveAudio = audioTracks.some(track => (usesAudioTrackGetter || track?.kind === 'audio')
    && track?.readyState === 'live');
  if (!hasLiveAudio) return { error: MEDIA_CAPTURE_ERRORS.NO_AUDIO, tracks };
  return { tracks };
}

/**
 * Captures a generic HTML media element without changing page playback state.
 * The standard method is preferred; Firefox's prefixed method is used only
 * when the standard method is unavailable.
 */
export class HtmlMediaCaptureAdapter extends MediaCaptureAdapter {
  capture(mediaElement) {
    let captureMethod = null;
    try {
      if (typeof mediaElement?.captureStream === 'function') {
        captureMethod = 'captureStream';
      } else if (typeof mediaElement?.mozCaptureStream === 'function') {
        captureMethod = 'mozCaptureStream';
      }
    } catch {
      return createMediaCaptureFailure(MEDIA_CAPTURE_ERRORS.EXCEPTION);
    }

    if (!captureMethod) return createMediaCaptureFailure(MEDIA_CAPTURE_ERRORS.UNSUPPORTED);

    let stream;
    try {
      stream = mediaElement[captureMethod]();
    } catch {
      return createMediaCaptureFailure(MEDIA_CAPTURE_ERRORS.EXCEPTION);
    }

    const inspected = inspectStream(stream);
    if (inspected.error) {
      stopTracks(inspected.tracks);
      return createMediaCaptureFailure(inspected.error);
    }

    const capturedTracks = [...inspected.tracks];
    let disposed = false;
    return {
      stream,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        stopTracks(capturedTracks);
      },
    };
  }
}
