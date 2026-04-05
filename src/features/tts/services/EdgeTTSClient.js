/**
 * Edge TTS Client - Communicates with Microsoft Edge's Neural TTS endpoint
 * Logic-only worker that fetches all technical data from PROVIDER_CONFIGS.
 */
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TTS_ENGINES } from '@/shared/config/constants.js';
import { PROVIDER_CONFIGS } from '@/features/tts/constants/ttsProviders.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'EdgeTTSClient');

// Shared config reference
const config = PROVIDER_CONFIGS[TTS_ENGINES.EDGE];

// Generate a unique session-based User ID to avoid global fingerprinting
const EDGE_TTS_USER_ID = (() => {
  const hex = "0123456789abcdef";
  let output = "";
  for (let i = 0; i < 16; i++) output += hex[Math.floor(Math.random() * 16)];
  return output;
})();

// Token caching
let tokenCache = null;

export class EdgeTTSClient {
  /**
   * Synthesize text to audio using Edge TTS HTTP API
   * @param {string} text - Text to synthesize
   * @param {string} voiceName - Name of the voice to use
   * @param {boolean} isRetry - Whether this is a retry attempt
   * @returns {Promise<Blob>} - Resolves with an audio blob
   */
  static async synthesize(text, voiceName, isRetry = false) {
    try {
      logger.debug(`Starting synthesis for voice: ${voiceName}`);
      
      const tokenInfo = await EdgeTTSClient._getEndpointToken();
      const synthesisUrl = `https://${tokenInfo.region}.tts.speech.microsoft.com/cognitiveservices/v1`;

      const ssml = EdgeTTSClient._buildSSML(text, voiceName);
      
      const response = await fetch(synthesisUrl, {
        method: "POST",
        headers: {
          "Authorization": tokenInfo.token,
          "Content-Type": "application/ssml+xml",
          "User-Agent": config.userAgent,
          "X-Microsoft-OutputFormat": config.outputFormat,
        },
        body: ssml,
      });

      if (!response.ok) {
        if ((response.status === 401 || response.status === 403) && !isRetry) {
          logger.warn(`Auth error (${response.status}), refreshing token...`);
          tokenCache = null; 
          return await EdgeTTSClient.synthesize(text, voiceName, true);
        }
        const errorText = await response.text().catch(() => "");
        throw new Error(`Edge TTS synthesis failed: ${response.status} ${errorText}`);
      }

      const audioBlob = await response.blob();
      if (audioBlob.size === 0) {
        throw new Error('Edge TTS returned empty audio data');
      }
      
      return audioBlob;
    } catch (err) {
      logger.warn('Synthesis failed:', err);
      throw err;
    }
  }

  /**
   * Get authorized endpoint token from Microsoft
   * @private
   */
  static async _getEndpointToken() {
    if (tokenCache && tokenCache.expiresAt > Date.now() + 60000) {
      return tokenCache;
    }

    try {
      logger.debug('Fetching new endpoint token...');
      const signature = await EdgeTTSClient._generateSignature(config.endpointUrl);
      const traceId = crypto.randomUUID().replace(/-/g, "");

      const response = await fetch(config.endpointUrl, {
        method: "POST",
        headers: {
          "Accept-Language": "en-US",
          "X-ClientVersion": config.clientVersion,
          "X-UserId": EDGE_TTS_USER_ID,
          "X-ClientTraceId": traceId,
          "X-MT-Signature": signature,
          "User-Agent": config.userAgent,
          "Content-Type": "application/json",
        },
        body: "",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch Edge TTS token: ${response.status}`);
      }

      const data = await response.json();
      if (!data.t || !data.r) {
        throw new Error("Invalid token response format");
      }

      // JWT expiry decoding
      let expiresAt = Date.now() + 10 * 60 * 1000;
      try {
        const payloadBase64 = data.t.split('.')[1];
        if (payloadBase64) {
          const payload = JSON.parse(atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/')));
          if (payload.exp) expiresAt = payload.exp * 1000;
        }
      } catch (e) {
        // use default
      }

      tokenCache = {
        token: data.t,
        region: data.r,
        expiresAt: expiresAt
      };

      return tokenCache;
    } catch (err) {
      logger.warn("Token retrieval failed:", err);
      throw err;
    }
  }

  /**
   * Generate required HMAC-SHA256 signature for authentication
   * @private
   */
  static async _generateSignature(url) {
    const encodedUrl = encodeURIComponent(url.split("://")[1] || "");
    const requestId = crypto.randomUUID().replace(/-/g, "");
    const date = new Date();
    const formattedDate = `${date.toUTCString().replace(/GMT/g, "").trim().toLowerCase()} gmt`;

    const payload = `${config.appId}${encodedUrl}${formattedDate}${requestId}`.toLowerCase();
    
    const keyBytes = EdgeTTSClient._base64ToBytes(config.signatureSecret);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: { name: "SHA-256" } },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      new TextEncoder().encode(payload)
    );
    
    const signatureBase64 = EdgeTTSClient._bytesToBase64(new Uint8Array(signatureBuffer));

    return `${config.appId}::${signatureBase64}::${formattedDate}::${requestId}`;
  }

  static _base64ToBytes(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  static _bytesToBase64(bytes) {
    let binaryString = "";
    for (let i = 0; i < bytes.length; i++) {
      binaryString += String.fromCharCode(bytes[i]);
    }
    return btoa(binaryString);
  }

  static _buildSSML(text, voiceName) {
    const safeVoice = voiceName || 'en-US-AriaNeural'; 
    const lang = voiceName?.split('-').slice(0, 2).join('-') || 'en-US';
    
    const escapedText = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
    
    return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice name='${safeVoice}'><prosody pitch='+0Hz' rate='1.0' volume='100'>${escapedText}</prosody></voice></speak>`;
  }
}
