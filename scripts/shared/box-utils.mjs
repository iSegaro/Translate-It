#!/usr/bin/env node

/**
 * Utility for creating centered console boxes
 */

// Constants for box formatting
const BOX_WIDTH = 66

/**
 * Get visible length of string (accounting for emojis and wide characters)
 */
function getVisibleLength(str) {
  // Emojis and wide characters take 2 visual width but count as 1 in JS length
  const emojiPattern = /[\p{Emoji_Presentation}\p{Emoji}\u200D]+/gu
  const wideCharPattern = /[\u1100-\u115F\u2329-\u232A\u2E80-\u303F\u3040-\u30FF\u3130-\u318F\u3190-\u319F\u31C0-\u31EF\u3200-\u32FF\u3300-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7AF\uD7B0-\uD7FF\uF900-\uFAFF\uFE10-\uFE6B\uFF01-\uFF60\uFFE0-\uFFE6]/gu

  let visibleLength = str.length

  // Note: Modern JavaScript emojis already have length 2, so no extra space needed
  // However, some emojis might display differently in certain terminals
  if (str.includes('🕸')) {
    visibleLength -= 1;  // 🕸 needs 1 less space
  } else if (str.includes('🦊')) {
    visibleLength -= 0;  // 🦊 needs 0 less spaces
  } else if (str.includes('✅')) {
    visibleLength += 1;  // ✅ needs 1 more space
  } else if (str.includes('❌')) {
    visibleLength += 1;  // ❌ needs 1 more space
  }

  return visibleLength
}

/**
 * Create empty box line with borders
 */
function emptyBoxLine() {
  return `║${' '.repeat(BOX_WIDTH - 2)}║`
}

/**
 * Center text within box width
 */
function centerText(str, width = BOX_WIDTH) {
  const visibleLength = getVisibleLength(str)
  // Internal width is BOX_WIDTH - 2 (for the border characters)
  const internalWidth = width - 2
  const paddingNeeded = internalWidth - visibleLength
  const leftPadding = Math.floor(paddingNeeded / 2)
  const rightPadding = paddingNeeded - leftPadding
  return ' '.repeat(Math.max(0, leftPadding)) + str + ' '.repeat(Math.max(0, rightPadding))
}

/**
 * Create a box with centered header
 */
function createBox(headerText) {
  const horizontalLine = '═'.repeat(BOX_WIDTH - 2)
  const lines = [
    `╔${horizontalLine}╗`,
    `║${centerText(headerText)}║`,
    `╚${horizontalLine}╝`
  ]
  return lines.join('\n')
}

/**
 * Create a success box
 */
function createSuccessBox(headerText) {
  const horizontalLine = '═'.repeat(BOX_WIDTH - 2)
  const lines = [
    `╔${horizontalLine}╗`,
    `║${centerText(headerText)}║`,
    `╚${horizontalLine}╝`
  ]
  return lines.join('\n')
}

/**
 * Create an error box
 */
function createErrorBox(headerText) {
  const horizontalLine = '═'.repeat(BOX_WIDTH - 2)
  const lines = [
    `╔${horizontalLine}╗`,
    `║${centerText(headerText)}║`,
    `╚${horizontalLine}╝`
  ]
  return lines.join('\n')
}

export { createBox, createSuccessBox, createErrorBox, centerText, emptyBoxLine, BOX_WIDTH }