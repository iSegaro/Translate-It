# Translation Provider Implementation Guide

## Overview

این مستند راهنمای کاملی برای پیاده‌سازی پرووایدرهای ترجمه در سیستم Translate-It ارائه می‌دهد. تمام پرووایدرها باید از `BaseProvider` ارث‌بری کرده و الگوی Rate Limiting و Circuit Breaker را رعایت کنند.

## Architecture Overview

سیستم شامل این اجزا است:
- **BaseProvider**: کلاس پایه برای همه پرووایدرها، که منطق اصلی هماهنگی ترجمه، مدیریت خطا، و ابزارهای مشترک را فراهم می‌کند.
- **BaseTranslateProvider**: کلاس پایه برای پرووایدرهای ترجمه سنتی (مانند Google Translate, Yandex)، که `BaseProvider` را گسترش می‌دهد و منطق خاص برای ترجمه دسته‌ای و مدیریت chunk را اضافه می‌کند.
- **BaseAIProvider**: کلاس پایه برای پرووایدرهای ترجمه مبتنی بر هوش مصنوعی (مانند Gemini, OpenAI)، که `BaseProvider` را گسترش می‌دهد و منطق خاص برای ترجمه AI و بهینه‌سازی‌های مربوط به آن را اضافه می‌کند.
- **RateLimitManager**: مدیریت محدودیت نرخ درخواست و جلوگیری از تجاوز از محدودیت‌های API.
- **StreamingManager**: مدیریت جلسات استریمینگ ترجمه، هماهنگی ارسال نتایج به صورت بلادرنگ به UI.
- **TranslationEngine**: هماهنگی کلی ترجمه، انتخاب پرووایدر مناسب، و تصمیم‌گیری در مورد استفاده از استریمینگ.
- **UnifiedTranslationCoordinator**: هماهنگی streaming translation operations با timeout management هوشمند و progress reporting.
- **StreamingTimeoutManager**: مدیریت timeout های پویا برای streaming operations بر اساس اندازه محتوا.

## ✅ Provider Implementation Rules

### 1. **MANDATORY: Inherit from BaseProvider**

```javascript
import { BaseProvider } from "@/features/translation/providers/BaseProvider.js";

export class YourProvider extends BaseProvider {
  // Must implement required methods
}
```

### 2. **MANDATORY: Implement Required Methods**

هر پرووایدر باید این دو متد را پیاده‌سازی کند:

#### `_getLangCode(lang)` 
تبدیل زبان به فرمت مخصوص پرووایدر

```javascript
_getLangCode(lang) {
  // Convert language to provider-specific format
  return lang || "auto";
}
```

#### `_batchTranslate(texts, sl, tl, translateMode, engine, messageId, abortController)`
پردازش دسته‌ای متن‌ها با Rate Limiting. این متد توسط `BaseProvider.translate()` فراخوانی می‌شود.

```javascript
async _batchTranslate(texts, sl, tl, translateMode, engine, messageId, abortController) {
  // Import rate limiting manager
  const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
  
  const results = [];
  
  // Process sequentially with rate limiting
  for (let i = 0; i < texts.length; i++) {
    // Check for cancellation
    if (engine && engine.isCancelled(messageId)) {
      throw new Error('Translation cancelled');
    }
    
    try {
      // Call _translateSingle or _translateChunk depending on provider type
      const result = await rateLimitManager.executeWithRateLimit(
        this.providerName,
        () => this._translateSingle(texts[i], sl, tl, translateMode), // Example for AI provider
        // () => this._translateChunk([texts[i]], sl, tl, translateMode), // Example for traditional provider if chunking is handled here
        `segment-${i + 1}/${texts.length}`
      );
      
      results.push(result || texts[i]);
    } catch (error) {
      logger.warn(`[${this.providerName}] Segment ${i + 1} failed:`, error);
      results.push(texts[i]); // Fallback to original text
    }
  }
  
  return results;
}
```

### 3. **DO NOT Override translate() Method**

❌ **WRONG** - Override کردن translate method:
```javascript
// Don't do this!
async translate(text, sourceLang, targetLang, options) {
  // This bypasses language swapping, JSON mode detection, and rate limiting!
}
```

✅ **CORRECT** - از inherited translate استفاده کنید:
```javascript
// BaseProvider.translate() automatically handles:
// - Language swapping (via LanguageSwappingService.applyLanguageSwapping)
// - JSON mode detection
// - Batching and streaming decision (via TranslationEngine._shouldUseStreamingForProvider)
// - Rate limiting integration (via _batchTranslate calling rateLimitManager)
// - Error management
```

