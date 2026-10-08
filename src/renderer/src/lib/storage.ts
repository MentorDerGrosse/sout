import { useEffect, useState } from 'react'

// Small per-window preferences (widths, collapsed parts, view modes) in localStorage. Losing them
// is harmless, so any storage error just means the default is used.

export function remembered<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : (JSON.parse(value) as T)
  } catch {
    return fallback
  }
}

export function remember(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Not important enough to bother anyone.
  }
}

/** useState that survives a restart. */
export function useRemembered<T>(key: string, fallback: T): [T, (value: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => remembered(key, fallback))
  useEffect(() => remember(key, value), [key, value])
  return [value, setValue]
}

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))
