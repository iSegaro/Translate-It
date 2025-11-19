# Proposal: Add Custom Model and API URL Support to Gemini Provider

## Problem
Currently, the Gemini provider only supports predefined models and uses hardcoded API endpoints. Users cannot:
- Use custom Gemini models that are not in the predefined list
- Customize the API endpoint URL for different environments or regions
- Access experimental or beta Gemini models

## Solution
Add custom model support and API URL customization to the Gemini provider, following the exact same pattern implemented for Z.AI provider. This includes:
- Adding "Custom Model" option to the model selection dropdown
- Adding a conditional input field for custom model names
- Adding an API URL customization field
- Maintaining all existing functionality (thinking mode, image translation, etc.)

## Impact
- **User Experience**: Users can now access any Gemini model and customize API endpoints
- **Flexibility**: Support for experimental, regional, or custom Gemini deployments
- **Consistency**: Aligns Gemini provider with other providers (Z.AI, DeepSeek) that support custom configurations
- **Backward Compatibility**: All existing configurations will continue to work unchanged

## Scope
This change affects:
- Gemini provider configuration and model detection logic
- Gemini API settings UI component
- Translation keys for new UI elements
- Default settings initialization

The change maintains full backward compatibility and does not affect other providers.