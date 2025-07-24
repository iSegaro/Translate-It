import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useExtensionAPI } from '../useExtensionAPI'

describe('useExtensionAPI', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks()
  })

  it('sends message successfully', async () => {
    const mockResponse = { success: true, data: 'test result' }
    global.browser.runtime.sendMessage.mockResolvedValue(mockResponse)

    const { sendMessage } = useExtensionAPI()
    
    const result = await sendMessage('TEST_ACTION', { test: 'data' })
    
    expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'TEST_ACTION',
      data: { test: 'data' },
      source: 'vue-app',
      timestamp: expect.any(Number)
    })
    expect(result).toEqual(mockResponse)
  })

  it('handles message sending errors', async () => {
    global.browser.runtime.sendMessage.mockRejectedValue(new Error('Connection failed'))

    const { sendMessage } = useExtensionAPI()
    
    await expect(sendMessage('TEST_ACTION')).rejects.toThrow('Connection failed')
  })

  it('handles unsuccessful response', async () => {
    const mockResponse = { success: false, error: 'Server error' }
    global.browser.runtime.sendMessage.mockResolvedValue(mockResponse)

    const { sendMessage } = useExtensionAPI()
    
    await expect(sendMessage('TEST_ACTION')).rejects.toThrow('Server error')
  })

  it('sends message to content script', async () => {
    const mockTab = { id: 123 }
    global.browser.tabs.query.mockResolvedValue([mockTab])
    global.browser.tabs.sendMessage.mockResolvedValue({ success: true })

    const { sendToContentScript } = useExtensionAPI()
    
    const result = await sendToContentScript('CONTENT_ACTION', { test: 'data' })
    
    expect(global.browser.tabs.query).toHaveBeenCalledWith({ 
      active: true, 
      currentWindow: true 
    })
    expect(global.browser.tabs.sendMessage).toHaveBeenCalledWith(123, {
      action: 'CONTENT_ACTION',
      data: { test: 'data' },
      source: 'vue-app',
      timestamp: expect.any(Number)
    })
    expect(result).toEqual({ success: true })
  })

  it('gets current tab', async () => {
    const mockTab = { 
      id: 123, 
      url: 'https://example.com',
      title: 'Example'
    }
    global.browser.tabs.query.mockResolvedValue([mockTab])

    const { getCurrentTab } = useExtensionAPI()
    
    const result = await getCurrentTab()
    
    expect(global.browser.tabs.query).toHaveBeenCalledWith({
      active: true,
      currentWindow: true
    })
    expect(result).toEqual(mockTab)
  })
})