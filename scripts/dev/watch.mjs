import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

function parseWatchOptions(args) {
  let delay = 0
  let hasDelay = false
  const viteArgs = []

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--delay' || arg.startsWith('--delay=')) {
      if (hasDelay) throw new Error('--delay may only be specified once')
      hasDelay = true
      const value = arg === '--delay' ? args[++i] : arg.slice('--delay='.length)
      if (value === undefined || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new Error('--delay requires a non-negative integer number of milliseconds')
      }
      delay = Number(value)
    } else {
      viteArgs.push(arg)
    }
  }

  return { delay, viteArgs }
}

export function parseWatchArgs(args) {
  return parseWatchOptions(args).delay
}

export function runWatch(browser, args, { spawnChild = spawn, proc = process } = {}) {
  if (!['chrome', 'firefox'].includes(browser)) throw new Error(`Unknown browser: ${browser}`)
  const { delay, viteArgs } = parseWatchOptions(args)
  const config = `config/vite/vite.config.${browser}.js`
  const vite = resolve('node_modules/vite/bin/vite.js')
  const child = spawnChild(proc.execPath, [vite, 'build', '--config', config, '--watch', ...viteArgs], {
    stdio: 'inherit',
    env: { ...proc.env, NODE_ENV: 'development', VITE_WATCH_MODE: 'true', VITE_WATCH_DELAY: String(delay) }
  })

  let receivedSignal
  const relay = signal => {
    receivedSignal = signal
    child.kill(signal)
  }
  const onInterrupt = () => relay('SIGINT')
  const onTerminate = () => relay('SIGTERM')
  proc.on('SIGINT', onInterrupt)
  proc.on('SIGTERM', onTerminate)

  return new Promise(resolveExit => {
    child.once('error', error => {
      proc.off('SIGINT', onInterrupt)
      proc.off('SIGTERM', onTerminate)
      console.error(`Failed to start Vite: ${error.message}`)
      resolveExit(1)
    })
    child.once('close', (code, signal) => {
      proc.off('SIGINT', onInterrupt)
      proc.off('SIGTERM', onTerminate)
      resolveExit(code ?? (signal || receivedSignal ? 1 : 0))
    })
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const exitCode = await runWatch(process.argv[2], process.argv.slice(3))
    process.exitCode = exitCode
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
