import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { SHA256_PATTERN } from '../schemas/index.js'

export function isValidContentHash(value) {
  return typeof value === 'string' && new RegExp(SHA256_PATTERN).test(value)
}

export async function calculateFileContentHash(filePath) {
  const content = await readFile(filePath)
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

export async function verifyFileContentHash(filePath, expectedHash) {
  const actualHash = await calculateFileContentHash(filePath)
  return {
    valid: actualHash === expectedHash,
    expectedHash,
    actualHash
  }
}
