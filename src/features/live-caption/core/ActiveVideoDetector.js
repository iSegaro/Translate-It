import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'ActiveVideoDetector');

function getRootDocument(root) {
  if (!root) {
    return typeof document !== 'undefined' ? document : null;
  }

  if (root.nodeType === Node.DOCUMENT_NODE) {
    return root;
  }

  if (root.nodeType === Node.DOCUMENT_FRAGMENT_NODE && root.host) {
    return root.ownerDocument || (typeof document !== 'undefined' ? document : null);
  }

  return root.ownerDocument || (typeof document !== 'undefined' ? document : null);
}

function collectVideoElements(root) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    return [];
  }

  return Array.from(root.querySelectorAll('video'));
}

function getViewportSize(root) {
  const doc = getRootDocument(root);
  const view = doc?.defaultView || (typeof window !== 'undefined' ? window : null);

  return {
    width: Number(view?.innerWidth || doc?.documentElement?.clientWidth || 0),
    height: Number(view?.innerHeight || doc?.documentElement?.clientHeight || 0)
  };
}

function getBoundingRect(video) {
  try {
    return video.getBoundingClientRect();
  } catch {
    return {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: 0,
      height: 0
    };
  }
}

function isPlaying(video) {
  return Boolean(video && video.paused === false && video.ended === false);
}

function isVisibleInViewport(video, root) {
  const rect = getBoundingRect(video);
  const viewport = getViewportSize(root);

  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  return rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < viewport.width &&
    rect.top < viewport.height;
}

function getVisibleArea(video, root) {
  const rect = getBoundingRect(video);
  const viewport = getViewportSize(root);

  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return 0;
  }

  const visibleWidth = Math.max(0, Math.min(rect.right, viewport.width) - Math.max(rect.left, 0));
  const visibleHeight = Math.max(0, Math.min(rect.bottom, viewport.height) - Math.max(rect.top, 0));
  return visibleWidth * visibleHeight;
}

function isAudible(video) {
  if (!video) {
    return false;
  }

  if (video.muted) {
    return false;
  }

  const volume = Number(video.volume);
  return Number.isFinite(volume) ? volume > 0 : true;
}

function getLastInteractionAt(video) {
  if (!video) {
    return 0;
  }

  const datasetValue = video.dataset?.liveCaptionLastInteraction
    ?? video.dataset?.liveCaptionLastInteractionAt
    ?? video.getAttribute?.('data-live-caption-last-interaction')
    ?? video.getAttribute?.('data-live-caption-last-interaction-at')
    ?? video.__liveCaptionLastInteraction
    ?? video.__liveCaptionLastInteractionAt;

  const value = Number(datasetValue);
  return Number.isFinite(value) ? value : 0;
}

function createCandidate(video, root, domIndex) {
  const rect = getBoundingRect(video);
  const viewport = getViewportSize(root);
  const visible = isVisibleInViewport(video, root);
  const playing = isPlaying(video);
  const audible = isAudible(video);
  const visibleArea = getVisibleArea(video, root);
  const lastInteractionAt = getLastInteractionAt(video);

  return {
    element: video,
    domIndex,
    playing,
    visible,
    audible,
    visibleArea,
    lastInteractionAt,
    rect: {
      top: Number(rect?.top ?? 0),
      right: Number(rect?.right ?? 0),
      bottom: Number(rect?.bottom ?? 0),
      left: Number(rect?.left ?? 0),
      width: Number(rect?.width ?? 0),
      height: Number(rect?.height ?? 0)
    },
    viewport,
    ranking: {
      playing: playing ? 1 : 0,
      visible: visible ? 1 : 0,
      audible: audible ? 1 : 0,
      visibleArea,
      lastInteractionAt,
      domIndex
    }
  };
}

function compareCandidates(left, right) {
  if (left.playing !== right.playing) {
    return Number(right.playing) - Number(left.playing);
  }

  if (left.visible !== right.visible) {
    return Number(right.visible) - Number(left.visible);
  }

  if (left.audible !== right.audible) {
    return Number(right.audible) - Number(left.audible);
  }

  if (left.visibleArea !== right.visibleArea) {
    return right.visibleArea - left.visibleArea;
  }

  if (left.lastInteractionAt !== right.lastInteractionAt) {
    return right.lastInteractionAt - left.lastInteractionAt;
  }

  return left.domIndex - right.domIndex;
}

export function collectActiveVideoCandidates(root = typeof document !== 'undefined' ? document : null) {
  return collectVideoElements(root).map((video, index) => createCandidate(video, root, index));
}

export function rankActiveVideoCandidates(root = typeof document !== 'undefined' ? document : null) {
  return collectActiveVideoCandidates(root).sort(compareCandidates);
}

export function selectActiveVideoCandidate(root = typeof document !== 'undefined' ? document : null) {
  const candidates = rankActiveVideoCandidates(root);
  const selected = candidates[0] || null;

  if (selected) {
    logger.debug('Selected active video candidate', {
      candidateCount: candidates.length,
      domIndex: selected.domIndex,
      playing: selected.playing,
      visible: selected.visible,
      audible: selected.audible,
      visibleArea: selected.visibleArea,
      lastInteractionAt: selected.lastInteractionAt
    });
  } else {
    logger.debug('No active video candidate found', { candidateCount: 0 });
  }

  return selected ? selected.element : null;
}

export const ActiveVideoDetector = Object.freeze({
  collectCandidates: collectActiveVideoCandidates,
  rankCandidates: rankActiveVideoCandidates,
  selectVideo: selectActiveVideoCandidate
});

export default ActiveVideoDetector;
