import { computed, onBeforeUnmount, ref, unref, watch } from 'vue';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'useLiveCaptionOverlay');
const requestFrame = typeof globalThis.requestAnimationFrame === 'function'
  ? globalThis.requestAnimationFrame.bind(globalThis)
  : (callback) => globalThis.setTimeout(callback, 16);
const cancelFrame = typeof globalThis.cancelAnimationFrame === 'function'
  ? globalThis.cancelAnimationFrame.bind(globalThis)
  : (timerId) => globalThis.clearTimeout(timerId);

function resolveTargetElement(target) {
  if (typeof target === 'function') {
    return target();
  }

  return unref(target) || null;
}

function getRectFromElement(element) {
  if (!element || typeof element.getBoundingClientRect !== 'function') {
    return null;
  }

  return element.getBoundingClientRect();
}

const LIVE_CAPTION_OVERLAY_BELOW_VIDEO_GAP = 8;
const OVERLAY_ESTIMATED_HEIGHT = 80;

/**
 * Pure placement computation for the live caption overlay.
 *
 * Strategy:
 *  1. If video is in fullscreen → overlay inside video, bottom-aligned.
 *  2. If enough space below the video → place below (current behavior).
 *  3. Otherwise → place inside video near bottom edge.
 *  4. Clamp left/width so the overlay stays within the viewport.
 *  5. Clamp top so the overlay does not overflow below the viewport.
 *
 * @param {{ top: number, left: number, width: number, height: number, bottom: number, right: number }} rect
 *   Video element bounding rect.
 * @param {{ width: number, height: number }} viewport
 *   Viewport dimensions.
 * @param {{ isFullscreen?: boolean, offsetBottom?: number, offsetHorizontal?: number }} options
 * @returns {{ top: number, left: number, width: number, position: string, transform: string }}
 */
export function computeOverlayPlacement(rect, viewport, options = {}) {
  const offsetBottom = Number.isFinite(options.offsetBottom) ? options.offsetBottom : 16;
  const offsetHorizontal = Number.isFinite(options.offsetHorizontal) ? options.offsetHorizontal : 16;
  const gap = LIVE_CAPTION_OVERLAY_BELOW_VIDEO_GAP;
  const maxWidth = Math.max(0, rect.width - offsetHorizontal * 2);

  if (options.isFullscreen) {
    return {
      position: 'fixed',
      top: Math.max(0, rect.top + rect.height - offsetBottom),
      left: Math.max(0, rect.left + offsetHorizontal),
      width: maxWidth,
      transform: 'translateY(-100%)',
      insideVideo: false
    };
  }

  const spaceBelow = viewport.height - rect.bottom;
  const overlayHeight = OVERLAY_ESTIMATED_HEIGHT;
  let top;
  let insideVideo = false;

  if (spaceBelow >= overlayHeight + gap) {
    top = rect.top + rect.height + gap;
  } else {
    top = rect.top + rect.height - overlayHeight - offsetBottom;
    insideVideo = true;
  }

  let left = Math.max(0, rect.left + offsetHorizontal);
  let width = Math.min(maxWidth, viewport.width);

  if (left + width > viewport.width) {
    left = Math.max(0, viewport.width - width);
  }

  if (left < 0) {
    left = 0;
  }

  if (top + overlayHeight > viewport.height) {
    top = Math.max(0, viewport.height - overlayHeight);
  }

  return {
    position: 'fixed',
    top,
    left,
    width,
    transform: 'none',
    insideVideo
  };
}