## Provider Types & Patterns

پرووایدرها بر اساس نوع و قابلیت‌هایشان به دو دسته اصلی تقسیم می‌شوند. `TranslationEngine` از `static type` برای تصمیم‌گیری در مورد نحوه مدیریت درخواست‌های ترجمه و استریمینگ استفاده می‌کند.

### 1. **Translation Services (Google, Bing, Yandex)**

این پرووایدرها معمولاً APIهای سنتی دارند و ممکن است محدودیت‌های کاراکتری یا درخواست داشته باشند. استریمینگ برای این نوع پرووایدرها تنها برای متن‌های بسیار طولانی که نیاز به تکه‌تکه شدن دارند، فعال می‌شود. UnifiedTranslationCoordinator به صورت خودکار تصمیم می‌گیرد که آیا از streaming استفاده کند یا خیر بر اساس context (select-element) و اندازه متن.

```javascript
export class TranslationServiceProvider extends BaseProvider {
  static type = "translate"; // ✅ MANDATORY: Set type to "translate"
  static reliableJsonMode = true; // Can handle JSON reliably
  static supportsDictionary = true; // Supports dictionary mode
  static CHAR_LIMIT = 5000; // Character limit per request
  
  _getLangCode(lang) {
    // Map to provider's language codes (e.g., using a predefined map)
    return this.langCodeMap[lang] || lang;
  }
  
  async _batchTranslate(texts, sl, tl, translateMode, engine, messageId, abortController) {
    // For traditional providers, _batchTranslate typically handles chunking and calls _translateChunk
    const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
    
    // Example: Create chunks based on character limits (if not handled by BaseTranslateProvider)
    const chunks = this._createChunks(texts); // _createChunks is in BaseTranslateProvider
    const results = [];
    
    for (const chunk of chunks) {
      if (engine && engine.isCancelled(messageId)) {
        throw new Error('Translation cancelled');
      }
      try {
        const chunkResults = await rateLimitManager.executeWithRateLimit(
          this.providerName,
          () => this._translateChunk(chunk.texts, sl, tl, translateMode, abortController), // _translateChunk must be implemented by subclass
          `chunk-${chunks.indexOf(chunk) + 1}/${chunks.length}`
        );
        results.push(...chunkResults);
      } catch (error) {
        logger.warn(`[${this.providerName}] Chunk failed:`, error);
        results.push(...chunk.texts); // Fallback to original texts for the chunk
      }
    }
    return results;
  }

  // MANDATORY: Implement _translateChunk for actual API call for a single chunk
  async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController) {
    // Implement actual API call logic for a single chunk here
    // Use this._executeApiCall for network requests
    throw new Error(`_translateChunk not implemented by ${this.providerName}`);
  }
}
```

### 2. **AI Services (OpenAI, Gemini, DeepSeek)**

این پرووایدرها معمولاً قابلیت‌های پیشرفته‌تری مانند استریمینگ بلادرنگ و پردازش پیچیده‌تر را ارائه می‌دهند. استریمینگ برای این نوع پرووایدرها برای متن‌های طولانی‌تر یا در حالت‌های خاص (مانند `select-element`) فعال می‌شود. UnifiedTranslationCoordinator timeout management هوشمند بر اساس تعداد segments و پیچیدگی محتوا ارائه می‌دهد.

```javascript
export class AIServiceProvider extends BaseProvider {
  static type = "ai"; // ✅ MANDATORY: Set type to "ai"
  static reliableJsonMode = false; // AI responses can be unpredictable
  static supportsDictionary = true;
  
  _getLangCode(lang) {
    // AI services usually work with full language names (e.g., "English", "Farsi")
    return lang || "auto";
  }
  
  async _batchTranslate(texts, sl, tl, translateMode, engine, messageId, abortController) {
    // For AI providers, _batchTranslate typically processes each text individually or in small batches
    const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
    
    const results = [];
    for (let i = 0; i < texts.length; i++) {
      if (engine && engine.isCancelled(messageId)) {
        throw new Error('Translation cancelled');
      }
      
      try {
        const result = await rateLimitManager.executeWithRateLimit(
          this.providerName,
          () => this._translateSingle(texts[i], sl, tl, translateMode, abortController), // _translateSingle must be implemented by subclass
          `segment-${i + 1}/${texts.length}`
        );
        results.push(result || texts[i]);
      } catch (error) {
        logger.warn(`[${this.providerName}] Segment ${i + 1} failed:`, error);
        results.push(texts[i]); // Fallback to original text
      }
    }
    return results;
  }
  
  // MANDATORY: Implement _translateSingle for actual API call for a single text
  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController) {
    // Implement actual API call logic here for a single text
    // Use this._executeApiCall for network requests
    throw new Error(`_translateSingle method must be implemented by ${this.providerName}`);
  }
}
```

