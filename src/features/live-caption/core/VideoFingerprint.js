import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'VideoFingerprint');

function getRootDocument(video) {
  if (!video) {
    return typeof document !== 'undefined' ? document : null;
  }

  return video.ownerDocument || (typeof document !== 'undefined' ? document : null);
}

function normalizeUrl(url, baseUrl) {
  if (!url) {
    return '';
  }

  try {
    return new URL(url, baseUrl || 'about:blank').href;
  } catch {
    return String(url).trim();
  }
}

function createStableHash(input) {
  const value = String(input ?? '');
  let hash = 0x811c9dc5;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function getElementIndexInSiblings(element) {
  const parent = element?.parentElement;
  if (!parent) {
    return 1;
  }

  const tagName = element.tagName;
  let index = 0;

  for (const child of parent.children) {
    if (child.tagName === tagName) {
      index += 1;
    }

    if (child === element) {
      break;
    }
  }

  return index || 1;
}

function getPathParent(node) {
  if (!node) {
    return null;
  }

  if (node.parentElement) {
    return node.parentElement;
  }

  const rootNode = node.getRootNode?.();
  if (rootNode && rootNode.host) {
    return rootNode.host;
  }

  return null;
}

function buildDomPath(element) {
  if (!element || !element.tagName) {
    return '';
  }

  const segments = [];
  let current = element;

  while (current && current.tagName) {
    const index = getElementIndexInSiblings(current);
    segments.push(`${current.tagName.toLowerCase()}:nth-of-type(${index})`);
    current = getPathParent(current);
  }

  return segments.reverse().join(' > ');
}

function getVideoDimensions(video) {
  return {
    videoWidth: Number(video?.videoWidth) || 0,
    videoHeight: Number(video?.videoHeight) || 0,
    clientWidth: Number(video?.clientWidth) || 0,
    clientHeight: Number(video?.clientHeight) || 0
  };
}

function getMediaAttributes(video) {
  return {
    muted: Boolean(video?.muted),
    autoplay: Boolean(video?.autoplay),
    loop: Boolean(video?.loop),
    playsInline: Boolean(video?.playsInline || video?.hasAttribute?.('playsinline')),
    controls: Boolean(video?.controls),
    preload: video?.preload ?? '',
    crossOrigin: video?.crossOrigin ?? '',
    poster: video?.poster ?? '',
    volume: Number(video?.volume ?? 1),
    readyState: Number(video?.readyState ?? 0)
  };
}

function getSourceUrls(video, baseUrl) {
  const sources = [];
  const currentSrc = normalizeUrl(video?.currentSrc, baseUrl);

  if (currentSrc) {
    sources.push(currentSrc);
  }

  if (video?.querySelectorAll) {
    for (const source of video.querySelectorAll('source')) {
      const sourceUrl = normalizeUrl(source?.src || source?.getAttribute?.('src'), baseUrl);
      if (sourceUrl) {
        sources.push(sourceUrl);
      }
    }
  }

  return Array.from(new Set(sources));
}

function buildSyntheticDescriptor(video, baseUrl, options = {}) {
  const dimensions = getVideoDimensions(video);
  const mediaAttributes = getMediaAttributes(video);
  const domPath = buildDomPath(video);
  const framePath = options.framePath ?? null;

  return {
    origin: baseUrl || 'about:blank',
    dimensions,
    mediaAttributes,
    domPath,
    framePath
  };
}

export function describeVideoFingerprint(video, options = {}) {
  if (!video) {
    return null;
  }

  const doc = getRootDocument(video);
  const baseUrl = options.baseUrl || doc?.location?.origin || 'about:blank';
  const currentSrc = normalizeUrl(video.currentSrc, baseUrl);
  const sourceUrls = getSourceUrls(video, baseUrl);

  if (currentSrc) {
    return {
      strategy: 'currentSrc',
      fingerprint: `live-caption:video:src:${currentSrc}`,
      baseUrl,
      currentSrc,
      sourceUrls: [currentSrc],
      descriptor: currentSrc,
      hash: createStableHash(currentSrc)
    };
  }

  if (sourceUrls.length > 0) {
    const descriptor = sourceUrls.join('|');
    return {
      strategy: 'sources',
      fingerprint: `live-caption:video:sources:${createStableHash(descriptor)}`,
      baseUrl,
      currentSrc: '',
      sourceUrls,
      descriptor,
      hash: createStableHash(descriptor)
    };
  }

  const syntheticDescriptor = buildSyntheticDescriptor(video, baseUrl, options);
  const descriptor = JSON.stringify(syntheticDescriptor);
  const hash = createStableHash(descriptor);

  logger.debug('Synthesized live-caption video fingerprint', {
    strategy: 'synthetic',
    baseUrl,
    domPath: syntheticDescriptor.domPath,
    dimensions: syntheticDescriptor.dimensions,
    hash
  });

  return {
    strategy: 'synthetic',
    fingerprint: `live-caption:video:synth:${hash}`,
    baseUrl,
    currentSrc: '',
    sourceUrls: [],
    descriptor,
    hash,
    metadata: syntheticDescriptor
  };
}

export function createVideoFingerprint(video, options = {}) {
  const details = describeVideoFingerprint(video, options);
  return details ? details.fingerprint : null;
}

export const VideoFingerprint = Object.freeze({
  describe: describeVideoFingerprint,
  create: createVideoFingerprint
});

export default VideoFingerprint;
