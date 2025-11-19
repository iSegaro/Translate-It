## Context
The Translate-It extension currently supports 11 translation providers including AI providers like OpenAI, Gemini, DeepSeek, and traditional providers like Google Translate and Yandex. The system uses a hierarchical provider architecture with BaseProvider, BaseAIProvider, and BaseTranslateProvider classes. Z.AI (智谱AI) offers GLM models that can provide additional translation capabilities with OpenAI-compatible API format.

## Goals / Non-Goals
- Goals:
  - Add support for Z.AI GLM models (ChatGLM3-6B, ChatGLM4)
  - Integrate seamlessly with existing provider architecture
  - Provide proper rate limiting and error handling
  - Support model selection and configuration
- Non-Goals:
  - Add image translation capabilities (requires investigation of vision models)
  - Create custom UI components specific to ZAI

## Decisions
- Decision: Use OpenAI-compatible API format
  - Rationale: Z.AI follows standard OpenAI API patterns, reducing implementation complexity
- Decision: Extend BaseAIProvider instead of BaseProvider
  - Rationale: ZAI GLM models are AI-based and benefit from AI provider features like smart batching
- Decision: Support ChatGLM3-6B and ChatGLM4 models initially
  - Rationale: These are the most commonly used GLM models with good translation capabilities
- Decision: Use Gemini-like rate limiting configuration
  - Rationale: Z.AI models behave similar to Gemini for streaming/chunking behavior
- Decision: Support chunk-based streaming like Gemini
  - Rationale: Z.AI supports chunk translation for large texts, similar to Gemini implementation
- Decision: Use standard language codes like Gemini
  - Rationale: Z.AI uses standard language codes without special mapping requirements

## Risks / Trade-offs
- API Documentation Limited → Use OpenAI-compatible format with fallback error handling
- Rate Limiting Assumptions → Use Gemini configuration as baseline, adjust as needed
- Model Capability Variations → Allow model selection with capability detection

## Migration Plan
1. Provider Implementation → Create ZAIGLM.js with BaseAIProvider extension
2. Configuration Setup → Add provider settings and rate limiting
3. Registration → Add to provider registry with lazy loading
4. Testing → Verify integration with existing translation workflows
5. Rollback → Provider can be safely removed if API issues arise

## Open Questions
- Are there any GLM-specific features that could enhance translation quality?
  - **Answer:** No, Z.AI GLM models will use standard translation features like other AI providers