function buildOverlayStyle(rect, element, options = {}) {
  const doc = element?.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const fullscreenEl = doc?.fullscreenElement;
  const isFullscreen = Boolean(
    fullscreenEl &&
    (fullscreenEl === element || (typeof fullscreenEl.contains === 'function' && fullscreenEl.contains(element)))
  );

  const win = element?.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : null);
  const viewportWidth = win?.innerWidth || doc?.documentElement?.clientWidth || 0;
  const viewportHeight = win?.innerHeight || doc?.documentElement?.clientHeight || 0;

  const placement = computeOverlayPlacement(rect, { width: viewportWidth, height: viewportHeight }, {
    ...options,
    isFullscreen
  });

  const style = {
    position: placement.position,
    top: `${Math.round(placement.top)}px`,
    left: `${Math.round(placement.left)}px`,
    width: `${Math.round(placement.width)}px`,
    maxWidth: `${Math.round(placement.width)}px`,
    bottom: 'auto',
    transform: placement.transform,
    zIndex: 2147483647,
    pointerEvents: 'none'
  };

  if (placement.insideVideo) {
    style.maxHeight = `calc(100vh - ${Math.round(placement.top)}px)`;
    style.overflowY = 'auto';
    style.pointerEvents = 'auto';
  }

  return Object.freeze(style);
}

export function useLiveCaptionOverlay(target, options = {}) {
  const overlayStyle = ref(null);
  const overlayRect = ref(null);
  const isAttached = ref(false);
  const isVisible = ref(false);

  let resizeObserver = null;
  let scrollHandler = null;
  let rafId = null;

  const updateOverlayPosition = () => {
    const element = resolveTargetElement(target);
    const rect = getRectFromElement(element);

    if (!element || !element.isConnected || !rect) {
      overlayStyle.value = null;
      overlayRect.value = null;
      isVisible.value = false;
      return;
    }

    const win = element.ownerDocument?.defaultView || window;
    const viewportWidth = win.innerWidth || win.document?.documentElement?.clientWidth || 0;
    const viewportHeight = win.innerHeight || win.document?.documentElement?.clientHeight || 0;

    const isOffscreen = (
      rect.bottom <= 0 ||
      rect.top >= viewportHeight ||
      rect.right <= 0 ||
      rect.left >= viewportWidth
    );

    overlayRect.value = Object.freeze({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height
    });
    overlayStyle.value = buildOverlayStyle(rect, element, options);
    isVisible.value = !isOffscreen;
  };

  const scheduleUpdate = () => {
    if (rafId != null) {
      return;
    }

    rafId = requestFrame(() => {
      rafId = null;
      updateOverlayPosition();
    });
  };

  const cleanup = () => {
    if (rafId != null) {
      cancelFrame(rafId);
      rafId = null;
    }

    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }

    if (scrollHandler) {
      window.removeEventListener('scroll', scrollHandler, { passive: true });
      document.removeEventListener('scroll', scrollHandler, { passive: true });
      window.removeEventListener('resize', scrollHandler, { passive: true });
      scrollHandler = null;
    }

    isAttached.value = false;
    isVisible.value = false;
  };

  const attach = () => {
    cleanup();

    const element = resolveTargetElement(target);
    if (!element || !element.isConnected) {
      updateOverlayPosition();
      return;
    }

    isAttached.value = true;
    updateOverlayPosition();

    scrollHandler = () => scheduleUpdate();
    window.addEventListener('scroll', scrollHandler, { passive: true });
    document.addEventListener('scroll', scrollHandler, { passive: true });
    window.addEventListener('resize', scrollHandler, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleUpdate();
      });
      resizeObserver.observe(element);
    }

    logger.debug('Live-caption overlay attached', {
      hasResizeObserver: Boolean(resizeObserver)
    });
  };

  watch(() => {
    const el = resolveTargetElement(target);
    const vis = options.visible !== undefined
      ? (typeof options.visible === 'function' ? options.visible() : unref(options.visible))
      : true;
    return el && vis ? el : null;
  }, (el) => {
    if (el) {
      attach();
    } else {
      cleanup();
    }
  }, { immediate: true });

  onBeforeUnmount(() => {
    cleanup();
    logger.debug('Live-caption overlay cleaned up');
  });

  return {
    overlayStyle: computed(() => overlayStyle.value),
    overlayRect: computed(() => overlayRect.value),
    isAttached: computed(() => isAttached.value),
    isVisible: computed(() => isVisible.value),
    updateOverlayPosition,
    attach,
    cleanup
  };
}

export default useLiveCaptionOverlay;
