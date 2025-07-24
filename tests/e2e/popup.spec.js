import { test, expect } from '@playwright/test'

test.describe('Popup Extension', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to popup page 
    await page.goto('/popup.html')
  })

  test('should display popup interface', async ({ page }) => {
    // Check if popup loads correctly
    await expect(page.locator('[data-testid="popup-container"]')).toBeVisible()
    
    // Check for main translation elements
    await expect(page.locator('[data-testid="source-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="target-language-select"]')).toBeVisible()
    await expect(page.locator('[data-testid="translate-button"]')).toBeVisible()
  })

  test('should translate text successfully', async ({ page }) => {
    // Enter text to translate
    const sourceInput = page.locator('[data-testid="source-input"]')
    await sourceInput.fill('Hello world')
    
    // Select target language (Persian)
    const languageSelect = page.locator('[data-testid="target-language-select"]')
    await languageSelect.selectOption('fa')
    
    // Click translate button
    const translateButton = page.locator('[data-testid="translate-button"]')
    await translateButton.click()
    
    // Wait for translation result
    const translationResult = page.locator('[data-testid="translation-result"]')
    await expect(translationResult).toBeVisible({ timeout: 10000 })
    
    // Verify translation appears
    const resultText = await translationResult.textContent()
    expect(resultText).toBeTruthy()
    expect(resultText.length).toBeGreaterThan(0)
  })

  test('should show provider selection', async ({ page }) => {
    // Check provider dropdown exists
    const providerSelect = page.locator('[data-testid="provider-select"]')
    await expect(providerSelect).toBeVisible()
    
    // Should have multiple provider options
    const options = await providerSelect.locator('option').count()
    expect(options).toBeGreaterThan(1)
  })

  test('should handle translation errors gracefully', async ({ page }) => {
    // Mock translation failure by selecting invalid provider
    await page.route('**/translate', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Translation failed' })
      })
    })
    
    // Try to translate
    await page.locator('[data-testid="source-input"]').fill('Test text')
    await page.locator('[data-testid="translate-button"]').click()
    
    // Should show error message
    const errorMessage = page.locator('[data-testid="error-message"]')
    await expect(errorMessage).toBeVisible({ timeout: 5000 })
  })

  test('should copy translation to clipboard', async ({ page }) => {
    // Mock clipboard API
    await page.addInitScript(() => {
      window.navigator.clipboard = {
        writeText: text => Promise.resolve(text)
      }
    })
    
    // Enter and translate text
    await page.locator('[data-testid="source-input"]').fill('Hello')
    await page.locator('[data-testid="translate-button"]').click()
    
    // Wait for translation and click copy
    await page.locator('[data-testid="translation-result"]').waitFor()
    await page.locator('[data-testid="copy-button"]').click()
    
    // Should show copy confirmation
    const copyNotification = page.locator('[data-testid="copy-notification"]')
    await expect(copyNotification).toBeVisible()
  })

  test('should save translation to history', async ({ page }) => {
    // Translate text
    await page.locator('[data-testid="source-input"]').fill('Hello world')
    await page.locator('[data-testid="translate-button"]').click()
    
    // Wait for translation
    await page.locator('[data-testid="translation-result"]').waitFor()
    
    // Open history panel
    await page.locator('[data-testid="history-button"]').click()
    
    // Check if translation appears in history
    const historyPanel = page.locator('[data-testid="history-panel"]')
    await expect(historyPanel).toBeVisible()
    
    const historyItems = page.locator('[data-testid="history-item"]')
    await expect(historyItems.first()).toBeVisible()
  })
})