## Streaming Coordination Integration

### How Streaming Works with Providers

سیستم streaming coordination به صورت شفاف با تمام provider ها کار می‌کند:

1. **Automatic Detection**: UnifiedTranslationCoordinator تشخیص می‌دهد که آیا translation نیاز به streaming دارد
2. **Smart Routing**: بر اساس context و اندازه متن، درخواست‌ها route می‌شوند
3. **Progress Reporting**: StreamingTimeoutManager progress reports را مدیریت می‌کند
4. **Timeout Management**: timeout های پویا بر اساس تعداد segments محاسبه می‌شود

```javascript
// Providers خودشان نیازی به تغییر برای streaming ندارند
// همه چیز در لایه coordination انجام می‌شود

export class YourProvider extends BaseProvider {
  // Implementation بدون تغییر برای streaming
  async _batchTranslate(texts, sl, tl, translateMode, engine, messageId, abortController) {
    // Provider فقط translation logic خودش را implement می‌کند
    // Streaming coordination خودکار است
  }
}
```

### Streaming Conditions

Streaming فعال می‌شود وقتی:
- Context برابر `'select-element'` باشد
- Text length بیشتر از 2000 کاراکتر باشد، یا
- JSON payload با بیش از 5 segment موجود باشد

## Rate Limiting Integration

### Current Configuration

```javascript
// In RateLimitManager.js
const PROVIDER_CONFIGS = {
  'GoogleTranslate': { maxConcurrent: 2, delayBetweenRequests: 100 },
  'BingTranslate': { maxConcurrent: 2, delayBetweenRequests: 200 },
  'Gemini': { maxConcurrent: 2, delayBetweenRequests: 600 },
  'OpenAI': { maxConcurrent: 2, delayBetweenRequests: 500 },
  'YandexTranslate': { maxConcurrent: 2, delayBetweenRequests: 150 }, // Example for Yandex
  // Add your provider here
}
```

### Circuit Breaker Features

- **Automatic failure detection**: 5 consecutive failures → circuit opens
- **Recovery time**: 30 seconds cooldown
- **Queue limits**: Maximum 10 pending requests per provider
- **Smart retry**: Different strategies for different error types

## ✅ Correct Provider Examples

### Example 1: Updated Gemini Provider

```javascript
export class GeminiProvider extends BaseAIProvider { // ✅ Extends BaseAIProvider
  static type = "ai";
  static reliableJsonMode = false;
  
  // ✅ Correct: Implement required methods only
  _getLangCode(lang) {
    return lang || "auto";
  }
  
  // _batchTranslate is inherited from BaseAIProvider, which calls _translateSingle
  
  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController) {
    // Actual API implementation for Gemini
    // Use this._executeApiCall
    throw new Error(`_translateSingle not implemented by GeminiProvider`);
  }
}
```

### Example 2: Translation Service Provider (Yandex)

```javascript
export class YandexTranslateProvider extends BaseTranslateProvider { // ✅ Extends BaseTranslateProvider
  static type = "translate";
  static reliableJsonMode = true;
  static CHAR_LIMIT = 10000;
  
  _getLangCode(lang) {
    // Map to Yandex-specific language codes
    return this.yandexLangCode[lang] || lang;
  }
  
  // _batchTranslate is inherited from BaseTranslateProvider, which calls _translateChunk

  async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController) {
    // Actual API implementation for Yandex for a single chunk
    // Use this._executeApiCall
    throw new Error(`_translateChunk not implemented by YandexTranslateProvider`);
  }
}
```

## ❌ Providers That Need Updates

### Current Status:

1. **✅ FIXED**: GoogleTranslate, BingTranslate, Gemini, YandexTranslate
2. **❌ NEEDS UPDATE**: OpenAI, DeepSeek, OpenRouter, WebAI, CustomProvider, BrowserAPI

### Update Required For:

#### OpenAI Provider
- Currently overrides `translate()` method
- Needs `_batchTranslate()` and `_getLangCode()` implementation
- Should use RateLimitManager for API calls

#### DeepSeek Provider  
- Similar pattern to OpenAI
- Needs rate limiting integration

#### OpenRouter Provider
- Needs sequential processing instead of concurrent calls

