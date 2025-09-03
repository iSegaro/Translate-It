# Translation Provider Implementation Guide

## Overview

این مستند راهنمای کاملی برای پیاده‌سازی پرووایدرهای ترجمه در سیستم Translate-It ارائه می‌دهد. تمام پرووایدرها باید از `BaseProvider` ارث‌بری کرده و الگوی Rate Limiting و Circuit Breaker را رعایت کنند.

## Architecture Overview

سیستم شامل این اجزا است:
- **BaseProvider**: کلاس پایه برای همه پرووایدرها
- **RateLimitManager**: مدیریت محدودیت نرخ درخواست
- **QueueManager**: مدیریت صف و retry logic
- **TranslationEngine**: هماهنگی کلی ترجمه

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
پردازش دسته‌ای متن‌ها با Rate Limiting

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
      const result = await rateLimitManager.executeWithRateLimit(
        this.providerName,
        () => this._translateSingle(texts[i], sl, tl, translateMode),
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
  // This bypasses rate limiting!
}
```

✅ **CORRECT** - از inherited translate استفاده کنید:
```javascript
// BaseProvider.translate() automatically handles:
// - Language swapping
// - JSON mode detection
// - Rate limiting integration
// - Error management
```

## Provider Types & Patterns

### 1. **Translation Services (Google, Bing, Yandex)**

```javascript
export class TranslationServiceProvider extends BaseProvider {
  static type = "translate";
  static reliableJsonMode = true; // Can handle JSON reliably
  static supportsDictionary = true; // Supports dictionary mode
  static CHAR_LIMIT = 5000; // Character limit per request
  
  _getLangCode(lang) {
    // Map to provider's language codes
    return this.langCodeMap[lang] || lang;
  }
  
  async _batchTranslate(texts, sl, tl, translateMode, engine, messageId, abortController) {
    // Use rateLimitManager.executeWithRateLimit() for each batch
    // Handle chunking based on CHAR_LIMIT
  }
}
```

### 2. **AI Services (OpenAI, Gemini, DeepSeek)**

```javascript
export class AIServiceProvider extends BaseProvider {
  static type = "ai";
  static reliableJsonMode = false; // AI responses can be unpredictable
  static supportsDictionary = true;
  
  _getLangCode(lang) {
    // AI services usually work with full language names
    return lang || "auto";
  }
  
  async _batchTranslate(texts, sl, tl, translateMode, engine, messageId, abortController) {
    // AI services: process each text individually
    // Use rateLimitManager.executeWithRateLimit() for each call
  }
  
  // Helper method for single translation
  async _translateSingle(text, sourceLang, targetLang, translateMode) {
    // Implement actual API call logic here
  }
}
```

## Rate Limiting Integration

### Current Configuration

```javascript
// In RateLimitManager.js
const PROVIDER_CONFIGS = {
  'GoogleTranslate': { maxConcurrent: 2, delayBetweenRequests: 100 },
  'BingTranslate': { maxConcurrent: 2, delayBetweenRequests: 200 },
  'Gemini': { maxConcurrent: 2, delayBetweenRequests: 600 },
  'OpenAI': { maxConcurrent: 2, delayBetweenRequests: 500 },
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
export class GeminiProvider extends BaseProvider {
  static type = "ai";
  static reliableJsonMode = false;
  
  // ✅ Correct: Implement required methods only
  _getLangCode(lang) {
    return lang || "auto";
  }
  
  async _batchTranslate(texts, sl, tl, translateMode, engine, messageId, abortController) {
    const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
    
    const results = [];
    for (let i = 0; i < texts.length; i++) {
      if (engine && engine.isCancelled(messageId)) {
        throw new Error('Translation cancelled');
      }
      
      try {
        const result = await rateLimitManager.executeWithRateLimit(
          this.providerName,
          () => this._translateSingle(texts[i], sl, tl, translateMode),
          `segment-${i + 1}/${texts.length}`
        );
        results.push(result || texts[i]);
      } catch (error) {
        results.push(texts[i]);
      }
    }
    return results;
  }
  
  async _translateSingle(text, sourceLang, targetLang, translateMode) {
    // Actual API implementation
  }
}
```

### Example 2: Translation Service Provider

```javascript
export class YandexTranslateProvider extends BaseProvider {
  static type = "translate";
  static reliableJsonMode = true;
  static CHAR_LIMIT = 10000;
  
  _getLangCode(lang) {
    return this.yandexLangCode[lang] || lang;
  }
  
  async _batchTranslate(texts, sl, tl, translateMode, engine, messageId, abortController) {
    const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
    
    // Create chunks based on character limits
    const chunks = this._createChunks(texts);
    const results = new Array(texts.length);
    
    for (const chunk of chunks) {
      if (engine && engine.isCancelled(messageId)) {
        throw new Error('Translation cancelled');
      }
      
      try {
        const chunkResults = await rateLimitManager.executeWithRateLimit(
          this.providerName,
          () => this._translateChunk(chunk, sl, tl),
          `chunk-${chunk.indices.join(',')}`
        );
        
        // Map results back to original positions
        chunk.forEach((item, i) => {
          results[item.originalIndex] = chunkResults[i];
        });
      } catch (error) {
        // Fallback to original texts
        chunk.forEach(item => {
          results[item.originalIndex] = item.text;
        });
      }
    }
    
    return results;
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

- [ ] Extends BaseProvider
- [ ] Implements `_getLangCode(lang)`
- [ ] Implements `_batchTranslate(texts, sl, tl, translateMode, engine, messageId, abortController)`
- [ ] Uses `rateLimitManager.executeWithRateLimit()` for all API calls
- [ ] Does NOT override `translate()` method
- [ ] Handles cancellation via `engine.isCancelled(messageId)`
- [ ] Provides fallback to original text on errors
- [ ] Processes requests sequentially (no Promise.all)
- [ ] Has proper error handling and logging
- [ ] Added to RateLimitManager configuration

## Rate Limiting Best Practices

1. **Sequential Processing**: Never use `Promise.all()` for API calls
2. **Cancellation Support**: Always check `engine.isCancelled(messageId)`
3. **Error Handling**: Fallback to original text on failures
4. **Proper Context**: Provide meaningful context strings to `executeWithRateLimit()`
5. **Chunking**: Respect provider character limits
6. **Logging**: Use consistent logging patterns

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
1. همه پرووایدرها باید از BaseProvider ارث‌بری کنند
2. تنها `_getLangCode()` و `_batchTranslate()` را implement کنید
3. هرگز `translate()` را override نکنید  
4. همیشه از `rateLimitManager.executeWithRateLimit()` استفاده کنید
5. درخواست‌ها را sequential پردازش کنید (نه همزمان)
6. Cancellation و error handling را رعایت کنید

این راهنما تضمین می‌کند که تمام پرووایدرها با سیستم Rate Limiting و Circuit Breaker یکپارچه کار کنند و مشکلات HTTP 429 حل شود.