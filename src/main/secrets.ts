import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import type { SecretKey, SecretsStatus } from '../shared/types'
import { readJson, writeJson } from './jsonFile'

// Tokens are encrypted with Electron's safeStorage; on GNOME the key lives in the GNOME keyring.
// The file only ever holds ciphertext (base64), and decrypted values never leave the main process.
type Store = Partial<Record<SecretKey, string>>

const file = (): string => join(app.getPath('userData'), 'secrets.json')

function load(): Store {
  const data = readJson(file())
  return data && typeof data === 'object' ? (data as Store) : {}
}

export function secretsStatus(): SecretsStatus {
  const store = load()
  const backend = process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : 'os'
  return {
    tissToken: Boolean(store.tissToken),
    tuwelToken: Boolean(store.tuwelToken),
    backend,
    secure: safeStorage.isEncryptionAvailable() && backend !== 'basic_text'
  }
}

export function setSecret(key: SecretKey, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Verschlüsselung ist nicht verfügbar – ist der GNOME-Schlüsselbund entsperrt?')
  }
  const store = load()
  store[key] = safeStorage.encryptString(value).toString('base64')
  writeJson(file(), store, 0o600)
}

export function getSecret(key: SecretKey): string | null {
  const encrypted = load()[key]
  if (!encrypted) return null
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    return null
  }
}

export function clearSecret(key: SecretKey): void {
  const store = load()
  delete store[key]
  writeJson(file(), store, 0o600)
}
