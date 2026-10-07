// Adds sout to the GNOME app overview and creates the `sout` command (~/.local/bin/sout).
// Usage: npm run install-desktop      (remove again: npm run uninstall-desktop)
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const launcher = join(homedir(), '.local', 'bin', 'sout')
const desktopFile = join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'applications', 'sout.desktop')

if (process.argv.includes('--remove')) {
  rmSync(launcher, { force: true })
  rmSync(desktopFile, { force: true })
  console.log(`Entfernt: ${launcher}\nEntfernt: ${desktopFile}`)
  process.exit(0)
}

if (!existsSync(join(root, 'out', 'main', 'index.js'))) {
  console.error('sout ist noch nicht gebaut – bitte zuerst `npm run build` ausführen.')
  process.exit(1)
}

// In plain Node, require('electron') returns the path of the Electron binary (downloading it if needed).
const electron = createRequire(import.meta.url)('electron')
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`
const execQuote = (value) => (/^[\w\-./+=:@,]+$/.test(value) ? value : `"${value.replace(/(["`$\\])/g, '\\$1')}"`)

// Startup flags: XWayland so the mini window can be placed, German UI (see src/main/system.ts).
mkdirSync(dirname(launcher), { recursive: true })
writeFileSync(launcher, `#!/bin/sh\nexec ${shellQuote(electron)} ${shellQuote(root)} --ozone-platform=x11 --lang=de-AT "$@"\n`)
chmodSync(launcher, 0o755)

mkdirSync(dirname(desktopFile), { recursive: true })
writeFileSync(
  desktopFile,
  [
    '[Desktop Entry]',
    'Type=Application',
    'Name=sout',
    'Comment=Studium organisieren: TISS, TUWEL, Notizen',
    `Exec=${execQuote(launcher)}`,
    `Icon=${join(root, 'resources', 'icon.png')}`,
    'Terminal=false',
    'Categories=Education;Office;',
    'StartupWMClass=sout',
    ''
  ].join('\n')
)

console.log(`Befehl:      ${launcher}   (Mini-Ansicht: ${launcher} --mini)`)
console.log(`App-Eintrag: ${desktopFile}`)
