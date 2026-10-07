import { app, BrowserWindow } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { TUWEL_URL } from './tuwelApi'

// Login exactly like the official Moodle app ("login via browser"): TUWEL's launch.php sends the user
// through the TU Wien login and finally redirects to moodlemobile://token=…, which we catch here.
// The password is only ever typed into the TU Wien login page.

const SCHEME = 'moodlemobile'

export function loginToTuwel(): Promise<string> {
  const passport = randomBytes(12).toString('hex')
  const launchUrl = `${TUWEL_URL}/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=${passport}&urlscheme=${SCHEME}`

  const win = new BrowserWindow({
    width: 520,
    height: 760,
    title: 'TUWEL-Anmeldung',
    autoHideMenuBar: true,
    // Own, in-memory session: nothing from the login stays behind after sout quits.
    webPreferences: { partition: 'tuwel-login', sandbox: true, contextIsolation: true }
  })
  // Look like plain Chrome (in case a login page treats unknown browsers differently) and ask for German pages.
  win.webContents.session.setUserAgent(app.userAgentFallback.replace(/\s(?:sout|Electron)\/\S+/g, ''), 'de-AT,de;q=0.9,en;q=0.5')

  return new Promise((resolve, reject) => {
    let finished = false
    const finish = (token: string | null, error?: Error): void => {
      if (finished) return
      finished = true
      // Not while an event of this window is still being handled.
      setTimeout(() => {
        if (!win.isDestroyed()) win.destroy()
      })
      if (token) resolve(token)
      else reject(error ?? new Error('Anmeldung abgebrochen.'))
    }
    const intercept = (url: string, event?: { preventDefault(): void }): void => {
      if (!url.startsWith(`${SCHEME}://`)) return
      event?.preventDefault()
      try {
        finish(parseLaunchToken(url, passport))
      } catch (error) {
        finish(null, error as Error)
      }
    }

    const contents = win.webContents
    // The token arrives as an HTTP redirect, a script-clicked link or, failing that, a failed load.
    contents.on('will-redirect', (event) => intercept(event.url, event))
    contents.on('will-navigate', (event) => intercept(event.url, event))
    contents.on('did-fail-load', (_event, _code, _description, url) => intercept(url))
    contents.setWindowOpenHandler(({ url }) => {
      intercept(url)
      return { action: 'deny' }
    })
    // There's no address bar, so at least show where the page comes from.
    contents.on('did-navigate', (_event, url) => {
      if (!win.isDestroyed()) win.setTitle(`TUWEL-Anmeldung · ${new URL(url).host}`)
    })
    win.on('closed', () => finish(null))
    void win.loadURL(launchUrl)
  })
}

/** moodlemobile://token=BASE64, where BASE64 decodes to md5(site + passport) ":::" token [":::" private token]. */
export function parseLaunchToken(url: string, passport: string): string {
  const encoded = url.slice(url.indexOf('token=') + 'token='.length).replace(/[^A-Za-z0-9+/=]/g, '')
  const [signature, token] = Buffer.from(encoded, 'base64').toString('utf8').split(':::')
  const expected = [TUWEL_URL, `${TUWEL_URL}/`].map((site) => createHash('md5').update(site + passport).digest('hex'))
  if (!signature || !token || !expected.includes(signature)) {
    throw new Error('Die Antwort von TUWEL passt nicht zu dieser Anmeldung.')
  }
  return token
}
