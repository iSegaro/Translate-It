import { describe, expect, it } from 'vitest';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LiveDubbingCoordinator } from './background/LiveDubbingCoordinator.js';
import { LiveDubbingController } from './offscreen/LiveDubbingController.js';
import { GeminiLiveBootstrapService } from './background/GeminiLiveBootstrapService.js';

/**
 * Live Dubbing owns its logs under the dedicated LiveDubbing component scope,
 * never under unrelated scopes such as Background. Call sites only ever pass
 * sanitized scalar diagnostics; keys, tokens, URLs, bootstrap data, PCM,
 * stream ids, and transcripts never reach a logger (covered per call site by
 * the coordinator, controller, and bootstrap-service suites).
 */
describe('live dubbing logging scope', () => {
  it('scopes every owner default logger to LOG_COMPONENTS.LIVE_DUBBING', () => {
    const owners = [
      ['LiveDubbingCoordinator', new LiveDubbingCoordinator().log],
      ['LiveDubbingController', new LiveDubbingController().log],
      ['GeminiLiveBootstrapService', new GeminiLiveBootstrapService().log],
    ];

    for (const [name, log] of owners) {
      expect(log).toBe(getScopedLogger(LOG_COMPONENTS.LIVE_DUBBING, name));
    }
  });
});
