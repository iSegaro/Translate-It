# Segment ID-Based Translation System Proposal

## Why
The current translation system processes text segments separately without reliable identification, causing critical issues:
1. **RTL/LTR Direction Problems**: Technical terms like "API" and "Z.ai" display incorrectly in RTL contexts, making translations unreadable
2. **Mapping Loss**: No reliable way to map translations back to original text positions, causing incorrect text placement
3. **Provider Limitations**: Traditional providers (Google, Bing) don't support JSON responses natively, limiting our ability to implement advanced features
4. **User Experience Impact**: Incorrect text direction and placement directly affects the usability of the translation feature

These issues degrade the quality of translations and create inconsistent behavior across different content types and languages.

## Proposed Solution
Implement a segment ID-based translation system with hybrid JSON support that works across all provider types.

## Capabilities

### 1. **Segment Identification System**
- Assign unique IDs to each extracted text segment
- Maintain mapping between IDs and original DOM elements
- Enable reliable translation application regardless of response format

### 2. **Hybrid JSON Support**
- Smart JSON mode detection based on provider type
- Fallback to array format for traditional providers
- Unified response processing for all provider types

### 3. **RTL/LTR Direction Fix**
- Proper handling of technical terms in RTL contexts
- Unicode control character insertion for LTR terms
- CSS isolation for mixed content display

## Implementation Approach

### Phase 1: Text Extraction Enhancement
- Modify `collectTextNodes` to assign unique segment IDs
- Preserve original DOM element references
- Create segment metadata structure

### Phase 2: Provider Communication
- Implement smart JSON mode detection
- Create hybrid request/response handling
- Add graceful fallback mechanisms

### Phase 3: Translation Application
- ID-based translation application
- Proper RTL/LTR handling with Unicode controls
- Nested translation container prevention

## Benefits
- **Reliable**: Each segment has unique identification
- **Compatible**: Works with all existing providers
- **Flexible**: Supports both JSON and array responses
- **Fixes RTL Issues**: Proper bidirectional text handling
- **Maintainable**: Clear separation of concerns
- **Backward Compatible**: No breaking changes to existing functionality

## Trade-offs
- **Slightly Increased Memory**: Storing segment IDs and metadata
- **Implementation Complexity**: Requires changes across multiple layers
- **Testing Requirements**: Need thorough testing across all providers

## Success Criteria
1. All technical terms display correctly in RTL contexts
2. Translation segments can be reliably mapped back to original positions
3. All providers (AI and traditional) work seamlessly
4. No performance degradation
5. Existing functionality remains intact