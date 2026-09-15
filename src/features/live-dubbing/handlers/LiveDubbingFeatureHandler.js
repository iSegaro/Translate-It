import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { HtmlMediaCaptureAdapter } from '../media/HtmlMediaCaptureAdapter.js';
import { MediaSourceResolver } from '../media/MediaSourceResolver.js';

/**
 * FeatureManager name for Live Dubbing in the content compartment.
 * Single source for the host, the bootstrap composer, and tests; the
 * manager switch and the feature config use the same literal.
 */
export const LIVE_DUBBING_FEATURE_NAME = 'liveDubbing';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'LiveDubbingFeature');

/**
 * Local runtime owner for Live Dubbing.
 *
 * The handler owns only the local controller, media-source acquisition, and
 * generation fence. Session identity and control authority remain in the
 * Firefox content-runtime host; no Background message or page session state
 * is stored here.
 */
export class LiveDubbingFeatureHandler {
  constructor(options = {}) {
    this.featureManager = options.featureManager || null;
    this.sourceResolver = options.sourceResolver || options.resolver || null;
    this.sourceResolverFactory = options.sourceResolverFactory || options.resolverFactory || null;
    this.captureAdapter = options.captureAdapter || null;
    this.captureAdapterFactory = options.captureAdapterFactory || null;
    this.controller = options.controller || null;
    this.controllerFactory = options.controllerFactory || null;
    this.canRecreateController = !options.controller || Boolean(options.controllerFactory);
    this.documentRef = options.documentRef;
    this.active = false;
    this.runtimeGeneration = 0;
    this.preparationPromise = null;
    this.pendingDescriptor = null;
    this.preparedDescriptor = null;
    this.controllerDescriptor = null;
    this.controllerPrepared = null;
    this.controllerPreparedDescriptor = null;
    this.controllerCleanupPromise = null;
    this.localSourceHandle = null;
    this.sourceDisposals = new WeakMap();
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
    ++this.runtimeGeneration;
    if (!this.active && !this.preparationPromise
      && !this.controllerDescriptor && !this.controllerPreparedDescriptor
      && !this.localSourceHandle) return true;
    this.active = false;

    const preparation = this.preparationPromise;
    if (preparation) {
      try {
        await preparation;
      } catch {
        // Preparation owns its own failure cleanup; the local state below is
        // still checked before reporting a confirmed deactivation.
      }
    }

    const cleanupSucceeded = await this._cleanupRuntime();
    if (cleanupSucceeded) {
      this.preparedDescriptor = null;
      this.pendingDescriptor = null;
      logger.debug('Live dubbing feature deactivated');
    }
    return cleanupSucceeded;
  }

  /**
   * Prepare the local runtime for one already-validated host descriptor.
   * Exact retries join or reuse the existing runtime and never recapture.
   */
  async prepareRuntime(descriptor) {
    if (!this.active || !this._isDescriptor(descriptor)) return false;
    if (this._sameDescriptor(this.preparedDescriptor, descriptor)) return true;
    if (this.preparedDescriptor) return false;
    if (this.preparationPromise) {
      return this._sameDescriptor(this.pendingDescriptor, descriptor)
        ? this.preparationPromise
        : false;
    }

    const generation = this.runtimeGeneration;
    this.pendingDescriptor = { ...descriptor };
    const preparation = this._prepareRuntime(descriptor, generation);
    this.preparationPromise = preparation;
    try {
      return await preparation;
    } finally {
      if (this.preparationPromise === preparation) {
        this.preparationPromise = null;
        this.pendingDescriptor = null;
      }
    }
  }

  async _prepareRuntime(descriptor, generation) {
    let controller = null;
    let controllerPrepared = false;
    let sourceHandle = null;
    let sourceAccepted = false;

    try {
      controller = await this._getController();
      if (!controller || !this._isCurrentGeneration(generation)) return false;

      const prepared = await controller.prepare(
        descriptor.sessionId,
        descriptor.providerId,
        descriptor.targetLanguage,
        descriptor.eventSequence,
      );
      if (prepared?.success !== true) return false;
      controllerPrepared = true;
      this.controllerPrepared = controller;
      this.controllerPreparedDescriptor = { ...descriptor };
      if (!this._isCurrentGeneration(generation)) {
        return this._rejectPreparation(controller, descriptor, sourceHandle, controllerPrepared);
      }

      const resolver = await this._getSourceResolver();
      if (!this._isCurrentGeneration(generation)) {
        return this._rejectPreparation(controller, descriptor, sourceHandle, controllerPrepared);
      }
      const resolved = await resolver?.resolve?.();
      if (resolved?.success !== true || !resolved.source || !this._isCurrentGeneration(generation)) {
        return this._rejectPreparation(controller, descriptor, sourceHandle, controllerPrepared);
      }

      const captureAdapter = await this._getCaptureAdapter();
      if (!this._isCurrentGeneration(generation)) {
        return this._rejectPreparation(controller, descriptor, sourceHandle, controllerPrepared);
      }
      const captured = await captureAdapter?.capture?.(resolved.source);
      if (!this._isSourceHandle(captured)) {
        return this._rejectPreparation(controller, descriptor, sourceHandle, controllerPrepared);
      }
      sourceHandle = captured;
      this.localSourceHandle = sourceHandle;
      if (!this._isCurrentGeneration(generation)) {
        return this._rejectPreparation(controller, descriptor, sourceHandle, controllerPrepared);
      }

      let consumed;
      try {
        consumed = await controller.consumeSource(
          descriptor.sessionId,
          descriptor.providerId,
          sourceHandle,
          descriptor.eventSequence + 1,
        );
      } catch {
        consumed = null;
      }

      sourceAccepted = consumed?.sourceAccepted === true;
      if (sourceAccepted) this.localSourceHandle = null;
      if (consumed?.success !== true || !this._isCurrentGeneration(generation)) {
        return this._rejectPreparation(
          controller,
          descriptor,
          sourceAccepted ? null : sourceHandle,
          controllerPrepared,
        );
      }

      this.localSourceHandle = null;
      this.controllerDescriptor = { ...descriptor };
      this.controllerPrepared = null;
      this.controllerPreparedDescriptor = null;
      this.preparedDescriptor = { ...descriptor };
      return true;
    } catch {
      return this._rejectPreparation(
        controller,
        descriptor,
        sourceAccepted ? null : sourceHandle,
        controllerPrepared,
      );
    }
  }

