import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

/** Writes to a temp file first, so a crash never leaves a half-written file behind. */
export function writeJson(path: string, data: unknown, mode = 0o644): void {
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.tmp`
  writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { mode })
  renameSync(temp, path)
}
