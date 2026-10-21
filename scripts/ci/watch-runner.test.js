import { EventEmitter } from 'node:events'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { parseWatchArgs, runWatch } from '../dev/watch.mjs'

describe('watch runner', () => {
  it('uses zero by default and accepts separated and equals delay options', () => {
    expect(parseWatchArgs([])).toBe(0)
    expect(parseWatchArgs(['--delay', '30000'])).toBe(30000)
    expect(parseWatchArgs(['--delay=30000'])).toBe(30000)
  })

  it.each([['--delay'], ['--delay='], ['--delay', '-1'], ['--delay=-1'], ['--delay=1.5'], ['--delay=9007199254740992']])(
    'rejects invalid argument sequence %j', (...args) => {
      expect(() => parseWatchArgs(args)).toThrow()
    }
  )

  it('leaves non-wrapper arguments for Vite', () => {
    expect(parseWatchArgs(['--sourcemap', 'hidden'])).toBe(0)
  })

  it.each(['chrome', 'firefox'])('passes delay through the %s plugin child build configs', async browser => {
    const originalEnv = {
      NODE_ENV: process.env.NODE_ENV,
      VITE_WATCH_MODE: process.env.VITE_WATCH_MODE,
      VITE_WATCH_DELAY: process.env.VITE_WATCH_DELAY
    }

    try {
      for (const delay of [0, 30000]) {
        const webExtension = vi.fn(options => ({ name: 'mock-web-extension', options }))
        vi.resetModules()
        vi.doMock('vite-plugin-web-extension', () => ({ default: webExtension }))
        process.env.NODE_ENV = 'development'
        process.env.VITE_WATCH_MODE = 'true'
        process.env.VITE_WATCH_DELAY = String(delay)

        const configUrl = new URL(`../../config/vite/vite.config.${browser}.js`, import.meta.url).href
        const { default: config } = await import(/* @vite-ignore */ configUrl)
        const plugin = config.plugins.find(candidate => candidate.name === 'mock-web-extension')

        expect(config.build.watch.buildDelay).toBe(delay)
        expect(plugin.options.htmlViteConfig.build.watch.buildDelay).toBe(delay)
        expect(plugin.options.scriptViteConfig.build.watch.buildDelay).toBe(delay)
      }
    } finally {
      vi.doUnmock('vite-plugin-web-extension')
      vi.resetModules()
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })

  it('spawns Vite with preserved watch environment and relays signals and exit status', async () => {
    const child = new EventEmitter()
    child.kill = vi.fn()
    const proc = new EventEmitter()
    proc.execPath = '/node'
    proc.env = { KEEP: 'value' }
    const spawnChild = vi.fn(() => child)

    const result = runWatch('chrome', ['--sourcemap', 'hidden', '--delay=30000', '--debug'], { spawnChild, proc })
    const [executable, args, options] = spawnChild.mock.calls[0]
    expect(executable).toBe('/node')
    expect(args).toEqual([
      resolve('node_modules/vite/bin/vite.js'), 'build', '--config', 'config/vite/vite.config.chrome.js', '--watch',
      '--sourcemap', 'hidden', '--debug'
    ])
    expect(options.env).toMatchObject({ KEEP: 'value', NODE_ENV: 'development', VITE_WATCH_MODE: 'true', VITE_WATCH_DELAY: '30000' })

    proc.emit('SIGINT')
    expect(child.kill).toHaveBeenCalledWith('SIGINT')
    child.emit('close', 7, null)
    await expect(result).resolves.toBe(7)
    expect(proc.listenerCount('SIGINT')).toBe(0)
    expect(proc.listenerCount('SIGTERM')).toBe(0)
  })
})