  async _rejectPreparation(controller, descriptor, sourceHandle, controllerPrepared) {
    if (sourceHandle) {
      const cleanupSucceeded = await this._disposeLocalSource(sourceHandle);
      if (this.localSourceHandle === sourceHandle && cleanupSucceeded) this.localSourceHandle = null;
    }
    if (controllerPrepared && this._isControllerPrepared(controller, descriptor)) {
      await this._disposeController(controller, descriptor);
    }
    return false;
  }

  async _cleanupRuntime() {
    const localSource = this.localSourceHandle;
    let cleanupSucceeded = true;
    if (localSource) {
      cleanupSucceeded = await this._disposeLocalSource(localSource);
      if (cleanupSucceeded && this.localSourceHandle === localSource) this.localSourceHandle = null;
    }

    const controllerDescriptor = this.controllerDescriptor || this.controllerPreparedDescriptor;
    if (controllerDescriptor) {
      const controllerCleanupSucceeded = await this._disposeController(
        this.controllerDescriptor ? this.controller : this.controllerPrepared,
        controllerDescriptor,
      );
      cleanupSucceeded = controllerCleanupSucceeded && cleanupSucceeded;
    }
    return cleanupSucceeded;
  }

  async _getSourceResolver() {
    if (this.sourceResolver) return this.sourceResolver;
    if (this.sourceResolverFactory) {
      this.sourceResolver = await this.sourceResolverFactory();
    } else {
      this.sourceResolver = new MediaSourceResolver({ documentRef: this.documentRef });
    }
    return this.sourceResolver;
  }

  async _getCaptureAdapter() {
    if (this.captureAdapter) return this.captureAdapter;
    if (this.captureAdapterFactory) {
      this.captureAdapter = await this.captureAdapterFactory();
    } else {
      this.captureAdapter = new HtmlMediaCaptureAdapter();
    }
    return this.captureAdapter;
  }

  async _getController() {
    if (this.controller) return this.controller;
    if (this.controllerFactory) {
      this.controller = await this.controllerFactory();
    } else {
      const { LiveDubbingController } = await import('../offscreen/LiveDubbingController.js');
      this.controller = new LiveDubbingController();
    }
    return this.controller;
  }

  async _disposeController(controller, descriptor) {
    if (!controller || typeof controller.dispose !== 'function') return false;
    if (!this.controllerCleanupPromise) {
      const cleanup = (async () => {
        try {
          const result = await controller.dispose(
            descriptor.sessionId,
            descriptor.providerId,
            'FEATURE_DEACTIVATED',
            descriptor.eventSequence,
          );
          return result === true
            || (result?.success === true && result.cleanupPending !== true && result.disposed !== false);
        } catch {
          return false;
        }
      })();
      this.controllerCleanupPromise = cleanup;
    }

    const cleanupSucceeded = await this.controllerCleanupPromise;
    if (cleanupSucceeded) {
      this.controllerDescriptor = null;
      this.controllerPrepared = null;
      this.controllerPreparedDescriptor = null;
      if (this.canRecreateController && this.controller === controller) this.controller = null;
    }
    this.controllerCleanupPromise = null;
    return cleanupSucceeded;
  }

  async _disposeLocalSource(sourceHandle) {
    if (!sourceHandle || typeof sourceHandle.dispose !== 'function') return false;
    let disposal = this.sourceDisposals.get(sourceHandle);
    if (!disposal) {
      disposal = Promise.resolve()
        .then(() => sourceHandle.dispose())
        .then(() => true, () => false);
      this.sourceDisposals.set(sourceHandle, disposal);
    }
    return disposal;
  }

  _isControllerPrepared(controller, descriptor) {
    return this.controllerPrepared === controller
      && this._sameDescriptor(this.controllerPreparedDescriptor, descriptor);
  }

  _isCurrentGeneration(generation) {
    return this.active && generation === this.runtimeGeneration;
  }

  _isDescriptor(descriptor) {
    return Boolean(descriptor
      && typeof descriptor === 'object'
      && typeof descriptor.sessionId === 'string'
      && typeof descriptor.providerId === 'string'
      && Number.isInteger(descriptor.eventSequence));
  }

  _sameDescriptor(left, right) {
    return this._isDescriptor(left) && this._isDescriptor(right)
      && left.sessionId === right.sessionId
      && left.providerId === right.providerId
      && left.tabId === right.tabId
      && left.frameId === right.frameId
      && left.documentId === right.documentId
      && left.targetLanguage === right.targetLanguage
      && left.eventSequence === right.eventSequence;
  }

  _isSourceHandle(value) {
    return Boolean(value
      && typeof value === 'object'
      && value.stream
      && typeof value.dispose === 'function');
  }
}
