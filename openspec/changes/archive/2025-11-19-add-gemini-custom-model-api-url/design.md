# Design: Gemini Custom Model and API URL Support

## Architecture

### Current Gemini Provider Architecture
The Gemini provider currently:
- Uses predefined models from `CONFIG.GEMINI_MODELS` array
- Hardcodes API endpoints in model configuration
- Has partial custom URL support (only when `geminiModel === "custom"`)
- Follows BaseAIProvider pattern with streaming and image support

### New Architecture Design

#### Custom Model Detection Pattern
Following the Z.AI implementation pattern:
```javascript
const isCustomModel = !CONFIG.GEMINI_MODELS?.some(model => model.value === geminiModel && model.value !== 'custom');
const actualModel = geminiModel || 'gemini-2.5-flash';
```

#### API URL Handling Strategy
- **Predefined Models**: Continue using hardcoded URLs from model config
- **Custom Models**: Use configurable API URL from settings
- **Fallback**: Use default Gemini endpoint if custom URL not provided

#### UI State Management Pattern
Implement smart dropdown vs stored value tracking:
- `selectedModelOption`: Tracks dropdown selection state
- `geminiApiModel`: Actual stored model value
- Conditional rendering for custom model input field
- Independent API URL field

## Implementation Details

### Configuration Strategy
1. **Models Array**: Add `{ value: "custom", name: "Custom Model" }` to `GEMINI_MODELS`
2. **API URL Storage**: Add `GEMINI_API_URL` config property
3. **Backward Compatibility**: No breaking changes to existing config

### Provider Logic Updates
1. **Custom Model Detection**: Enhanced `_getConfig()` method
2. **URL Resolution**: Smart fallback logic for API endpoints
3. **Validation**: Maintain existing BaseAIProvider validation

### UI Component Structure
1. **Model Selection**: Dropdown with custom option
2. **Custom Model Field**: Conditional text input
3. **API URL Field**: Always visible URL customization input
4. **Styling**: Consistent with existing provider settings

### Translation Keys Structure
Follow existing pattern:
- Field labels and placeholders
- Help text and descriptions
- Consistent naming with other providers

## Trade-offs and Decisions

### Single API URL Field
**Decision**: Use single `GEMINI_API_URL` field instead of per-model URLs
**Rationale**:
- Simpler user experience
- Matches Z.AI pattern
- Most users need only one custom endpoint
- Reduces configuration complexity

### Custom Model Storage
**Decision**: Store custom model name directly in `GEMINI_MODEL` config
**Rationale**:
- Consistent with Z.AI implementation
- No need for separate `GEMINI_CUSTOM_MODEL` field
- Cleaner configuration schema
- Easier migration and validation

### Conditional Field Display
**Decision**: Show custom model input only when "Custom Model" selected
**Rationale**:
- Reduces UI clutter
- Follows progressive disclosure pattern
- Matches existing provider implementations
- Better user experience

## Dependencies and Constraints

### Dependencies
- Existing BaseAIProvider architecture
- Current settings store implementation
- Translation system structure

### Constraints
- Must maintain backward compatibility
- Cannot break existing model configurations
- Must preserve thinking mode functionality
- Cannot affect other providers

### Performance Considerations
- Minimal impact on loading time
- No additional API calls for configuration
- Efficient conditional rendering in UI

## Security Considerations
- API URLs validated for proper format
- Custom model names sanitized
- No injection vectors in input fields
- Secure storage of sensitive configuration