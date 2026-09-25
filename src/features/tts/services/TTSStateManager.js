import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { initializebrowserAPI } from '@/features/tts/core/useBrowserAPI.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { ttsQueueManager } from '@/features/tts/services/TTSQueueManager.js';
import { offscreenRuntimeLeaseManager } from '@/shared/runtime/OffscreenRuntimeLeaseManager.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'TTSStateManager');

export class TTSStateManager {
  constructor() {
    this.currentTTSSender = null;
    this.currentTTSId = null;
    this.currentTTSRequest = null;
    this.pendingRequestKey = null;
    this.lastTTSText = null;
    this.lastTTSLanguage = null;
    this.currentPlaybackToken = null;
    this.predecessorPlaybackToken = null;
    this.pendingPlaybackToken = null;
    this.pendingPlaybackMetadata = null;
    this.playbackRevision = 0;

    // Centralized audio reference for Firefox direct playback
    this.activeFirefoxAudio = null;
    this.activeFirefoxAudioUrl = null;
    this.firefoxAudioGeneration = 0;
  }

  /**
   * Play audio directly in Firefox.
   * Event callbacks are bound to one audio generation and element identity.
   */
  async playFirefoxAudio(audioBlobOrUrl, metadata = {}) {
    this.stopFirefoxAudio();
    this.currentTTSSender = metadata.sender || null;
    this.currentTTSId = metadata.ttsId || null;
    this.lastTTSLanguage = metadata.language || null;
    this.lastTTSText = metadata.text || null;
    const generation = this.firefoxAudioGeneration;

    return new Promise((resolve, reject) => {
      try {
        const url = typeof audioBlobOrUrl === 'string'
          ? audioBlobOrUrl
          : URL.createObjectURL(audioBlobOrUrl);

        this.activeFirefoxAudioUrl = url;
        const audio = new Audio(url);
        this.activeFirefoxAudio = audio;

        const isCurrentAudio = () =>
          this.activeFirefoxAudio === audio && this.firefoxAudioGeneration === generation;

        audio.onended = () => {
          if (!isCurrentAudio()) return;
          this.cleanupFirefoxAudio(audio, generation);
          this.notifyTTSEnded('completed');
        };

        audio.onerror = (e) => {
          if (isCurrentAudio()) {
            this.cleanupFirefoxAudio(audio, generation);
          }
          reject(e);
        };

        audio.play()
          .then(() => resolve())
          .catch((err) => {
            if (isCurrentAudio()) {
              this.cleanupFirefoxAudio(audio, generation);
            }
            reject(err);
          });
      } catch (error) {
        if (this.activeFirefoxAudio && this.firefoxAudioGeneration === generation) {
          this.cleanupFirefoxAudio(this.activeFirefoxAudio, generation);
        }
        reject(error);
      }
    });
  }

  /**
   * Stop any active Firefox audio
   */
  stopFirefoxAudio() {
    this.firefoxAudioGeneration++;
    if (this.activeFirefoxAudio) {
      try {
        this.activeFirefoxAudio.pause();
        this.activeFirefoxAudio.src = '';
      } catch (e) {
        logger.debug('Error stopping Firefox audio:', e.message);
      }
    }
    this.cleanupFirefoxAudio();
  }

