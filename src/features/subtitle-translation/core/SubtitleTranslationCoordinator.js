import { SubtitleParserFactory } from '../parsers/SubtitleParserFactory.js';
import { SubtitleBatchPlanner } from './SubtitleBatchPlanner.js';
import { SubtitleProviderLimitsResolver } from './SubtitleProviderLimitsResolver.js';
import { SubtitleValidationService } from './SubtitleValidationService.js';
import { SubtitleProgressTracker } from './SubtitleProgressTracker.js';
import { SubtitleContextBuilder } from './SubtitleContextBuilder.js';
import { subtitleTextProtector } from '../formatting/SubtitleTextProtector.js';
import { SUBTITLE_PROMPT_TEMPLATES } from '../prompts/subtitlePrompt.js';
import { TranslationMode } from '@/shared/config/config.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessagingBus } from '@/shared/messaging/core/MessagingBus.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessageContexts } from '@/shared/messaging/core/MessagingConstants.js';
import { unifiedTranslationService } from '@/core/services/translation/UnifiedTranslationService.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import { ErrorMatcher } from '@/shared/error-management/ErrorMatcher.js';

const logger = getScopedLogger(LOG_COMPONENTS.SUBTITLE, 'SubtitleCoordinator');

/**
 * Subtitle Translation Coordinator - Orchestrates the full subtitle translation pipeline.
 */
export class SubtitleTranslationCoordinator {
  constructor() {
    this.activeJobs = new Map();
  }

  /**
   * Starts a new subtitle translation job.
   */
  async startJob(payload) {
    const { 
      jobId, 
      content, 
      filename, 
      sourceLanguage, 
      targetLanguage, 
      providerId,
      options = {} 
    } = payload;

    logger.info(`Starting subtitle job ${jobId} for ${filename} using ${providerId}`);

    // Ensure translation engine is available (Lazy Init for Background Service Worker)
    if (!unifiedTranslationService.translationEngine) {
      unifiedTranslationService.translationEngine = unifiedTranslationService.translationEngine || globalThis.backgroundService?.translationEngine;
      unifiedTranslationService.backgroundService = unifiedTranslationService.backgroundService || globalThis.backgroundService;
    }

    try {
      // 0. Reset Provider State (Circuit Breaker) before starting a new job
      // This ensures a fresh start if the user tries again after an error
      const translationEngine = unifiedTranslationService.translationEngine;
      if (!translationEngine) throw new Error('Translation engine not initialized');

      const providerInstance = await translationEngine.getProvider(providerId);
      if (providerInstance) {
        // Clear Circuit Breaker if it's open for this provider
        if (providerInstance.rateLimitManager && typeof providerInstance.rateLimitManager.resetCircuitBreaker === 'function') {
          providerInstance.rateLimitManager.resetCircuitBreaker();
          logger.debug(`Reset circuit breaker for ${providerId}`);
        }
      }

      // 1. Parse
      const adapter = SubtitleParserFactory.getAdapter(filename);
      const { cues } = adapter.parse(content);
      
      if (cues.length === 0) throw new Error('No valid subtitle cues found in file.');

      const progressTracker = new SubtitleProgressTracker(cues.length);
      this.activeJobs.set(jobId, { cues, progressTracker, adapter, status: 'running' });

      // 2. Resolve Limits
      const limits = SubtitleProviderLimitsResolver.resolve(providerId);
      
      // 3. Plan Batches
      const batches = SubtitleBatchPlanner.plan(cues, limits);
      logger.info(`Planned ${batches.length} batches for ${cues.length} cues.`);

      // 4. Process Batches
      for (let i = 0; i < batches.length; i++) {
        // Check for cancellation
        const job = this.activeJobs.get(jobId);
        if (!job || job.status === 'cancelled') break;

        const batch = batches[i];
        const result = await this._processBatch(jobId, batch, sourceLanguage, targetLanguage, providerId, options);
        
        // Notify progress
        this._notifyProgress(jobId, result.updatedCues);

        // Fail fast on fatal errors (e.g., Invalid API Key) to prevent wasteful retries
        // while still allowing the user to download partially translated progress.
        if (result && result.isFatal) {
          logger.warn(`Stopping job ${jobId} due to fatal error. Rescuing progress...`);
          if (job.progressTracker) {
            job.progressTracker.setTerminalError(result.error || 'Fatal translation error occurred');
          }
          break;
        }
      }

      // 5. Complete (even if partial due to fatal error or cancel)
      this._notifyComplete(jobId);

    } catch (error) {
      logger.error(`Subtitle job ${jobId} failed:`, error);
      this._notifyError(jobId, error.message);
    }
  }

