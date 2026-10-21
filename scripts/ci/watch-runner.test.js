import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { parseWatchArgs, runWatch } from '../dev/watch.mjs'

describe('watch runner', () => {
  it('uses zero by default and accepts separated and equals delay options', () => {
    expect(parseWatchArgs([])).toBe(0)
    expect(parseWatchArgs(['--delay', '30000'])).toBe(30000)
    expect(parseWatchArgs(['--delay=30000'])).toBe(30000)
  })

  it.each([['--delay'], ['--delay='], ['--delay', '-1'], ['--delay=-1'], ['--delay=1.5'], ['--delay=9007199254740992'], ['--other']])(
    'rejects invalid argument sequence %j', (...args) => {
      expect(() => parseWatchArgs(args)).toThrow()
    }
  )

  it.each(['chrome', 'firefox'])('passes delay through the %s plugin child build configs', async browser => {
    const config = await readFile(resolve(import.meta.dirname, `../../config/vite/vite.config.${browser}.js`), 'utf8')
    expect(config.match(/buildDelay: watchDelay/g)).toHaveLength(3)
    expect(config).toContain('htmlViteConfig:')
    expect(config).toContain('scriptViteConfig:')
  })

  it('spawns Vite with preserved watch environment and relays signals and exit status', async () => {
    const child = new EventEmitter()
    child.kill = vi.fn()
    const proc = new EventEmitter()
    proc.execPath = '/node'
    proc.env = { KEEP: 'value' }
    const spawnChild = vi.fn(() => child)

    const result = runWatch('chrome', ['--delay=30000'], { spawnChild, proc })
    const [executable, args, options] = spawnChild.mock.calls[0]
    expect(executable).toBe('/node')
    expect(args).toEqual(expect.arrayContaining(['build', '--config', 'config/vite/vite.config.chrome.js', '--watch']))
    expect(options.env).toMatchObject({ KEEP: 'value', NODE_ENV: 'development', VITE_WATCH_MODE: 'true', VITE_WATCH_DELAY: '30000' })

    proc.emit('SIGINT')
    expect(child.kill).toHaveBeenCalledWith('SIGINT')
    child.emit('close', 7, null)
    await expect(result).resolves.toBe(7)
    expect(proc.listenerCount('SIGINT')).toBe(0)
    expect(proc.listenerCount('SIGTERM')).toBe(0)
  })
})
