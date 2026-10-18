import { ZipArchive } from 'archiver'
import { randomUUID } from 'node:crypto'
import fs from 'fs'
import path from 'path'

export async function createBrowserZip(buildDir, zipPath) {
  const temporaryZipPath = path.join(
    path.dirname(zipPath),
    `.${path.basename(zipPath)}.${randomUUID()}.tmp`,
  )
  const archive = new ZipArchive({ zlib: { level: 9 } })
  const output = fs.createWriteStream(temporaryZipPath, { flags: 'wx' })

  try {
    await new Promise((resolve, reject) => {
      let finalized = false
      let closed = false
      let settled = false

      const fail = (error) => {
        if (settled) return
        settled = true
        if (closed) reject(error)
        else output.once('close', () => reject(error))
        try {
          archive.abort()
        } catch {}
        if (!closed) output.destroy()
      }
      const completeIfReady = () => {
        if (finalized && closed && !settled) {
          settled = true
          resolve()
        }
      }

      output.on('close', () => {
        closed = true
        completeIfReady()
      })
      output.on('error', fail)
      archive.on('error', fail)
      archive.on('warning', fail)

      try {
        archive.pipe(output)
        archive.directory(buildDir, false)
        archive.finalize().then(
          () => {
            finalized = true
            completeIfReady()
          },
          fail,
        )
      } catch (error) {
        fail(error)
      }
    })
    await fs.promises.rename(temporaryZipPath, zipPath)
  } catch (error) {
    await fs.promises.rm(temporaryZipPath, { force: true })
    throw error
  }
}
