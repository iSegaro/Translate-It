import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

/**
 * FeatureManager name for Live Dubbing in the content compartment.
 * Single source for the host, the bootstrap composer, and tests; the
 * manager switch and the feature config use the same literal.
 */
export const LIVE_DUBBING_FEATURE_NAME = 'liveDubbing';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'LiveDubbingFeature');

/**
 * Minimal lazy lifecycle owner for Live Dubbing.
 *
 * Activation/deactivation bookkeeping only. There is deliberately no session
 * machine here (control state lives in the Firefox content-runtime host),
 * and no browser, site, capture, media, DOM, or page-world dependencies:
 * activation is driven exclusively by explicit Background PREPARE control
 * messages routed through the host.
 */
export class LiveDubbingFeatureHandler {
  constructor(options = {}) {
    this.featureManager = options.featureManager || null;
    this.active = false;
  }

  isActive() {
    return this.active === true;
  }

  async activate() {
    if (this.active) return true;
    this.active = true;
    logger.debug('Live dubbing feature activated');
    return true;
  }

  async deactivate() {
    if (!this.active) return true;
    this.active = false;
    logger.debug('Live dubbing feature deactivated');
    return true;
  }
}
