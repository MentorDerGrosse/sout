import { app } from 'electron'
import { join } from 'node:path'
import { DARK_PALETTES, LIGHT_PALETTES, THEME_MODES } from '../shared/themes'
import { REMINDER_CHOICES, type Settings } from '../shared/types'
import { readJson, writeJson } from './jsonFile'

const DEFAULTS: Settings = {
  startHiddenOnAutostart: true,
  miniOnClose: true,
  closeHintShown: false,
  reminders: [1440, 180],
  notifyOpening: true,
  notesDir: '',
  notifyChanges: true,
  notifyNewTasks: true,
  notifyGrades: true,
  notifyAnnouncements: true,
  loadMaterials: true,
  notifyExamRegistration: true,
  themeMode: 'system',
  lightPalette: 'standard',
  darkPalette: 'standard'
}

/** Settings that only take one of a few values. */
const CHOICES: Partial<Record<keyof Settings, string[]>> = {
  themeMode: THEME_MODES.map((mode) => mode.id),
  lightPalette: LIGHT_PALETTES.map((palette) => palette.id),
  darkPalette: DARK_PALETTES.map((palette) => palette.id)
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
      const choices = CHOICES[key as keyof Settings]
      if (Array.isArray(fallback)) {
        if (Array.isArray(value)) result[key] = value.filter((item) => REMINDER_CHOICES.some((choice) => choice.minutes === item))
      } else if (choices) {
        if (typeof value === 'string' && choices.includes(value)) result[key] = value
      } else if (typeof value === typeof fallback) {
        result[key] = value
      }
    }
  }
  return result as Partial<Settings>
}