  /**
   * Processes a single batch of cues.
   * @private
   */
  async _processBatch(jobId, batch, sourceLanguage, targetLanguage, providerId, options) {
    const job = this.activeJobs.get(jobId);
    const tokenRegistry = new Map();

    // Build batch-level context for DeepL (dialogue continuity across batch boundaries)
    const isDeepLProvider = providerId?.toLowerCase().includes('deepl');
    const batchContext = isDeepLProvider
      ? SubtitleContextBuilder.buildBatchContext(batch, job.cues, 2)
      : null;

    // 1. Protect & Prepare Payload
    const translationItems = batch.map(cue => {
      const { text: protectedText, tokens } = subtitleTextProtector.protect(cue.text);
      tokenRegistry.set(cue.id, tokens);

      return {
        id: cue.id,
        text: protectedText,
        // Optional context for AI
        context: options.useContext ? SubtitleContextBuilder.formatContextString(
          SubtitleContextBuilder.buildContext(cue.index - 1, job.cues)
        ) : null
      };
    });

    try {
      // 2. Request Translation via Unified Service
      const job = this.activeJobs.get(jobId);
      if (!job || job.status === 'cancelled') {
        throw new Error('Job cancelled before batch request');
      }

      const message = MessageFormat.create(MessageActions.BATCH_TRANSLATE, {
        items: translationItems,
        sourceLanguage,
        targetLanguage,
        providerId,
        mode: TranslationMode.Subtitle,
        promptTemplate: SUBTITLE_PROMPT_TEMPLATES.SYSTEM,
        instruction: SUBTITLE_PROMPT_TEMPLATES.BATCH_INSTRUCTION,
        // Add batch-level context for DeepL (dialogue continuity)
        contextMetadata: batchContext ? { dialogueContext: batchContext } : null
      }, MessageContexts.TRANSLATION_SERVICE);

      // Timeout Protection (5 minutes) for the batch request
      const BATCH_TIMEOUT_MS = 300000;
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          const timeoutError = new Error(`Batch translation timed out after ${BATCH_TIMEOUT_MS}ms`);
          timeoutError.type = 'TIMEOUT';
          reject(timeoutError);
        }, BATCH_TIMEOUT_MS);
      });

      // Execute request with timeout protection
      const response = await Promise.race([
        unifiedTranslationService.handleTranslationRequest(message, { internal: true }),
        timeoutPromise
      ]);

      if (!response.success) {
        // UnifiedTranslationService returns error details inside a response.error object
        const errorInfo = response.error && typeof response.error === 'object' ? response.error : { message: response.error };
        
        const error = new Error(errorInfo.message || 'Translation failed');
        error.type = errorInfo.type || errorInfo.errorType || response.type;
        error.statusCode = errorInfo.statusCode || errorInfo.status || response.statusCode;
        error.providerName = providerId;
        throw error;
      }

      // 3. Validate & Restore
      const { validatedCues } = SubtitleValidationService.validateAndRestore(
        batch, 
        response.results, 
        tokenRegistry
      );

      // 4. Update Progress
      job.progressTracker.update(validatedCues);

      return { success: true, isFatal: false, updatedCues: validatedCues };
      
    } catch (error) {
      const isFatal = ErrorMatcher.isFatal(error);
      logger.error(`Batch processing failed for job ${jobId} (isFatal: ${isFatal}):`, error);
      
      batch.forEach(cue => { 
        cue.status = 'failed'; 
        if (Array.isArray(cue.warnings)) {
          cue.warnings.push(error.message);
        }
      });
      job.progressTracker.update(batch);

      return { 
        success: false, 
        isFatal, 
        error: error.message,
        updatedCues: batch
      };
    }
  }

  cancelJob(jobId) {
    const job = this.activeJobs.get(jobId);
    if (job) {
      job.status = 'cancelled';
      logger.info(`Subtitle job ${jobId} cancelled.`);
    }
  }

  _notifyProgress(jobId, updatedCues = []) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    MessagingBus.broadcast({
      context: MessageContexts.SUBTITLE_TRANSLATION,
      action: MessageActions.SUBTITLE_TRANSLATE_PROGRESS,
      payload: {
        jobId,
        progress: job.progressTracker.getProgress(),
        updatedCues: updatedCues.map(c => ({
          id: c.id,
          translatedText: c.translatedText,
          status: c.status
        }))
      }
    });
  }

  _notifyComplete(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    // Ensure progress reaches 100% by marking unprocessed cues as skipped
    if (job.progressTracker) {
      job.progressTracker.finalize();
    }

    // Serialize final content
    const translatedContent = job.adapter.serialize(job.cues);

    MessagingBus.broadcast({
      context: MessageContexts.SUBTITLE_TRANSLATION,
      action: MessageActions.SUBTITLE_TRANSLATE_COMPLETE,
      payload: {
        jobId,
        content: translatedContent,
        stats: job.progressTracker.getProgress()
      }
    });

    this.activeJobs.delete(jobId);
  }

  _notifyError(jobId, error) {
    MessagingBus.broadcast({
      context: MessageContexts.SUBTITLE_TRANSLATION,
      action: MessageActions.SUBTITLE_TRANSLATE_ERROR,
      payload: { jobId, error }
    });
    this.activeJobs.delete(jobId);
  }
}

export const subtitleTranslationCoordinator = new SubtitleTranslationCoordinator();