  /**
   * Internal cleanup for Firefox audio resources when callback still owns it.
   */
  cleanupFirefoxAudio(audio = this.activeFirefoxAudio, generation = this.firefoxAudioGeneration) {
    if (audio !== this.activeFirefoxAudio || generation !== this.firefoxAudioGeneration) {
      return false;
    }

    if (this.activeFirefoxAudioUrl && this.activeFirefoxAudioUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(this.activeFirefoxAudioUrl);
      } catch { /* ignore */ }
    }
    this.activeFirefoxAudio = null;
    this.activeFirefoxAudioUrl = null;
    return true;
  }

  /**
   * Clear pending request state without touching committed playback metadata.
   */
  resetSpeakState() {
    this.currentTTSRequest = null;
    this.pendingRequestKey = null;
  }

  /**
   * Build identity for one request still resolving before playback commit.
   * Active playback metadata remains separate and is changed only on commit.
   */
  createPendingRequestKey({ engine, text, language, ttsId = null } = {}) {
    return Object.freeze({
      engine,
      text,
      language,
      ...(ttsId === null || ttsId === undefined ? {} : { ttsId })
    });
  }

  isPendingRequest(key, request) {
    if (!key || !this.pendingRequestKey || !this.currentTTSRequest) return false;

    const sameKey = ['engine', 'text', 'language', 'ttsId'].every((field) => (
      (this.pendingRequestKey[field] ?? null) === (key[field] ?? null)
    ));

    return sameKey && (request === undefined || request === this.currentTTSRequest);
  }

  getPendingRequest(key) {
    return this.isPendingRequest(key) ? this.currentTTSRequest : null;
  }

  setPendingRequest(key, request) {
    this.pendingRequestKey = Object.freeze({ ...key });
    this.currentTTSRequest = request;
  }

  clearPendingRequest(key, request) {
    if (!this.isPendingRequest(key, request)) return false;

    this.pendingRequestKey = null;
    this.currentTTSRequest = null;
    return true;
  }

  /**
   * Check if a sender is the current owner of the active TTS session.
   * This is used for owner-aware cleanup.
   *
   * @param {Object} sender - The message sender to check
   * @param {Object} [ownerSender] - Sender snapshot to check against; defaults to current owner
   * @returns {boolean} True if the sender matches the selected owner
   */
  isCurrentOwner(sender, ownerSender = this.currentTTSSender) {
    if (!ownerSender || !sender) return false;

    // 1. Internal Context Match (Popup/Sidepanel/Options)
    // Internal contexts often don't have a tab ID, so we check the URL
    if (!sender.tab?.id && !ownerSender.tab?.id) {
      return sender.url === ownerSender.url;
    }

    // 2. Tab/Frame Match (Content Scripts / FAB)
    return sender.tab?.id === ownerSender.tab?.id &&
           sender.frameId === ownerSender.frameId;
  }

  /**
   * Complete reset of all state
   */
  fullReset() {
    this.resetSpeakState();
    this.currentTTSSender = null;
    this.currentTTSId = null;
    this.lastTTSText = null;
    this.lastTTSLanguage = null;
    this.currentPlaybackToken = null;
    this.predecessorPlaybackToken = null;
    this.pendingPlaybackToken = null;
    this.pendingPlaybackMetadata = null;
    this.playbackRevision++;
  }

  /**
   * Capture notification metadata before any asynchronous operation.
   * Sender snapshots prevent a later handoff from changing an older message.
   */
  capturePlaybackMetadata() {
    return this.createMetadataSnapshot({
      sender: this.currentTTSSender,
      ttsId: this.currentTTSId,
      detectedSourceLanguage: this.lastTTSLanguage,
      text: this.lastTTSText
    });
  }

  createMetadataSnapshot(metadata = {}) {
    const sender = metadata.sender;
    const senderSnapshot = sender
      ? Object.freeze({
          ...sender,
          ...(sender.tab ? { tab: Object.freeze({ ...sender.tab }) } : {})
        })
      : null;

    return Object.freeze({
      sender: senderSnapshot,
      ttsId: metadata.ttsId || null,
      detectedSourceLanguage: metadata.detectedSourceLanguage || metadata.language || null,
      text: metadata.text || null
    });
  }

  normalizePlaybackMetadata(metadata = {}) {
    return {
      sender: metadata.sender || null,
      ttsId: metadata.ttsId || null,
      language: metadata.language || null,
      text: metadata.text || null
    };
  }

  /**
   * Broadcast TTS status to relevant extension contexts.
   * This uses a "Targeted Broadcast" approach:
   * 1. If initiated from a tab, only that tab receives the message (all frames/Shadow DOM).
   * 2. All internal contexts (popup, sidepanel) receive the message for global sync.
   *
   * @param {string} status - The new TTS status ('idle', 'playing', 'error', etc.)
   * @param {Object} data - Additional data to include in the broadcast
   * @param {string} [data.action] - Optional action override (defaults to GOOGLE_TTS_ENDED)
   * @param {Object|null} [metadata] - Immutable sender and playback metadata snapshot
   */
  async broadcastStatus(status, data = {}, metadata = null) {
    try {
      const snapshot = metadata || this.capturePlaybackMetadata();
      const browserAPI = await initializebrowserAPI();
      const message = {
        action: data.action || MessageActions.GOOGLE_TTS_ENDED, // Allow custom action override
        source: 'background',
        status: status, // 'completed', 'error', 'stopped', 'interrupted'
        ttsId: snapshot.ttsId,
        detectedSourceLanguage: snapshot.detectedSourceLanguage,
        ...data
      };

      // 1. Targeted Tab Broadcast: Only send to the originating tab
      // This ensures all frames and Shadow DOM in THAT tab are updated.
      if (snapshot.sender?.tab?.id) {
        try {
          // Sending to tabId without frameId ensures ALL frames in that tab receive it
          await browserAPI.tabs.sendMessage(snapshot.sender.tab.id, message);
          logger.debug(`Targeted broadcast sent to tab: ${snapshot.sender.tab.id}`);
        } catch (err) {
          logger.debug('Targeted tab broadcast failed (tab might be closed):', err.message);
        }
      }

      // 2. Internal Context Broadcast: Always notify popup and sidepanel
      // This is efficient and keeps extension-wide UI in sync.
      await browserAPI.runtime.sendMessage(message).catch(() => {});

      logger.debug(`Broadcasted TTS status: ${status} for ID: ${snapshot.ttsId}`);
    } catch (err) {
      logger.debug('Broadcast failed:', err.message);
    }
  }

  /**
   * Notify the requester that TTS has ended
   * @param {string} reason - Completion reason
   * @param {Object|null} errorData - Additional error details
   * @param {string|null} playbackToken - Optional playback generation token
   */
  async notifyTTSEnded(reason = 'completed', errorData = null, playbackToken = null) {
    if (typeof errorData === 'string' && playbackToken === null) {
      playbackToken = errorData;
      errorData = null;
    }

    const hasPlaybackToken = playbackToken !== null && playbackToken !== undefined;
    const generationToken = hasPlaybackToken ? playbackToken : this.currentPlaybackToken;
    const notificationRevision = this.playbackRevision;
    const metadata = this.capturePlaybackMetadata();
    const hasPendingSuccessor = this.pendingPlaybackToken && this.pendingPlaybackToken !== playbackToken;
    if (hasPlaybackToken && (playbackToken !== this.currentPlaybackToken || hasPendingSuccessor)) {
      if (this.pendingPlaybackToken === playbackToken) {
        await this.failPlaybackHandoff(playbackToken, errorData || {
          error: `Playback ended before handoff commit (${reason})`
        });
        return;
      }
      await this.releaseOffscreenLease(playbackToken);
      return;
    }

    // CRITICAL: Check with QueueManager first. If there are more chunks,
    // it will handle the next playback and we DON'T notify the UI yet.
    if (reason === 'completed' && ttsQueueManager.chunks.length > 0 && ttsQueueManager.currentIndex < ttsQueueManager.chunks.length - 1) {
      await ttsQueueManager.onChunkEnded('completed');
      await this.releaseOffscreenLease(generationToken);
      return;
    }

    const status = reason === 'error' ? 'error' : 'idle';

    // Always broadcast status for independent UI updates
    await this.broadcastStatus(status, {
      reason,
      playbackToken: generationToken,
      ...(errorData || {})
    }, metadata);

    try {
      if (this.playbackRevision === notificationRevision && metadata.sender) {
        const browserAPI = await initializebrowserAPI();
        const message = {
          action: MessageActions.GOOGLE_TTS_ENDED,
          source: 'background',
          reason: reason,
          status: status,
          ttsId: metadata.ttsId,
          detectedSourceLanguage: metadata.detectedSourceLanguage,
          playbackToken: generationToken,
          ...(errorData || {})
        };

        if (metadata.sender?.tab?.id) {
          // Send to the specific tab and frame that requested it
          const options = {};
          if (metadata.sender.frameId !== undefined) {
            options.frameId = metadata.sender.frameId;
          }

          await browserAPI.tabs.sendMessage(metadata.sender.tab.id, message, options);
        } else {
          await browserAPI.runtime.sendMessage({
            ...message,
            targetContext: 'popup-sidepanel'
          }).catch(() => {});
        }
        logger.debug(`Notified sender of TTS ${reason}`);
      }
    } catch (err) {
      logger.debug(`Could not notify sender (${reason}):`, err.message);
    } finally {
      if (reason !== 'interrupted') {
        const wasCurrent = this.currentPlaybackToken === generationToken;
        await this.releaseOffscreenLease(generationToken);
        if (wasCurrent && this.currentPlaybackToken === null && !this.pendingPlaybackToken) {
          this.currentTTSSender = null;
          this.currentTTSId = null;
        }
      }
    }
  }

  /**
   * Broadcast one terminal transition using already-captured metadata.
   * Used after stop/failure clears mutable playback state.
   */
  async notifyCapturedEnded(reason, errorData, playbackToken, metadata) {
    const status = reason === 'error' ? 'error' : 'idle';
    await this.broadcastStatus(status, {
      reason,
      playbackToken,
      ...(errorData || {})
    }, metadata);

    if (!metadata.sender) return;

    try {
      const browserAPI = await initializebrowserAPI();
      const message = {
        action: MessageActions.GOOGLE_TTS_ENDED,
        source: 'background',
        reason,
        status,
        ttsId: metadata.ttsId,
        detectedSourceLanguage: metadata.detectedSourceLanguage,
        playbackToken,
        ...(errorData || {})
      };

      if (metadata.sender.tab?.id) {
        const options = {};
        if (metadata.sender.frameId !== undefined) {
          options.frameId = metadata.sender.frameId;
        }
        await browserAPI.tabs.sendMessage(metadata.sender.tab.id, message, options);
      } else {
        await browserAPI.runtime.sendMessage({
          ...message,
          targetContext: 'popup-sidepanel'
        }).catch(() => {});
      }
    } catch (error) {
      logger.debug(`Could not notify sender (${reason}):`, error.message);
    }
  }

  /**
   * Notify one request about a pre-playback failure without touching playback ownership.
   *
   * @param {Object} request - Request-scoped notification data
   * @param {Object|null} request.sender - Request sender
   * @param {string|null} request.ttsId - Request identity
   * @param {string|null} request.language - Resolved or detected language
   * @param {string|null} request.text - Request text
   * @param {Error|Object|string} request.error - Failure details
   */
  async notifyTTSRequestError({ sender, ttsId, language, text, error } = {}) {
    try {
      const metadata = this.createMetadataSnapshot({ sender, ttsId, language, text });
      const errorData = {
        error: typeof error === 'string'
          ? error
          : error?.message || error?.error || 'TTS failed',
        ...(error?.errorType ? { errorType: error.errorType } : {})
      };
      const statusData = { reason: 'error', ...errorData };

      await this.broadcastStatus('error', statusData, metadata);
      if (!metadata.sender) return;

      const browserAPI = await initializebrowserAPI();
      const message = {
        action: MessageActions.GOOGLE_TTS_ENDED,
        source: 'background',
        reason: 'error',
        status: 'error',
        ttsId: metadata.ttsId,
        detectedSourceLanguage: metadata.detectedSourceLanguage,
        ...errorData
      };

      if (metadata.sender.tab?.id) {
        const options = {};
        if (metadata.sender.frameId !== undefined) {
          options.frameId = metadata.sender.frameId;
        }
        await browserAPI.tabs.sendMessage(metadata.sender.tab.id, message, options);
      } else {
        await browserAPI.runtime.sendMessage({
          ...message,
          targetContext: 'popup-sidepanel'
        }).catch(() => {});
      }
    } catch (notificationError) {
      logger.debug('Could not notify request-scoped TTS error:', notificationError?.message);
    }
  }

  /**
   * Start a Chromium playback generation and acquire its shared runtime lease.
   *
   * @returns {Promise<string>} Opaque token for this playback generation
   */
  async acquirePlaybackLease(metadata = {}) {
    const playbackToken = crypto.randomUUID();
    const previousPlaybackToken = this.currentPlaybackToken;
    this.pendingPlaybackToken = playbackToken;
    this.predecessorPlaybackToken = previousPlaybackToken;
    this.pendingPlaybackMetadata = this.normalizePlaybackMetadata(metadata);

    try {
      const acquired = await offscreenRuntimeLeaseManager.acquire({
        owner: 'tts',
        leaseId: playbackToken,
        requiredReasons: ['AUDIO_PLAYBACK']
      });
      if (!acquired) {
        throw new Error('Offscreen playback lease was not acquired');
      }
      return playbackToken;
    } catch (error) {
      if (this.pendingPlaybackToken === playbackToken) {
        this.pendingPlaybackToken = null;
        this.predecessorPlaybackToken = null;
        this.pendingPlaybackMetadata = null;
      }
      logger.error('Playback lease acquisition failed:', error);
      throw error;
    }
  }

  /**
   * Commit an acquired playback generation after its offscreen start succeeds.
   * The predecessor remains protected until this handoff completes.
   *
   * @param {string} playbackToken - Acquired playback generation token
   * @param {Object} metadata - Sender and language metadata committed atomically
   * @returns {Promise<boolean>} Whether handoff was committed
   */
  async commitPlaybackLease(playbackToken, metadata = {}) {
    if (this.pendingPlaybackToken !== playbackToken) {
      return false;
    }

    const predecessorPlaybackToken = this.predecessorPlaybackToken;
    const committedMetadata = {
      ...this.pendingPlaybackMetadata,
      ...(Object.keys(metadata).length ? this.normalizePlaybackMetadata(metadata) : {})
    };
    this.pendingPlaybackToken = null;
    this.predecessorPlaybackToken = null;
    this.pendingPlaybackMetadata = null;
    this.currentPlaybackToken = playbackToken;
    this.currentTTSSender = committedMetadata.sender;
    this.currentTTSId = committedMetadata.ttsId;
    this.lastTTSLanguage = committedMetadata.language;
    this.lastTTSText = committedMetadata.text;
    this.playbackRevision++;

    if (predecessorPlaybackToken && predecessorPlaybackToken !== playbackToken) {
      await this.releaseOffscreenLease(predecessorPlaybackToken);
    }

    return true;
  }

  /**
   * Terminalize failed handoff and any predecessor displaced by offscreen.
   * Once successor playback was attempted, predecessor state is unsafe to keep.
   */
  async failPlaybackHandoff(playbackToken, errorData = null) {
    if (!playbackToken) return false;

    const isPending = this.pendingPlaybackToken === playbackToken;
    const isCurrent = this.currentPlaybackToken === playbackToken;
    if (!isPending && !isCurrent) {
      // Stale token (already logically cancelled or superseded). Send a
      // token-scoped TTS_STOP so the offscreen tombstone rejects any
      // delayed PLAY for this generation, then release its lease.
      await this.stopPlaybackToken(playbackToken);
      await this.releaseOffscreenLease(playbackToken);
      return false;
    }

    const predecessorPlaybackToken = isPending ? this.predecessorPlaybackToken : null;
    const metadata = isPending && this.pendingPlaybackMetadata
      ? this.createMetadataSnapshot(this.pendingPlaybackMetadata)
      : this.capturePlaybackMetadata();
    const affectedTokens = [...new Set([
      playbackToken,
      predecessorPlaybackToken,
      isPending || isCurrent ? this.currentPlaybackToken : null
    ].filter(Boolean))];

    this.pendingPlaybackToken = null;
    this.predecessorPlaybackToken = null;
    this.pendingPlaybackMetadata = null;
    if (isPending || isCurrent || this.currentPlaybackToken === predecessorPlaybackToken) {
      this.currentPlaybackToken = null;
      this.currentTTSSender = null;
      this.currentTTSId = null;
      this.lastTTSLanguage = null;
      this.lastTTSText = null;
    }
    this.playbackRevision++;

    for (const token of affectedTokens) {
      await this.stopAudioOnly(token);
    }
    for (const token of affectedTokens) {
      await this.releaseOffscreenLease(token);
    }

    await this.notifyCapturedEnded('error', errorData || { error: 'TTS playback handoff failed' }, playbackToken, metadata);
    return true;
  }

  /**
   * Owner-aware stop with handoff awareness.
   * Decides which playback generation(s) to stop based on sender ownership.
   *
   * Pre-handoff state:
   *   - committed: currentPlaybackToken / currentTTSSender / currentTTSId
   *   - pending:   pendingPlaybackToken   / pendingPlaybackMetadata
   *   - predecessor token: predecessorPlaybackToken (== currentPlaybackToken during handoff)
   *
   * Same-session handoff note: `TTSQueueManager` reuses one request `ttsId`
   * across every chunk of a multi-chunk session. A chunk transition can
   * therefore produce a predecessor and a pending successor that share the
   * SAME `ttsId` (and often the same owner). For specific-`ttsId` Stops we
   * must consider BOTH generations before deciding what to stop — matching
   * pending first and stopping only the successor would leave a same-session
   * predecessor (and its remaining queue) alive, which is wrong.
   *
   * Behavior:
   *   - Specific ttsId (not 'all', not null/undefined): always fenced by ttsId.
   *       * matchesPending && matchesCurrent (same-session handoff):
   *           - stopOnlyIfOwner false/absent → existing global stopPlayback()
   *             (clears the queue and the whole session).
   *           - stopOnlyIfOwner true:
   *               · owns both   → stopPlayback() (exclusive-playback / queue clear).
   *               · owns only current → _stopPredecessorOnly()
   *                                     (queue-managed chunk still in flight
   *                                      is abandoned with the predecessor; the
   *                                      foreign pending is left intact).
   *               · owns only pending → _stopPendingOnly().
   *               · owns neither       → skipped (not_owner).
   *       * only one generation matches:
   *           - matchesCurrent only → if a successor is pending,
   *             _stopPredecessorOnly(); otherwise stopPlayback().
   *             Ownership check applies only when stopOnlyIfOwner is true.
   *           - matchesPending only → _stopPendingOnly(). Ownership check
   *             applies only when stopOnlyIfOwner is true.
   *       * neither generation matches → skipped (specific-ttsId fence); no
   *         playback affected, even when ownerless.
   *   - No specific ttsId (or 'all'):
   *       * stopOnlyIfOwner false/absent → delegates to existing global stopPlayback().
   *       * stopOnlyIfOwner true:
   *           - owns both pending and current (same owner) → full stop.
   *           - owns only current, no pending              → full stop.
   *           - owns only current, foreign successor pending → stops ONLY predecessor.
   *           - owns only pending, foreign current          → stops ONLY pending successor.
   *           - owns neither                                → skipped (not_owner).
   *
   * @param {Object} sender - Message sender
   * @param {Object} options
   * @param {string|null|undefined} [options.ttsId=null] - Specific ttsId; null/'all'/absent = stop-all
   * @param {boolean} [options.stopOnlyIfOwner=false] - Enforce ownership
   * @returns {Promise<Object>} { success, action, skipped?, reason?, playbackToken? }
   */
  async stopForOwner(sender, { ttsId = null, stopOnlyIfOwner = false } = {}) {
    const isSpecific = Boolean(ttsId && ttsId !== 'all');
    const hasPending = Boolean(this.pendingPlaybackToken);
    const pendingMetadata = this.pendingPlaybackMetadata;
    const currentSender = this.currentTTSSender;
    const currentTTSId = this.currentTTSId;

    if (isSpecific) {
      // Specific ttsId is ALWAYS fenced, regardless of stopOnlyIfOwner.
      // Compute both matches BEFORE deciding so a same-session handoff
      // (TTSQueueManager reuses one ttsId across chunks) cannot trick us
      // into stopping only the pending successor.
      const matchesPending = hasPending && pendingMetadata?.ttsId === ttsId;
      const matchesCurrent = currentTTSId === ttsId;

      if (matchesPending && matchesCurrent) {
        // Same-session handoff: predecessor + successor share this ttsId.
        if (!stopOnlyIfOwner) {
          // Ownerless specific Stop for the session: clear the whole session
          // and the queue via the existing global path.
          return this.stopPlayback();
        }
        const ownsPending = this.isCurrentOwner(sender, pendingMetadata?.sender ?? null);
        const ownsCurrent = this.isCurrentOwner(sender, currentSender);
        if (ownsPending && ownsCurrent) {
          return this.stopPlayback();
        }
        if (ownsCurrent) {
          return this._stopPredecessorOnly();
        }
        if (ownsPending) {
          return this._stopPendingOnly();
        }
        return { success: true, skipped: true, reason: 'not_owner' };
      }

      if (matchesPending) {
        if (stopOnlyIfOwner && !this.isCurrentOwner(sender, pendingMetadata?.sender ?? null)) {
          return { success: true, skipped: true, reason: 'not_owner' };
        }
        return this._stopPendingOnly();
      }

      if (matchesCurrent) {
        if (stopOnlyIfOwner && !this.isCurrentOwner(sender, currentSender)) {
          return { success: true, skipped: true, reason: 'not_owner' };
        }
        if (hasPending) {
          return this._stopPredecessorOnly();
        }
        // No pending successor: full stop is the existing behavior.
        return this.stopPlayback();
      }

      // Neither generation matches: do not stop anything, even when ownerless.
      return { success: true, skipped: true };
    }

    // ID-less / 'all' + no ownership gating: preserve existing global behavior.
    if (!stopOnlyIfOwner) {
      return this.stopPlayback();
    }

    // Owner-scoped stop-all: only generations owned by the sender are stopped.
    const ownsPending = hasPending
      && this.isCurrentOwner(sender, pendingMetadata?.sender ?? null);
    const ownsCurrent = this.isCurrentOwner(sender, currentSender);

    if (!ownsPending && !ownsCurrent) {
      return { success: true, skipped: true, reason: 'not_owner' };
    }

    // Same owner owns both generations: existing exclusive-playback semantic.
    if (ownsPending && ownsCurrent) {
      return this.stopPlayback();
    }

    if (ownsCurrent && !hasPending) {
      return this.stopPlayback();
    }

    if (ownsCurrent && hasPending) {
      return this._stopPredecessorOnly();
    }

    if (ownsPending && !ownsCurrent) {
      return this._stopPendingOnly();
    }

    // Unreachable given the guard above, but kept for exhaustive branching.
    return { success: true, skipped: true };
  }

  /**
   * Stop only the pending successor playback. Uses the offscreen runtime as
   * the authoritative boundary signal via the structured `TTS_STOP` response:
   *
   *   - `{ success: true, stopped: true, playbackToken }` — supplied token
   *       was physically current and was stopped.
   *   - `{ success: true, skipped: true, currentPlaybackToken: <token|null> }`
   *       — supplied token was NOT current; the current physical playback is
   *       either the supplied token's owner-scope predecessor, a different
   *       (possibly newer) generation, or null.
   *   - Anything else — undefined, transport failure, malformed response —
   *       physical state is unknown and must be treated conservatively.
   *
   * Reconciliation branches on the structured response:
   *
   *   A. `stopped === true`: the successor had become physical current, so
   *      the predecessor was displaced. Clear committed state only when it
   *      still matches the captured predecessor token; never touch a newer
   *      generation. Release the exact captured predecessor lease. Notify
   *      the predecessor owner with `interrupted`.
   *   B. `skipped === true` AND `currentPlaybackToken === capturedPredecessorToken`:
   *      the predecessor IS the current physical playback. Preserve it.
   *      Release only the pending lease. Notify successor with `stopped`.
   *   C. `skipped === true` AND `currentPlaybackToken` is null OR different
   *      from the captured predecessor: we cannot positively prove the
   *      captured predecessor is still alive. If StateManager still points
   *      to the captured predecessor token, reconcile that STALE predecessor
   *      generation (clear, release lease, notify owner with `interrupted`).
   *      Never touch a different/newer StateManager generation.
   *   D. Unknown / unavailable / transport failure: do not claim predecessor
   *      preservation. Take the conservative path: do not speculate-stop
   *      another owner; do not falsely succeed. Reconcile the captured
   *      predecessor conservatively (clear + release lease + notify owner
   *      with `interrupted`) ONLY when StateManager still points to it;
   *      never touch a different/newer StateManager generation.
   *
   * Cross-owner isolation is preserved: the foreign predecessor is never
   * marked as having been explicitly stopped by the successor owner; its
   * terminal state reflects a handoff displacement or conservative
   * reconciliation, not a successor-initiated Stop.
   *
   * All post-`await` state changes are token-fenced against the captured
   * generation so a newer playback that arrived during the async window
   * cannot be cleared.
   */
  async _stopPendingOnly() {
    // 1. Capture exact identity synchronously before any await yields.
    const pendingToken = this.pendingPlaybackToken;
    const pendingMetaSnapshot = this.pendingPlaybackMetadata
      ? this.createMetadataSnapshot(this.pendingPlaybackMetadata)
      : null;
    const capturedPredecessorToken = this.currentPlaybackToken;
    const capturedPredecessorSnapshot = (capturedPredecessorToken && this.currentTTSSender)
      ? this.capturePlaybackMetadata()
      : null;

    if (!pendingToken) {
      // Nothing to do: no pending generation. The owner-scoped Stop should
      // not have routed here, but this guard preserves cross-owner isolation
      // and prevents any tokenless TTS_STOP from being emitted.
      return { success: true, skipped: true, reason: 'no_pending' };
    }

    // 2. Invalidate the pending logical generation synchronously so a late
    // commit is rejected and no late PLAY can adopt the tombstoned token.
    this.pendingPlaybackToken = null;
    this.predecessorPlaybackToken = null;
    this.pendingPlaybackMetadata = null;
    this.playbackRevision++;

    // 3. Send exact-token TTS_STOP and inspect the structured offscreen
    // response. The offscreen runtime is authoritative for the physical
    // state of the playback generations.
    const offscreenResponse = await this.stopPlaybackToken(pendingToken);
    const classification = this._classifyPendingStopResponse(
      offscreenResponse,
      pendingToken,
      capturedPredecessorToken,
    );

    // 4. Release the pending lease regardless of branch — the pending
    // generation is logically gone in every classification.
    await this.releaseOffscreenLease(pendingToken);

    // 5. Reconcile the captured predecessor generation ONLY when
    // classification.reconcilePredecessor is true AND StateManager still
    // points to the captured predecessor token. Branch B preserves the
    // predecessor; branches C/D reconcile the captured predecessor only
    // when StateManager STILL references it (token-fenced). A newer
    // replacement generation that already replaced StateManager's
    // committed slot is never cleared by this cleanup path.
    const stillReferencesCaptured = this.currentPlaybackToken === capturedPredecessorToken;
    if (classification.reconcilePredecessor && stillReferencesCaptured) {
      this.currentPlaybackToken = null;
      this.currentTTSSender = null;
      this.currentTTSId = null;
      this.lastTTSLanguage = null;
      this.lastTTSText = null;
    }
    if (classification.reconcilePredecessor) {
      // Release the exact captured predecessor lease regardless of whether
      // StateManager still references it: the captured generation's lease
      // is ours to release and must not be stranded. We deliberately do NOT
      // call stopAudioOnly here: the predecessor's physical state is
      // already settled by offscreen (branch A) or unknown/foreign (C/D).
      await this.releaseOffscreenLease(capturedPredecessorToken);

      if (capturedPredecessorSnapshot?.sender && stillReferencesCaptured) {
        await this.notifyCapturedEnded(
          classification.predecessorReason,
          null,
          capturedPredecessorToken,
          capturedPredecessorSnapshot,
        );
      }
    }

    // 6. Notify the successor owner that its generation was stopped.
    if (pendingMetaSnapshot) {
      await this.notifyCapturedEnded('stopped', null, pendingToken, pendingMetaSnapshot);
    }

    // Branch D result semantics: physical state could NOT be confirmed, so
    // this must NOT be reported as a normal successful physical Stop. The
    // pending logical generation is invalidated and its lease released, but
    // the caller must be able to distinguish a confirmed stop/reconciliation
    // from an unconfirmed/unknown one. Return a structured failure result
    // that reuses the existing `{ success, error }` TTS failure shape
    // (see `TTS_STOP_FAILED` in ErrorTypes) while still surfacing the
    // classification and exact token for downstream fencing.
    if (classification.label === 'D') {
      return {
        success: false,
        error: 'offscreen_state_unknown',
        action: 'stopped',
        playbackToken: pendingToken,
        predecessorDisplaced: false,
        classification: 'D',
      };
    }

    return {
      success: true,
      action: 'stopped',
      playbackToken: pendingToken,
      predecessorDisplaced: classification.predecessorDisplaced,
      classification: classification.label,
    };
  }

  /**
   * Classify the structured offscreen `TTS_STOP` response into one of the
   * four reconciliation branches described on `_stopPendingOnly`. Pure
   * helper; no state mutation, no await.
   *
   * Strict identity validation is applied: a response must carry the full
   * authoritative shape for its branch to be accepted. Any missing,
   * contradictory, or mismatched identity field routes to Branch D so the
   * caller can treat physical state as unknown rather than inferring it
   * from absent fields.
   *
   * Branch A is valid only when:
   *   `success === true && stopped === true && playbackToken === pendingToken`
   * Branch B/C is valid only when:
   *   `success === true && skipped === true` AND the response explicitly
   *   owns a `currentPlaybackToken` property (explicit null is meaningful;
   *   absent is malformed).
   * Contradictory shapes (both `stopped` and `skipped`) fall into Branch D.
   *
   * @param {Object|undefined} response - Offscreen response from
   *   `stopPlaybackToken`.
   * @param {string|null|undefined} pendingToken - The exact pending token
   *   sent to offscreen; used to validate the returned `playbackToken`
   *   identity in Branch A.
   * @param {string|null|undefined} capturedPredecessorToken - The
   *   StateManager predecessor token captured before the goto.
   * @returns {{label: 'A'|'B'|'C-null'|'C-different'|'D', reconcilePredecessor: boolean,
   *           predecessorDisplaced: boolean, predecessorReason: 'interrupted'}}
   */
  _classifyPendingStopResponse(response, pendingToken, capturedPredecessorToken) {
    // Defensive: no response or non-object response → Branch D.
    if (!response || typeof response !== 'object') {
      return {
        label: 'D',
        reconcilePredecessor: Boolean(capturedPredecessorToken),
        predecessorDisplaced: false,
        predecessorReason: 'interrupted',
      };
    }

    const success = response.success === true;
    const stopped = response.stopped === true;
    const skipped = response.skipped === true;

    // Contradictory shapes: cannot both have stopped and skipped.
    if (stopped && skipped) {
      return {
        label: 'D',
        reconcilePredecessor: Boolean(capturedPredecessorToken),
        predecessorDisplaced: false,
        predecessorReason: 'interrupted',
      };
    }

    // Branch A: pending token WAS physically current and stopped. Requires
    // success && stopped AND a `playbackToken` field that matches the exact
    // token sent to offscreen. A missing or mismatched `playbackToken` is
    // malformed and routes to Branch D.
    if (success && stopped) {
      const returnedToken = response.playbackToken;
      const isIdentified = returnedToken !== undefined && returnedToken === pendingToken;
      if (!isIdentified) {
        return {
          label: 'D',
          reconcilePredecessor: Boolean(capturedPredecessorToken),
          predecessorDisplaced: false,
          predecessorReason: 'interrupted',
        };
      }
      return {
        label: 'A',
        reconcilePredecessor: Boolean(capturedPredecessorToken),
        predecessorDisplaced: true,
        predecessorReason: 'interrupted',
      };
    }

    // Branch B/C: pending token was NOT current; offscreen tells us who is.
    // Requires success && skipped AND an explicitly-own `currentPlaybackToken`
    // property. Absence of the property is malformed and routes to Branch D;
    // explicit `null` is a meaningful "nothing is current" signal.
    if (success && skipped) {
      const ownsCurrentPlaybackToken = Object.prototype.hasOwnProperty.call(
        response,
        'currentPlaybackToken',
      );
      if (!ownsCurrentPlaybackToken) {
        return {
          label: 'D',
          reconcilePredecessor: Boolean(capturedPredecessorToken),
          predecessorDisplaced: false,
          predecessorReason: 'interrupted',
        };
      }
      const currentPhysical = response.currentPlaybackToken;

      // Branch B: the captured predecessor IS the current physical playback.
      if (capturedPredecessorToken && currentPhysical === capturedPredecessorToken) {
        return {
          label: 'B',
          reconcilePredecessor: false,
          predecessorDisplaced: false,
          predecessorReason: 'interrupted',
        };
      }

      // Branch C-null: offscreen explicitly reports nothing is physically
      // playing. This is the only "no playback" signal that is authoritative.
      if (currentPhysical === null) {
        return {
          label: 'C-null',
          reconcilePredecessor: Boolean(capturedPredecessorToken),
          predecessorDisplaced: false,
          predecessorReason: 'interrupted',
        };
      }

      // Branch C-different: a NEWER/different generation is physically
      // current. The captured predecessor is definitely not physical; it
      // is stale. Reconcile it without touching the newer generation.
      return {
        label: 'C-different',
        reconcilePredecessor: Boolean(capturedPredecessorToken),
        predecessorDisplaced: false,
        predecessorReason: 'interrupted',
      };
    }

    // Branch D: unknown / unavailable / transport failure / malformed.
    // Conservative: do not claim preservation, do not speculate-stop.
    // Reconcile the captured predecessor if StateManager still references
    // it; never touch a different/newer StateManager generation.
    return {
      label: 'D',
      reconcilePredecessor: Boolean(capturedPredecessorToken),
      predecessorDisplaced: false,
      predecessorReason: 'interrupted',
    };
  }

  /**
   * Stop only the committed predecessor playback without affecting a pending
   * successor. Used when the requester owns the predecessor but a foreign
   * successor is pending. Invalidates current state synchronously before
   * yielding so the pending successor remains handoff-eligible.
   *
   * NOTE: `currentTTSRequest` / `pendingRequestKey` are intentionally NOT
   * cleared: during a handoff they may still represent the in-flight successor
   * request, and clearing them would corrupt its deduplication/fencing.
   */
  async _stopPredecessorOnly() {
    const predecessorToken = this.currentPlaybackToken;
    const predecessorMetaSnapshot = this.capturePlaybackMetadata();

    this.currentPlaybackToken = null;
    this.currentTTSSender = null;
    this.currentTTSId = null;
    this.lastTTSLanguage = null;
    this.lastTTSText = null;
    this.predecessorPlaybackToken = null;
    this.playbackRevision++;

    await this.stopAudioOnly(predecessorToken);
    await this.releaseOffscreenLease(predecessorToken);

    await this.notifyCapturedEnded('stopped', null, predecessorToken, predecessorMetaSnapshot);

    return { success: true, action: 'stopped', playbackToken: predecessorToken };
  }

  /**
   * Atomically stop current or pending playback.
   * Pending token wins so a late successor command remains rejected offscreen.
   */
  async stopPlayback() {
    const pendingPlaybackToken = this.pendingPlaybackToken;
    const currentPlaybackToken = this.currentPlaybackToken;
    const predecessorPlaybackToken = this.predecessorPlaybackToken;
    const stopToken = pendingPlaybackToken || currentPlaybackToken;
    const metadata = pendingPlaybackToken && this.pendingPlaybackMetadata
      ? this.createMetadataSnapshot(this.pendingPlaybackMetadata)
      : this.capturePlaybackMetadata();
    const affectedTokens = [...new Set([
      stopToken,
      pendingPlaybackToken,
      currentPlaybackToken,
      predecessorPlaybackToken
    ].filter(Boolean))];

    // Invalidate handoff synchronously before any stop message can yield.
    this.pendingPlaybackToken = null;
    this.predecessorPlaybackToken = null;
    this.pendingPlaybackMetadata = null;
    this.currentPlaybackToken = null;
    this.currentTTSSender = null;
    this.currentTTSId = null;
    this.lastTTSLanguage = null;
    this.lastTTSText = null;
    this.resetSpeakState();
    this.playbackRevision++;
    ttsQueueManager.stop();
    this.stopFirefoxAudio();

    // Stop selected pending generation first, then any still-physical predecessor.
    for (const token of affectedTokens) {
      await this.stopAudioOnly(token);
    }
    for (const token of affectedTokens) {
      await this.releaseOffscreenLease(token);
    }

    await this.notifyCapturedEnded('stopped', null, stopToken, metadata);
    return { success: true, action: 'stopped', playbackToken: stopToken };
  }

  /**
   * Release exact TTS offscreen runtime lease. Stale tokens remain releasable
   * after a service-worker restart without touching newer playback state.
   * @param {string} playbackToken - Playback generation lease identity
   */
  async releaseOffscreenLease(playbackToken) {
    if (!playbackToken) {
      return false;
    }

    try {
      const released = await offscreenRuntimeLeaseManager.release({
        owner: 'tts',
        leaseId: playbackToken
      });
      if (this.currentPlaybackToken === playbackToken) {
        this.currentPlaybackToken = null;
      }
      if (this.pendingPlaybackToken === playbackToken) {
        this.pendingPlaybackToken = null;
        this.predecessorPlaybackToken = null;
      } else if (this.predecessorPlaybackToken === playbackToken) {
        this.predecessorPlaybackToken = null;
      }
      return released;
    } catch (error) {
      logger.debug('Offscreen lease release failed:', error.message);
      return false;
    }
  }

  /**
   * Stop only the audio playback without closing the document.
   * This is the LEGACY intentionally-tokenless global stop path used by
   * manual/explicit cleanup paths only. Selective generation cleanup MUST
   * use `stopPlaybackToken` instead, which strictly requires an exact token.
   */
  async stopAudioOnly(playbackToken = this.currentPlaybackToken) {
    try {
      const browserAPI = await initializebrowserAPI();
      if (await offscreenRuntimeLeaseManager.ensureDocument()) {
        const message = {
          action: MessageActions.TTS_STOP,
          target: 'offscreen'
        };
        if (playbackToken) message.playbackToken = playbackToken;
        await browserAPI.runtime.sendMessage(message);
        logger.debug('Sent stop command to offscreen document');
      }
    } catch { /* ignore */ }
  }

  /**
   * Strict token-scoped stop for selective generation cleanup.
   *
   * Sends a token-scoped `TTS_STOP` to the offscreen runtime and returns the
   * structured offscreen response:
   *   - `{ success: true, stopped: <boolean>, skipped: <boolean> }`
   *
   * Requirements:
   *   - Requires a non-null/undefined playbackToken. A missing token returns
   *     a safe skipped/no-op result and never falls back to a tokenless
   *     `TTS_STOP` against the live current playback.
   *   - Always sends `playbackToken` when present, so offscreen can tombstone
   *     it and reject any delayed PLAY for the same generation.
   *   - Returns the offscreen response to the caller. The caller MUST inspect
   *     it: `stopped === true` means the physical handoff had already crossed
   *     the boundary and the predecessor was already displaced;
   *     `stopped === false` (or `skipped === true`) means the PLAY had not
   *     yet crossed the boundary and the predecessor is still physically live.
   *
   * This is the authoritative boundary signal — no background-side flag or
   * timing assumption is required.
   *
   * @param {string|null|undefined} playbackToken - Exact token to stop.
   * @returns {Promise<Object>} Structured response from offscreen, or a safe
   *   skipped/no-op result when the token is missing or offscreen is
   *   unreachable.
   */
  async stopPlaybackToken(playbackToken) {
    if (playbackToken === null || playbackToken === undefined || playbackToken === '') {
      return { success: true, skipped: true, reason: 'missing_token' };
    }
    try {
      const browserAPI = await initializebrowserAPI();
      const ensured = await offscreenRuntimeLeaseManager.ensureDocument();
      if (!ensured) {
        return { success: true, skipped: true, reason: 'offscreen_unavailable' };
      }
      return await browserAPI.runtime.sendMessage({
        action: MessageActions.TTS_STOP,
        target: 'offscreen',
        playbackToken,
      });
    } catch (error) {
      logger.debug('Token-scoped stop failed:', error?.message);
      return { success: false, error: error?.message ?? 'token_stop_failed' };
    }
  }
}

export const ttsStateManager = new TTSStateManager();
