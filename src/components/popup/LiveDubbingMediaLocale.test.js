import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const localeDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../_locales')
const keys = {
  live_dubbing_media_paused: 'Paused',
  live_dubbing_media_reconnecting: 'Reconnecting…',
  live_dubbing_media_ready: 'Ready',
  live_dubbing_media_playing: 'Running',
  live_dubbing_media_retry_available: 'Retry available',
  live_dubbing_action_retry: 'Retry',
  live_dubbing_action_retrying: 'Retrying…',
  live_dubbing_action_retry_media_aria_label: 'Retry audio playback',
  live_dubbing_media_error_retry_exhausted: 'Audio could not recover. Retry to try again.',
  live_dubbing_media_error_retry_state_unavailable: 'Audio state is unavailable. Retry to try again.',
  live_dubbing_media_error_pause_failed: 'Audio could not be paused. Retry to try again.',
  live_dubbing_media_error_resume_failed: 'Audio could not resume. Retry to try again.',
  live_dubbing_media_error_rotation_failed: 'Audio could not reconnect. Retry to try again.',
  live_dubbing_media_error_generic: 'Audio playback needs attention.'
}

const loadLocale = (locale) => JSON.parse(readFileSync(resolve(localeDir, locale, 'messages.json'), 'utf8'))

describe('live dubbing media locale messages', () => {
  it('provides the UI fallback strings in English and complete native translations', () => {
    const english = loadLocale('en')
    const persian = loadLocale('fa')
    const japanese = loadLocale('ja')

    for (const [key, fallback] of Object.entries(keys)) {
      expect(english[key]?.message).toBe(fallback)
      for (const locale of [persian, japanese]) {
        expect(locale[key]?.message).toEqual(expect.any(String))
        expect(locale[key].message.trim()).not.toBe('')
        expect(locale[key].message).not.toBe(fallback)
      }
      expect(persian[key].message).toMatch(/[\u0600-\u06FF]/)
      expect(persian[key].message).not.toMatch(/\p{Extended_Pictographic}/u)
      expect(japanese[key].message).toMatch(/[\u3040-\u30FF\u4E00-\u9FFF]/)
    }

    expect(english.live_dubbing_media_error_generic.message).not.toMatch(/retry/i)
    for (const key of Object.keys(keys).filter(key => key.startsWith('live_dubbing_media_error_') && key !== 'live_dubbing_media_error_generic')) {
      expect(english[key].message).toMatch(/retry/i)
    }
  })
})
