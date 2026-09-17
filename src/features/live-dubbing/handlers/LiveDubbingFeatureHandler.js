import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { HtmlMediaCaptureAdapter } from '../media/HtmlMediaCaptureAdapter.js';
import { MediaSourceResolver } from '../media/MediaSourceResolver.js';
import { MEDIA_CAPTURE_ERRORS, MEDIA_SOURCE_ERRORS } from '../media/mediaConstants.js';
import { isMediaCaptureFailure, isMediaSourceFailure } from '../media/mediaContracts.js';

/**
 * FeatureManager name for Live Dubbing in the content compartment.
 * Single source for the host, the bootstrap composer, and tests; the
 * manager switch and the feature config use the same literal.
 */
export const LIVE_DUBBING_FEATURE_NAME = 'liveDubbing';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'LiveDubbingFeature');

const GENERIC_PREPARE_FAILURE = 'LIVE_DUBBING_RUNTIME_PREPARE_FAILED';
const SAFE_CANONICAL_PATTERN = /^[A-Z0-9_.-]{1,80}$/;
const UNSAFE_CODE_FRAGMENT = /(?:STREAM|MEDIA|PAYLOAD|CREDENTIAL|PASSWORD|SECRET|TOKEN|API_KEY)/i;
const ALLOWED_HANDLER_ERRORS = new Set([
  MEDIA_SOURCE_ERRORS.NOT_FOUND,
  MEDIA_SOURCE_ERRORS.AMBIGUOUS,
  MEDIA_CAPTURE_ERRORS.UNSUPPORTED,
  MEDIA_CAPTURE_ERRORS.EXCEPTION,
  MEDIA_CAPTURE_ERRORS.INVALID_STREAM,
  MEDIA_CAPTURE_ERRORS.NO_AUDIO,
  'LIVE_DUBBING_RUNTIME_PREPARE_FAILED',
  'LIVE_DUBBING_RUNTIME_NOT_PREPARED',
  'LIVE_DUBBING_SESSION_DISPOSED',
  'LIVE_DUBBING_SESSION_BUSY',
  'LIVE_DUBBING_SESSION_MISMATCH',
  'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
  'LIVE_DUBBING_TARGET_LANGUAGE_MISMATCH',
  'LIVE_DUBBING_PROVIDER_UNSUPPORTED',
  'LIVE_DUBBING_PROVIDER_ERROR',
  'LIVE_DUBBING_PROVIDER_SETUP_INCOMPLETE',
  'LIVE_DUBBING_PROVIDER_UNAVAILABLE',
  'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE',
  'LIVE_DUBBING_CAPTURE_FAILED',
  'LIVE_DUBBING_CAPTURE_UNAVAILABLE',
  'LIVE_DUBBING_CAPTURE_TRACK_ENDED',
  'LIVE_DUBBING_NO_LIVE_AUDIO_TRACK',
  'LIVE_DUBBING_SOURCE_HANDLE_INVALID',
  'LIVE_DUBBING_AUDIO_PIPELINES_FAILED',
  'LIVE_DUBBING_AUDIO_MODE_UNSUPPORTED',
  'LIVE_DUBBING_AUDIO_PIPELINES_UNAVAILABLE',
  'LIVE_DUBBING_PIPELINE_SETUP_CANCELLED',
  'LIVE_DUBBING_SOURCE_OWNERSHIP_CONFLICT',
  'INVALID_SESSION_ID',
  'INVALID_TARGET_LANGUAGE',
  'LIVE_DUBBING_ACTIVATION_BLOCKED',
  // PCM pipeline native failures (input / output) — closed canonical codes
  'INPUT_AUDIO_CONTEXT_CREATE_FAILED',
  'INPUT_AUDIO_WORKLET_LOAD_FAILED',
  'INPUT_AUDIO_MEDIA_STREAM_SOURCE_FAILED',
  'INPUT_AUDIO_WORKLET_NODE_FAILED',
  'INPUT_AUDIO_WORKLET_NODE_NOT_SUPPORTED',
  'INPUT_AUDIO_WORKLET_NODE_INDEX_SIZE',
  'INPUT_AUDIO_WORKLET_NODE_INVALID_STATE',
  'INPUT_AUDIO_WORKLET_NODE_OPERATION_FAILED',
  'INPUT_AUDIO_WORKLET_NODE_TYPE_ERROR',
  'INPUT_AUDIO_GRAPH_FAILED',
  'INPUT_AUDIO_CONTEXT_RESUME_FAILED',
  'OUTPUT_AUDIO_CONTEXT_CREATE_FAILED',
  'OUTPUT_AUDIO_WORKLET_LOAD_FAILED',
  'OUTPUT_AUDIO_WORKLET_NODE_FAILED',
  'OUTPUT_AUDIO_WORKLET_NODE_NOT_SUPPORTED',
  'OUTPUT_AUDIO_WORKLET_NODE_INDEX_SIZE',
  'OUTPUT_AUDIO_WORKLET_NODE_INVALID_STATE',
  'OUTPUT_AUDIO_WORKLET_NODE_OPERATION_FAILED',
  'OUTPUT_AUDIO_WORKLET_NODE_TYPE_ERROR',
  'OUTPUT_AUDIO_GRAPH_FAILED',
  'OUTPUT_AUDIO_CONTEXT_RESUME_FAILED',
]);