#### WebAI Provider
- Likely needs batch processing implementation

#### CustomProvider
- Should follow standard pattern for user-defined endpoints

#### BrowserAPI Provider  
- May need special handling for browser APIs

## Implementation Checklist

When implementing/updating a provider:

- [x] Extends `BaseProvider` (or `BaseTranslateProvider`/`BaseAIProvider`)
- [x] Sets `static type = "ai"` or `static type = "translate"`
- [x] Implements `_getLangCode(lang)`
- [x] Implements `_batchTranslate(texts, sl, tl, translateMode, engine, messageId, abortController)` (or relies on inherited implementation from `BaseTranslateProvider`/`BaseAIProvider`)
- [x] Implements `_translateSingle` (for AI) or `_translateChunk` (for traditional) for actual API calls
- [x] Uses `rateLimitManager.executeWithRateLimit()` for all API calls
- [x] Does NOT override `translate()` method
- [x] Handles cancellation via `engine.isCancelled(messageId)`
- [x] Provides fallback to original text on errors
- [x] Processes requests sequentially (no `Promise.all()` for individual API calls within a batch/chunk)
- [x] Has proper error handling and logging
- [x] Added to RateLimitManager configuration
- [x] **Compatible with streaming coordination** (automatic - no changes needed in provider implementation)
- [x] **Timeout-aware** (supports cancellation and respects dynamic timeouts from UnifiedTranslationCoordinator)

## Rate Limiting Best Practices

1. **Sequential Processing**: Avoid `Promise.all()` for individual API calls within a batch/chunk to prevent hitting rate limits too quickly. The `_batchTranslate` and `_processInBatches` methods are designed to handle this sequentially.
2. **Cancellation Support**: Always check `engine.isCancelled(messageId)` before making API calls to respect user cancellations.
3. **Error Handling**: Provide fallback to original text on API failures to ensure graceful degradation.
4. **Proper Context**: Provide meaningful context strings to `executeWithRateLimit()` for better logging and debugging.
5. **Chunking**: Respect provider character limits by implementing `_createChunks` (for traditional providers) and ensuring `_translateChunk` handles these smaller segments.
6. **Logging**: Use consistent logging patterns with `logger.debug`, `logger.info`, `logger.warn`, `logger.error`.

## Example Usage

```javascript
// Rate limited API call
const result = await rateLimitManager.executeWithRateLimit(
  this.providerName,              // Provider identifier
  () => this._apiCall(data),      // Function that makes the actual API call
  'translation-context'          // Context for logging/debugging
);
```

## Error Types & Circuit Breaker

The system automatically handles:
- **Rate limit errors** (HTTP 429, quota exceeded)
- **Network errors** 
- **API failures**
- **Cancellation** (user or system initiated)

Circuit breaker triggers on:
- Consecutive rate limit violations
- Network timeouts
- Persistent API failures

## Testing Your Provider

```javascript
// Basic test pattern
const provider = new YourProvider();
const result = await provider.translate(
  "Hello world",
  "en", 
  "fa",
  { 
    mode: "selection",
    originalSourceLang: "en",
    originalTargetLang: "fa"
  }
);
```

---

## Summary

**Key Points:**
1. همه پرووایدرها باید از `BaseProvider` ارث‌بری کنند (یا `BaseTranslateProvider`/`BaseAIProvider`)
2. `static type` را به `"ai"` یا `"translate"` تنظیم کنید
3. `_getLangCode()` را implement کنید
4. `_batchTranslate()` را implement کنید (یا به پیاده‌سازی ارث‌بری شده از `BaseTranslateProvider`/`BaseAIProvider` تکیه کنید)
5. `_translateSingle` (برای AI) یا `_translateChunk` (برای سنتی) را برای فراخوانی‌های واقعی API پیاده‌سازی کنید
6. هرگز `translate()` را override نکنید
7. همیشه از `rateLimitManager.executeWithRateLimit()` استفاده کنید
8. درخواست‌ها را sequential پردازش کنید (نه `Promise.all()` برای فراخوانی‌های API فردی در یک batch/chunk)
9. Cancellation و error handling را رعایت کنید
10. **Streaming coordination خودکار است** - provider ها نیازی به تغییر برای streaming support ندارند
11. **Dynamic timeout management** توسط UnifiedTranslationCoordinator انجام می‌شود

این راهنما تضمین می‌کند که تمام پرووایدرها با سیستم Rate Limiting، Circuit Breaker، و **Streaming Coordination** یکپارچه کار کنند و مشکلات HTTP 429 و timeout های نامناسب حل شود.