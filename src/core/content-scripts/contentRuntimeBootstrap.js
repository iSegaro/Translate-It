// src/core/content-scripts/contentRuntimeBootstrap.js
// Generic content-runtime infrastructure bootstrap (Phase 2.5 hybrid).
//
// Single generic entry for browser-localized host registration in content
// compartments. Idempotent, fail-closed, and side-effect-free at import:
// only the Firefox branch registers anything, and only the closed Live
// Dubbing control host. No feature, business, site, capture, provider,
// media, DOM, or page-world logic lives here — this module only composes the
// per-document host with its FeatureManager-backed lifecycle seam and hands
// both to the Firefox registration.
//
// Subframe extension point: each document compartment bootstraps its own
// host instance through this same function. A future subframe entry passes
// its own document-bound `host` (and optional `featureLifecycle`); the
// top-frame default path below is unchanged.

import { FirefoxLiveDubbingContentHost } from '@/features/live-dubbing/firefox/FirefoxContentRuntimeHost.js';
import { registerFirefoxLiveDubbingContentRuntime } from '@/features/live-dubbing/firefox/registerFirefoxContentRuntime.js';
import { LIVE_DUBBING_FEATURE_NAME } from '@/features/live-dubbing/handlers/LiveDubbingFeatureHandler.js';

const FIREFOX_BROWSER_NAME = 'firefox';

// Active default-composition record. Explicit `host`/`featureLifecycle`
// overrides always take the fresh path so tests and future subframe entries
// stay isolated from the shared top-frame registration.
let activeBootstrap = null;

function readBuildBrowserName() {
  return typeof __BROWSER__ !== 'undefined' ? __BROWSER__ : undefined;
}

function resolveBrowserAPI(optionsBrowserAPI) {
  try {
    return optionsBrowserAPI
      || globalThis.browser
      || globalThis.chrome
      || null;
  } catch {
    return null;
  }
}

let featureManagerModule = null;

function getFeatureManagerInstance() {
  // Cache the module import (single-flight) but resolve the singleton fresh
  // on every use: a cached instance would orphan across manager resets while
  // the module namespace stays stable.
  if (!getFeatureManagerInstance.promise) {
    getFeatureManagerInstance.promise = import('@/core/managers/content/FeatureManager.js')
      .then(module => {
        featureManagerModule = module;
      });
  }
  return getFeatureManagerInstance.promise
    .then(() => featureManagerModule.FeatureManager.getInstance());
}

/**
 * FeatureManager-backed lifecycle seam for the content-runtime host.
 * Forwarding only: activation decisions stay inside FeatureManager, and the
 * lazy import keeps this chunk free of the manager graph until PREPARE. No
 * second active flag is kept here: `isFeatureActive` delegates every read to
 * the manager's own active set, so STATUS always reflects real manager state
 * (false until the manager module resolves). `deactivateFeature` resolves a
 * confirmed-cleanup boolean: true only when the manager reports the feature
 * inactive afterwards; a throw or a still-active feature resolves false so
 * the host barrier stays barred instead of converting settlement into
 * success.
 * `prepareRuntime` is deliberately limited to the active Live Dubbing
 * handler; it never exposes generic feature invocation through the host seam.
 */
function createFeatureManagerLifecycle() {
  return {
    requestActivation: async (featureName = LIVE_DUBBING_FEATURE_NAME) => {
      const featureManager = await getFeatureManagerInstance();
      return featureManager.requestFeatureActivation(featureName);
    },
    deactivateFeature: async (featureName = LIVE_DUBBING_FEATURE_NAME) => {
      try {
        const featureManager = await getFeatureManagerInstance();
        const deactivationSucceeded = await featureManager.deactivateFeature(featureName);
        return deactivationSucceeded === true
          && featureManager.isFeatureActive(featureName) === false;
      } catch {
        return false;
      }
    },
    prepareRuntime: async (featureName = LIVE_DUBBING_FEATURE_NAME, descriptor) => {
      if (featureName !== LIVE_DUBBING_FEATURE_NAME) return false;
      try {
        const featureManager = await getFeatureManagerInstance();
        if (typeof featureManager.prepareFeatureRuntime !== 'function') return false;
        return await featureManager.prepareFeatureRuntime(featureName, descriptor) === true;
      } catch {
        return false;
      }
    },
    isFeatureActive: (featureName = LIVE_DUBBING_FEATURE_NAME) => {
      try {
        const manager = featureManagerModule?.FeatureManager?.getInstance?.();
        return manager?.isFeatureActive?.(featureName) === true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Bootstrap the content-runtime infrastructure for this document compartment.
 * Idempotent for default composition; fail-closed for any non-Firefox build
 * target (including unknown), which resolves null without registering.
 *
 * @param {{browserName?: string, browserAPI?: object|null, host?: object|null, featureLifecycle?: object|null}} options
 *   Explicit `browserName`/`browserAPI` exist for tests and future document
 *   scopes; production callers pass nothing and use build/runtime defaults.
 * @returns {{browserName: string, host: object, unregister: () => void}|null}
 *   The active registration record, or null when this browser must not
 *   register (Chrome and unknown targets: untouched).
 */
export function bootstrapContentRuntimeInfrastructure(options = {}) {
  const browserName = options.browserName !== undefined
    ? options.browserName
    : readBuildBrowserName();
  if (browserName !== FIREFOX_BROWSER_NAME) return null;

  const browserAPI = resolveBrowserAPI(options.browserAPI);
  const bypassCache = Boolean(options.host || options.featureLifecycle);
  if (!bypassCache
    && activeBootstrap
    && activeBootstrap.browserName === browserName
    && activeBootstrap.browserAPI === browserAPI) {
    return activeBootstrap;
  }

  const featureLifecycle = options.featureLifecycle || createFeatureManagerLifecycle();
  const host = options.host
    || new FirefoxLiveDubbingContentHost({ browserAPI, featureLifecycle });
  const unregisterRegistration = registerFirefoxLiveDubbingContentRuntime({ browserAPI, host });

  const record = {
    browserName,
    browserAPI,
    host,
    unregister: () => {
      try {
        unregisterRegistration();
      } finally {
        if (activeBootstrap === record) activeBootstrap = null;
      }
    },
  };
  if (!bypassCache) activeBootstrap = record;
  return record;
}