function isSafeCanonicalCode(code) {
  return typeof code === 'string'
    && SAFE_CANONICAL_PATTERN.test(code)
    && code.length <= 80
    && !code.includes('://')
    && !code.includes('/')
    && !UNSAFE_CODE_FRAGMENT.test(code.replace('LIVE_DUBBING_MEDIA_CAPTURE_', '').replace('LIVE_DUBBING_MEDIA_SOURCE_', ''));
}

function sanitizeHandlerError(code, fallback = GENERIC_PREPARE_FAILURE) {
  if (typeof code === 'string' && ALLOWED_HANDLER_ERRORS.has(code) && isSafeCanonicalCode(code)) {
    return code;
  }
  if (typeof code === 'string' && isSafeCanonicalCode(code) && code.startsWith('LIVE_DUBBING_')) {
    return ALLOWED_HANDLER_ERRORS.has(code) ? code : fallback;
  }
  return fallback;
}

function handlerFailure(error) {
  return { success: false, error: sanitizeHandlerError(error, GENERIC_PREPARE_FAILURE) };
}

function handlerSuccess(runtimeEventSequence) {
  return { success: true, runtimeEventSequence };
}

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
    this.runtimeEventSequence = null;
    this.runtimeMessenger = options.runtimeMessenger || null;
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
      this.runtimeEventSequence = null;
      logger.debug('Live dubbing feature deactivated');
    }
    return cleanupSucceeded;
  }

  /**
   * Prepare the local runtime for one already-validated host descriptor.
   * Exact retries join or reuse the existing runtime and never recapture.
   * Returns explicit {success:true,runtimeEventSequence} or {success:false,error:canonical}
   * while remaining boolean-compatible for legacy callers that check === true.
   */
  async prepareRuntime(descriptor) {
    if (!this.active || !this._isDescriptor(descriptor)) {
      return handlerFailure('LIVE_DUBBING_RUNTIME_NOT_PREPARED');
    }
    if (this._sameDescriptor(this.preparedDescriptor, descriptor)) {
      return handlerSuccess(this.runtimeEventSequence);
    }
    if (this.preparedDescriptor) {
      return handlerFailure('LIVE_DUBBING_SESSION_BUSY');
    }
    if (this.preparationPromise) {
      return this._sameDescriptor(this.pendingDescriptor, descriptor)
        ? this.preparationPromise
        : handlerFailure('LIVE_DUBBING_SESSION_BUSY');
    }

    const generation = this.runtimeGeneration;
    this.pendingDescriptor = { ...descriptor };
    const preparation = this._prepareRuntime(descriptor, generation);
    this.preparationPromise = preparation;
    try {
      const result = await preparation;
      // Keep boolean compatibility: legacy `=== true` checks treat explicit success as truthy via success flag.
      // We return explicit object; callers updated to handle both, but for any remaining === true checks we
      // also consider wrapping? Caller compatibility is handled in FeatureManager/bootstrap/host.
      return result;
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
    this.runtimeEventSequence = null;

    try {
      controller = await this._getController();
      if (!controller || !this._isCurrentGeneration(generation)) {
        return this._rejectPreparation(controller, descriptor, sourceHandle, controllerPrepared, 'LIVE_DUBBING_SESSION_DISPOSED');
      }

      let prepared;
      try {
        prepared = await controller.prepare(
          descriptor.sessionId,
          descriptor.providerId,
          descriptor.targetLanguage,
          descriptor.eventSequence,
        );
      } catch {
        return this._rejectPreparation(controller, descriptor, sourceHandle, controllerPrepared, GENERIC_PREPARE_FAILURE);
      }
      if (prepared?.success !== true) {
        const code = sanitizeHandlerError(prepared?.error, GENERIC_PREPARE_FAILURE);
        return this._rejectPreparation(controller, descriptor, sourceHandle, controllerPrepared, code);
      }
      controllerPrepared = true;
      this.controllerPrepared = controller;
      this.controllerPreparedDescriptor = { ...descriptor };
      if (!this._isCurrentGeneration(generation)) {
        return this._rejectPreparation(controller, descriptor, sourceHandle, controllerPrepared, 'LIVE_DUBBING_SESSION_DISPOSED');
      }

      const resolver = await this._getSourceResolver();
      if (!this._isCurrentGeneration(generation)) {
        return this._rejectPreparation(controller, descriptor, sourceHandle, controllerPrepared, 'LIVE_DUBBING_SESSION_DISPOSED');
      }
      let resolved;
      try {
        resolved = await resolver?.resolve?.();
      } catch {
        return this._rejectPreparation(controller, descriptor, sourceHandle, controllerPrepared, MEDIA_SOURCE_ERRORS.NOT_FOUND);
      }
      if (!this._isCurrentGeneration(generation)) {
        return this._rejectPreparation(controller, descriptor, sourceHandle, controllerPrepared, 'LIVE_DUBBING_SESSION_DISPOSED');
      }
      if (resolved?.success !== true || !resolved.source) {
        const mediaError = isMediaSourceFailure(resolved) ? resolved.error : MEDIA_SOURCE_ERRORS.NOT_FOUND;
        const sanitized = sanitizeHandlerError(mediaError, MEDIA_SOURCE_ERRORS.NOT_FOUND);
        return this._rejectPreparation(controller, descriptor, sourceHandle, controllerPrepared, sanitized);
      }

      const captureAdapter = await this._getCaptureAdapter();
      if (!this._isCurrentGeneration(generation)) {
        return this._rejectPreparation(controller, descriptor, sourceHandle, controllerPrepared, 'LIVE_DUBBING_SESSION_DISPOSED');
      }
      let captured;
      try {
        captured = await captureAdapter?.capture?.(resolved.source);
      } catch {
        return this._rejectPreparation(controller, descriptor, sourceHandle, controllerPrepared, MEDIA_CAPTURE_ERRORS.EXCEPTION);
      }
      // Preserve exact media-capture failure code when adapter returns a failure record.
      if (isMediaCaptureFailure(captured)) {
        return this._rejectPreparation(controller, descriptor, sourceHandle, controllerPrepared, captured.error);
      }
      if (!this._isSourceHandle(captured)) {
        // Non-handle without explicit failure: treat as generic capture failure but keep safe.
        const fallback = captured?.error && isSafeCanonicalCode(captured.error)
          ? sanitizeHandlerError(captured.error, MEDIA_CAPTURE_ERRORS.EXCEPTION)
          : MEDIA_CAPTURE_ERRORS.EXCEPTION;
        return this._rejectPreparation(controller, descriptor, sourceHandle, controllerPrepared, fallback);
      }
      sourceHandle = captured;
      this.localSourceHandle = sourceHandle;
      if (!this._isCurrentGeneration(generation)) {
        return this._rejectPreparation(controller, descriptor, sourceHandle, controllerPrepared, 'LIVE_DUBBING_SESSION_DISPOSED');
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
        const code = consumed?.success !== true
          ? sanitizeHandlerError(consumed?.error, GENERIC_PREPARE_FAILURE)
          : 'LIVE_DUBBING_SESSION_DISPOSED';
        return this._rejectPreparation(
          controller,
          descriptor,
          sourceAccepted ? null : sourceHandle,
          controllerPrepared,
          code,
        );
      }

      this.localSourceHandle = null;
      const consumedEventSequence = Number.isInteger(consumed.eventSequence)
        ? consumed.eventSequence
        : descriptor.eventSequence + 1;
      if (consumedEventSequence !== descriptor.eventSequence + 1) {
        return this._rejectPreparation(
          controller,
          descriptor,
          sourceAccepted ? null : sourceHandle,
          controllerPrepared,
          GENERIC_PREPARE_FAILURE,
        );
      }
      this.runtimeEventSequence = consumedEventSequence;
      this.controllerDescriptor = { ...descriptor };
      this.controllerPrepared = null;
      this.controllerPreparedDescriptor = null;
      this.preparedDescriptor = { ...descriptor };
      return handlerSuccess(this.runtimeEventSequence);
    } catch {
      return this._rejectPreparation(
        controller,
        descriptor,
        sourceAccepted ? null : sourceHandle,
        controllerPrepared,
        GENERIC_PREPARE_FAILURE,
      );
    }
  }

  async _rejectPreparation(controller, descriptor, sourceHandle, controllerPrepared, errorCode = GENERIC_PREPARE_FAILURE) {
    if (sourceHandle) {
      const cleanupSucceeded = await this._disposeLocalSource(sourceHandle);
      if (this.localSourceHandle === sourceHandle && cleanupSucceeded) this.localSourceHandle = null;
    }
    if (controllerPrepared && this._isControllerPrepared(controller, descriptor)) {
      await this._disposeController(controller, descriptor);
    }
    return handlerFailure(errorCode);
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
      const runtimeMessenger = this.runtimeMessenger;
      if (runtimeMessenger
        && typeof runtimeMessenger.requestBootstrap === 'function'
        && typeof runtimeMessenger.notifyTerminal === 'function') {
        this.controller = new LiveDubbingController({
          requestBootstrap: request => runtimeMessenger.requestBootstrap(
            request,
            this.controllerDescriptor || this.preparedDescriptor || this.pendingDescriptor,
          ),
          notify: notification => runtimeMessenger.notifyTerminal(
            notification,
            this.controllerDescriptor || this.preparedDescriptor || this.pendingDescriptor,
          ),
        });
      } else {
        this.controller = new LiveDubbingController();
      }
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
      this.runtimeEventSequence = null;
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

  /**
   * Return the Controller-owned sequence after PREPARE plus source consume.
   * The host uses this scalar to fence the later provider connection.
   */
  getRuntimeEventSequence() {
    return Number.isInteger(this.runtimeEventSequence) ? this.runtimeEventSequence : null;
  }

  /**
   * Connect the already prepared local runtime. This seam never activates a
   * feature, acquires a source, or selects a provider; the Controller owns
   * provider setup and resolves only after setupComplete/provider readiness.
   */
  async connectRuntime(descriptor) {
    if (!this.active || !this.controllerDescriptor || !this.controller
      || !this._sameRuntimeDescriptor(descriptor)
      || descriptor.providerId !== 'gemini'
      || descriptor.runtimeEventSequence !== this.runtimeEventSequence) {
      return {
        success: false,
        error: descriptor?.providerId !== 'gemini'
          ? 'LIVE_DUBBING_PROVIDER_UNSUPPORTED'
          : 'LIVE_DUBBING_RUNTIME_NOT_PREPARED',
        ignored: true,
        sessionId: descriptor?.sessionId || null,
        providerId: descriptor?.providerId || null,
        eventSequence: this.runtimeEventSequence ?? 0,
      };
    }
    if (!Number.isInteger(descriptor.eventSequence)
      || descriptor.eventSequence !== this.runtimeEventSequence + 1) {
      return {
        success: false,
        error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
        ignored: true,
        sessionId: descriptor.sessionId,
        providerId: descriptor.providerId,
        eventSequence: this.runtimeEventSequence,
      };
    }

    const generation = this.runtimeGeneration;
    let result;
    try {
      result = await this.controller.connectProvider(
        descriptor.sessionId,
        descriptor.providerId,
        descriptor.targetLanguage,
        descriptor.eventSequence,
      );
    } catch {
      result = { success: false, error: 'LIVE_DUBBING_PROVIDER_ERROR' };
    }
    if (!this._isCurrentGeneration(generation) || !this.controllerDescriptor) {
      return {
        success: false,
        error: 'LIVE_DUBBING_SESSION_DISPOSED',
        ignored: true,
        sessionId: descriptor.sessionId,
        providerId: descriptor.providerId,
        eventSequence: this.runtimeEventSequence ?? descriptor.eventSequence,
      };
    }
    if (result?.success !== true) {
      const sanitized = sanitizeHandlerError(result?.error, 'LIVE_DUBBING_PROVIDER_ERROR');
      return {
        success: false,
        error: sanitized,
        ignored: true,
        sessionId: descriptor.sessionId,
        providerId: descriptor.providerId,
        eventSequence: this.runtimeEventSequence ?? descriptor.eventSequence,
      };
    }
    const confirmedSequence = Number.isInteger(result.eventSequence)
      ? result.eventSequence
      : null;
    if (confirmedSequence === null
      || confirmedSequence !== descriptor.eventSequence + 1
      || (result.runtimeEventSequence !== undefined
        && result.runtimeEventSequence !== confirmedSequence)
      || result.setupComplete !== true) {
      return {
        success: false,
        error: 'LIVE_DUBBING_PROVIDER_SETUP_INCOMPLETE',
        ignored: true,
        sessionId: descriptor.sessionId,
        providerId: descriptor.providerId,
        eventSequence: this.runtimeEventSequence,
      };
    }
    this.runtimeEventSequence = confirmedSequence;
    return { ...result, runtimeEventSequence: confirmedSequence };
  }

  _sameRuntimeDescriptor(descriptor) {
    const current = this.controllerDescriptor;
    return Boolean(descriptor
      && current
      && descriptor.sessionId === current.sessionId
      && descriptor.providerId === current.providerId
      && descriptor.tabId === current.tabId
      && descriptor.frameId === current.frameId
      && descriptor.documentId === current.documentId
      && descriptor.targetLanguage === current.targetLanguage);
  }
}
