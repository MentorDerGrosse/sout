// Colour schemes for sout: light or dark (or as the system says), and for each a palette.
// The colours themselves are CSS variables in styles.css; here are the names and what the main
// process needs before a page has loaded.

export type ThemeMode = 'system' | 'light' | 'dark'

export const THEME_MODES: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'Wie das System' },
  { id: 'light', label: 'Hell' },
  { id: 'dark', label: 'Dunkel' }
]

export interface Palette {
  id: string
  label: string
  /** Where the colours come from. */
  hint: string
  /** Window background while the page loads. */
  background: string
  /** Preview in the settings: page, card, accent, text. */
  swatch: [string, string, string, string]
}

export const LIGHT_PALETTES: Palette[] = [
  { id: 'standard', label: 'Standard', hint: 'Hellgrau und Blau', background: '#f5f6f8', swatch: ['#f5f6f8', '#ffffff', '#2f6fe0', '#1c1e22'] },
  { id: 'latte', label: 'Catppuccin Latte', hint: 'Pastell mit Lila', background: '#e6e9ef', swatch: ['#e6e9ef', '#eff1f5', '#8839ef', '#4c4f69'] },
  { id: 'solarized', label: 'Solarized', hint: 'Warmes Creme', background: '#f2ebd6', swatch: ['#f2ebd6', '#fdf6e3', '#268bd2', '#073642'] }
]

export const DARK_PALETTES: Palette[] = [
  { id: 'standard', label: 'Standard', hint: 'Neutrales Dunkelgrau', background: '#1b1c1f', swatch: ['#1b1c1f', '#26272b', '#6f9dff', '#e8e9ec'] },
  { id: 'mocha', label: 'Catppuccin Mocha', hint: 'Dunkles Lila', background: '#181825', swatch: ['#181825', '#1e1e2e', '#cba6f7', '#cdd6f4'] },
  { id: 'nord', label: 'Nord', hint: 'Kühles Blaugrau', background: '#2e3440', swatch: ['#2e3440', '#3b4252', '#88c0d0', '#eceff4'] }
]

export function palette(list: Palette[], id: string): Palette {
  return list.find((candidate) => candidate.id === id) ?? list[0]!
}
