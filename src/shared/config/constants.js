/**
 * DEPRECATION NOTICE & ARCHITECTURAL BRIDGE
 * 
 * WHY THIS FILE EXISTS:
 * This file serves as a backward-compatibility bridge after the constants refactoring.
 * To improve maintainability and scalability, constants have been moved to a modular 
 * structure under `src/shared/constants/`.
 * 
 * FOR DEVELOPERS:
 * 1. DO NOT add new constants to this file. Add them to the appropriate file in `src/shared/constants/`.
 * 2. When modifying existing code, please update imports to point directly to:
 *    - `@/shared/constants/index.js` (for general use)
 *    - Specific modules like `@/shared/constants/tts.js` (for better Tree Shaking).
 * 3. This file should eventually be removed once all project imports are updated.
 */

export * from '../constants/index.js';
