import { test, expect } from '@playwright/test'

test.describe('Sidepanel Extension', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to sidepanel page
    await page.goto('/sidepanel.html')
  })

  test('should display sidepanel interface', async ({ page }) => {
    // Check if sidepanel loads correctly
    await expect(page.locator('[data-testid="sidepanel-container"]')).toBeVisible()
    
    // Check for navigation tabs
    await expect(page.locator('[data-testid="translate-tab"]')).toBeVisible()
    await expect(page.locator('[data-testid="capture-tab"]')).toBeVisible()
    await expect(page.locator('[data-testid="history-tab"]')).toBeVisible()
  })

  test('should switch between tabs', async ({ page }) => {
    // Click on capture tab
    await page.locator('[data-testid="capture-tab"]').click()
    
    // Should show capture content
    await expect(page.locator('[data-testid="capture-content"]')).toBeVisible()
    
    // Click on history tab
    await page.locator('[data-testid="history-tab"]').click()
    
    // Should show history content
    await expect(page.locator('[data-testid="history-content"]')).toBeVisible()
  })

  test('should perform screen capture flow', async ({ page }) => {
    // Navigate to capture tab
    await page.locator('[data-testid="capture-tab"]').click()
    
    // Click start capture button
    const captureButton = page.locator('[data-testid="start-capture-button"]')
    await expect(captureButton).toBeVisible()
    await captureButton.click()
    
    // Should show capture instructions
    const instructions = page.locator('[data-testid="capture-instructions"]')
    await expect(instructions).toBeVisible()
  })

  test('should show translation history with pagination', async ({ page }) => {
    // Navigate to history tab
    await page.locator('[data-testid="history-tab"]').click()
    
    // Should show history list
    const historyList = page.locator('[data-testid="history-list"]')
    await expect(historyList).toBeVisible()
    
    // Check for pagination controls if history has many items
    const paginationExists = await page.locator('[data-testid="history-pagination"]').isVisible()
    if (paginationExists) {
      await expect(page.locator('[data-testid="prev-page"]')).toBeVisible()
      await expect(page.locator('[data-testid="next-page"]')).toBeVisible()
    }
  })

  test('should search translation history', async ({ page }) => {
    // Navigate to history tab
    await page.locator('[data-testid="history-tab"]').click()
    
    // Enter search query
    const searchInput = page.locator('[data-testid="history-search"]')
    await expect(searchInput).toBeVisible()
    await searchInput.fill('hello')
    
    // Should filter results
    await page.waitForTimeout(500) // Wait for debounce
    
    // Check that results are filtered
    const historyItems = page.locator('[data-testid="history-item"]')
    const itemCount = await historyItems.count()
    // If there are items, they should contain the search term
    if (itemCount > 0) {
      const firstItem = historyItems.first()
      const itemText = await firstItem.textContent()
      expect(itemText.toLowerCase()).toContain('hello')
    }
  })

  test('should export translation history', async ({ page }) => {
    // Navigate to history tab
    await page.locator('[data-testid="history-tab"]').click()
    
    // Click export button
    const exportButton = page.locator('[data-testid="export-history"]')
    if (await exportButton.isVisible()) {
      // Mock download
      const downloadPromise = page.waitForEvent('download')
      await exportButton.click()
      
      const download = await downloadPromise
      expect(download.suggestedFilename()).toContain('translation-history')
    }
  })

  test('should handle TTS functionality', async ({ page }) => {
    // Navigate to translate tab
    await page.locator('[data-testid="translate-tab"]').click()
    
    // Enter and translate text
    await page.locator('[data-testid="source-input"]').fill('Hello world')
    await page.locator('[data-testid="translate-button"]').click()
    
    // Wait for translation
    await page.locator('[data-testid="translation-result"]').waitFor()
    
    // Click TTS button
    const ttsButton = page.locator('[data-testid="tts-button"]')
    if (await ttsButton.isVisible()) {
      await ttsButton.click()
      
      // Should show TTS controls
      const ttsControls = page.locator('[data-testid="tts-controls"]')
      await expect(ttsControls).toBeVisible()
    }
  })
})