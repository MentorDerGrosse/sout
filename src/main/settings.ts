import { app } from 'electron'
import { join } from 'node:path'
import { REMINDER_CHOICES, type Settings } from '../shared/types'
import { readJson, writeJson } from './jsonFile'

const DEFAULTS: Settings = {
  startHiddenOnAutostart: true,
  closeHintShown: false,
  reminders: [1440, 180],
  notifyOpening: true
}

let current: Settings | null = null

const file = (): string => join(app.getPath('userData'), 'settings.json')

export function getSettings(): Settings {
  current ??= { ...DEFAULTS, ...sanitize(readJson(file())) }
  return { ...current }
}

export function updateSettings(patch: unknown): Settings {
  current = { ...getSettings(), ...sanitize(patch) }
  writeJson(file(), current)
  return { ...current }
}

/** Keeps only known keys with the right type, whatever the file or the UI sends. */
function sanitize(input: unknown): Partial<Settings> {
  const result: Record<string, unknown> = {}
  if (input && typeof input === 'object') {
    for (const [key, fallback] of Object.entries(DEFAULTS)) {
      const value = (input as Record<string, unknown>)[key]
      if (Array.isArray(fallback)) {
        if (Array.isArray(value)) result[key] = value.filter((item) => REMINDER_CHOICES.some((choice) => choice.minutes === item))
      } else if (typeof value === typeof fallback) {
        result[key] = value
      }
    }
  }
  return result as Partial<Settings>
}
