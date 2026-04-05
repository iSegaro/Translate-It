/**
 * Edge TTS Client - Communicates with Microsoft Edge's Read Aloud endpoint via HTTP
 */
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'EdgeTTSClient');

// Constants for Edge TTS (Strictly matching read-frog for authentication success)
const EDGE_TTS_SIGNATURE_SECRET_BASE64 = "oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==";
const EDGE_TTS_SIGNATURE_APP_ID = "MSTranslatorAndroidApp";
const EDGE_TTS_ENDPOINT_URL = "https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0";
const EDGE_TTS_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0";
const EDGE_TTS_OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const EDGE_TTS_CLIENT_VERSION = "4.0.530a 5fe1dc6c";
const EDGE_TTS_USER_ID = "0f04d16a175c411e";
const EDGE_TTS_HOME_REGION = "zh-Hans-CN";

// Token caching
let tokenCache = null;

export class EdgeTTSClient {
  /**
   * Synthesize text to audio using Edge TTS HTTP API
   * @param {string} text - Text to synthesize
   * @param {string} voiceName - Name of the voice to use
   * @returns {Promise<Blob>} - Resolves with an audio blob
   */
  static async synthesize(text, voiceName) {
    try {
      logger.debug(`Starting synthesis for voice: ${voiceName}`);
      
      const tokenInfo = await EdgeTTSClient._getEndpointToken();
      const synthesisUrl = `https://${tokenInfo.region}.tts.speech.microsoft.com/cognitiveservices/v1`;

      const ssml = EdgeTTSClient._buildSSML(text, voiceName);
      
      logger.debug(`Sending synthesis request to ${tokenInfo.region} region`);

      const response = await fetch(synthesisUrl, {
        method: "POST",
        headers: {
          "Authorization": tokenInfo.token,
          "Content-Type": "application/ssml+xml",
          "User-Agent": EDGE_TTS_USER_AGENT,
          "X-Microsoft-OutputFormat": EDGE_TTS_OUTPUT_FORMAT,
        },
        body: ssml,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        if (response.status === 401 || response.status === 403) {
          logger.warn(`Auth error (${response.status}), clearing token cache`);
          tokenCache = null; 
        }
        throw new Error(`Edge TTS synthesis failed: ${response.status} ${errorText}`);
      }

      const audioBlob = await response.blob();
      if (audioBlob.size === 0) {
        throw new Error('Edge TTS returned empty audio data');
      }
      logger.info(`Synthesis successful, received blob of size: ${audioBlob.size}`);
      return audioBlob;
    } catch (err) {
      // Use warn level for provider errors to follow the Golden Chain architecture
      logger.warn('Synthesis failed:', err);
      throw err;
    }
  }

  /**
   * Get authorized endpoint token from Microsoft
   * @private
   */
  static async _getEndpointToken() {
    // Check cache (with 1 minute buffer)
    if (tokenCache && tokenCache.expiresAt > Date.now() + 60000) {
      logger.debug('Using cached token');
      return tokenCache;
    }

    try {
      logger.debug('Fetching new endpoint token...');
      const signature = await EdgeTTSClient._generateSignature(EDGE_TTS_ENDPOINT_URL);
      const traceId = crypto.randomUUID().replace(/-/g, "");

      const response = await fetch(EDGE_TTS_ENDPOINT_URL, {
        method: "POST",
        headers: {
          "Accept-Language": "zh-Hans",
          "X-ClientVersion": EDGE_TTS_CLIENT_VERSION,
          "X-UserId": EDGE_TTS_USER_ID,
          "X-HomeGeographicRegion": EDGE_TTS_HOME_REGION,
          "X-ClientTraceId": traceId,
          "X-MT-Signature": signature,
          "User-Agent": EDGE_TTS_USER_AGENT,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: "",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch Edge TTS token: ${response.status}`);
      }

      const data = await response.json();
      if (!data.t || !data.r) {
        throw new Error("Invalid token response format from Microsoft");
      }

      // JWT expiry decoding
      let expiresAt = Date.now() + 10 * 60 * 1000; // Default fallback 10 mins
      try {
        const parts = data.t.split('.');
        if (parts.length > 1) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (payload.exp) expiresAt = payload.exp * 1000;
        }
      } catch (e) {
        logger.warn("Failed to decode token expiry, using default", e);
      }

      tokenCache = {
        token: data.t,
        region: data.r,
        expiresAt: expiresAt
      };

      logger.info(`Token retrieved successfully for region: ${data.r}`);
      return tokenCache;
    } catch (err) {
      // Use warn level for provider errors
      logger.warn("Token retrieval failed:", err);
      throw err;
    }
  }

  /**
   * Generate required MT-Signature header using HMAC-SHA256
   * @private
   */
  static async _generateSignature(url) {
    const encodedUrl = encodeURIComponent(url.split("://")[1] || "");
    const requestId = crypto.randomUUID().replace(/-/g, "");
    const date = new Date();
    // Format date string exactly as expected: "day, dd mon year hh:mm:ss gmt"
    const formattedDate = `${date.toUTCString().replace(/GMT/g, "").trim().toLowerCase()} gmt`;

    const payload = `${EDGE_TTS_SIGNATURE_APP_ID}${encodedUrl}${formattedDate}${requestId}`.toLowerCase();
    
    const keyBytes = EdgeTTSClient._base64ToBytes(EDGE_TTS_SIGNATURE_SECRET_BASE64);
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

    return `${EDGE_TTS_SIGNATURE_APP_ID}::${signatureBase64}::${formattedDate}::${requestId}`;
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
