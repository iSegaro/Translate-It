import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { getPdfPageRootElement } from './pageViewInstance.js'

describe('getPdfPageRootElement', () => {
  it('resolves a raw exposed root element getter', () => {
    const rootEl = document.createElement('article')
    const instance = {
      getRootEl: () => rootEl
    }

    expect(getPdfPageRootElement(instance)).toBe(rootEl)
  })

  it('resolves a Vue ref exposed as rootEl', () => {
    const rootEl = document.createElement('article')
    const instance = {
      rootEl: ref(rootEl)
    }

    expect(getPdfPageRootElement(instance)).toBe(rootEl)
  })

  it('returns the raw root element when exposed directly', () => {
    const rootEl = document.createElement('article')
    const instance = {
      rootEl
    }

    expect(getPdfPageRootElement(instance)).toBe(rootEl)
  })
})
