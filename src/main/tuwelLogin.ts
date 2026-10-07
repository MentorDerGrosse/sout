import { app, BrowserWindow, net, session } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { TUWEL_URL } from './tuwelApi'

// Login exactly like the official Moodle app ("login via browser"): TUWEL's launch.php sends the user
// through the TU Wien login and finally redirects to moodlemobile://token=…, which we catch here.
// The password is only ever typed into the TU Wien login page.
//
// TUWEL lets these tokens expire quickly. The login session is therefore kept (like a browser keeps
// it), so a new token can be fetched silently in the background while the TU Wien login is still
// valid. Only after that the user has to log in again.

const SCHEME = 'moodlemobile'
const PARTITION = 'persist:tuwel'
const SILENT_TIMEOUT_MS = 30_000

let sessionPrepared = false

function loginSession(): Electron.Session {
  const ses = session.fromPartition(PARTITION)
  if (!sessionPrepared) {
    // Look like plain Chrome (in case a login page treats unknown browsers differently) and ask for German pages.
    ses.setUserAgent(app.userAgentFallback.replace(/\s(?:sout|Electron)\/\S+/g, ''), 'de-AT,de;q=0.9,en;q=0.5')
    sessionPrepared = true
  }
  return ses
}

/** Forget the stored TU Wien / TUWEL login (on "Abmelden"). */
export async function forgetTuwelLogin(): Promise<void> {
  await loginSession().clearStorageData()
}

/**
 * Get a TUWEL token. Interactive: shows the TU Wien login. Silent: tries in a hidden window with the
 * stored login and fails if the user would have to type something – first with the TUWEL session
 * itself, then through the TU Wien login.
 */
export async function loginToTuwel({ silent = false } = {}): Promise<string> {
  const passport = randomBytes(12).toString('hex')
  const launchUrl = `${TUWEL_URL}/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=${passport}&urlscheme=${SCHEME}`
  if (!silent) return attempt(await ssoUrl(launchUrl, false), launchUrl, passport, false)
  try {
    return await attempt(launchUrl, launchUrl, passport, true)
  } catch {
    return attempt(await ssoUrl(launchUrl, true), launchUrl, passport, true)
  }
}

/** Development check (`--try-renewal`): one silent attempt via the TUWEL session or via the TU Wien login. */
export async function trySilent(via: 'session' | 'sso'): Promise<string> {
  const passport = randomBytes(12).toString('hex')
  const launchUrl = `${TUWEL_URL}/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=${passport}&urlscheme=${SCHEME}`
  return attempt(via === 'session' ? launchUrl : await ssoUrl(launchUrl, true), launchUrl, passport, true)
}

let trace: string[] = []

/** Pages the last login window went through (host and path only), for diagnosing failed logins. */
export const lastLoginTrace = (): string[] => [...trace]

/** TUWEL pages that are still part of logging in; any other TUWEL page means: logged in. */
const LOGIN_PAGES = /^\/(login|auth|admin\/tool\/(mfa|mobile|policy)|user\/policy)/

/** Loads startUrl in a login window and waits for the moodlemobile:// redirect with the token. */
function attempt(startUrl: string, launchUrl: string, passport: string, silent: boolean): Promise<string> {
  const win = new BrowserWindow({
    width: 520,
    height: 760,
    show: !silent,
    title: 'TUWEL-Anmeldung',
    autoHideMenuBar: true,
    webPreferences: { session: loginSession(), sandbox: true, contextIsolation: true, backgroundThrottling: false }
  })
  const started = Date.now()
  trace = []
  const note = (what: string, url: string): void => {
    try {
      const { host, pathname } = new URL(url)
      trace.push(`+${Date.now() - started}ms ${what} ${host}${pathname}`)
    } catch {
      trace.push(`+${Date.now() - started}ms ${what} ${url.slice(0, 40)}`)
    }
  }

  return new Promise((resolve, reject) => {
    let finished = false
    let relaunches = 0
    const finish = (token: string | null, error?: Error): void => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      trace.push(`+${Date.now() - started}ms ${token ? 'token' : `abbruch: ${error?.message ?? 'Fenster geschlossen'}`}`)
      // Not while an event of this window is still being handled.
      setTimeout(() => {
        if (!win.isDestroyed()) win.destroy()
      })
      if (token) {
        void keepLoginAcrossRestarts()
        resolve(token)
      } else {
        reject(error ?? new Error('Anmeldung abgebrochen.'))
      }
    }
    const timer = silent ? setTimeout(() => finish(null, new Error('Stille Anmeldung nicht möglich.')), SILENT_TIMEOUT_MS) : undefined
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
    contents.on('will-redirect', (event) => {
      if (!event.url.startsWith(`${SCHEME}://`)) note('weiter', event.url)
      intercept(event.url, event)
    })
    contents.on('will-navigate', (event) => intercept(event.url, event))
    contents.on('did-fail-load', (_event, _code, _description, url) => intercept(url))
    contents.setWindowOpenHandler(({ url }) => {
      intercept(url)
      return { action: 'deny' }
    })
    contents.on('did-navigate', (_event, url) => {
      note('seite', url)
      if (win.isDestroyed()) return
      // There's no address bar, so at least show where the page comes from.
      win.setTitle(`TUWEL-Anmeldung · ${new URL(url).host}`)
      // After the login TUWEL sometimes lands on its start page instead of the app page:
      // logged in is logged in, so ask for the token ourselves.
      const { origin, pathname } = new URL(url)
      if (origin === TUWEL_URL && !LOGIN_PAGES.test(pathname) && relaunches < 2) {
        relaunches++
        void win.loadURL(launchUrl)
      }
    })
    if (silent) {
      // A password field means the stored login has run out: nothing to do without the user.
      contents.on('did-finish-load', () => {
        void contents
          .executeJavaScript(`Boolean(document.querySelector('input[type="password"]'))`)
          .then((needsLogin: boolean) => {
            if (needsLogin) finish(null, new Error('Die TU-Wien-Anmeldung ist abgelaufen.'))
          })
          .catch(() => {})
      })
    }
    win.on('closed', () => finish(null))
    void win.loadURL(startUrl)
  })
}

/**
 * Login cookies of TUWEL and the TU Wien login are session cookies, which Electron forgets when sout
 * quits. Like a browser that restores its session, keep them (encrypted in the profile) so the
 * silent renewal still works after a restart. Whether the login is still valid decides the server.
 */
async function keepLoginAcrossRestarts(): Promise<void> {
  const ses = loginSession()
  const until = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
  try {
    for (const cookie of await ses.cookies.get({})) {
      const host = (cookie.domain ?? '').replace(/^\./, '')
      if (!cookie.session || !/(^|\.)tuwien\.ac\.at$/.test(host)) continue
      await ses.cookies.set({
        url: `https://${host}${cookie.path ?? '/'}`,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.hostOnly ? undefined : cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        expirationDate: until
      })
    }
    await ses.cookies.flushStore()
  } catch {
    // Not essential: without it, a restart just needs a fresh login.
  }
}

/**
 * Straight to the "TU Wien Login" (skipping TUWEL's login page) and back to the app launch page.
 * Silent: SAML "passive" – the TU Wien login answers without showing a form. Falls back to launch.php.
 */
async function ssoUrl(launchUrl: string, passive: boolean): Promise<string> {
  try {
    const response = await net.fetch(`${TUWEL_URL}/lib/ajax/service-nologin.php?info=tool_mobile_get_public_config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ index: 0, methodname: 'tool_mobile_get_public_config', args: {} }]),
      signal: AbortSignal.timeout(10_000)
    })
    const [result] = (await response.json()) as [{ data?: { identityproviders?: { url: string }[] } }]
    const provider = result?.data?.identityproviders?.[0]?.url
    if (provider) {
      const url = new URL(provider)
      url.searchParams.set('wants', launchUrl)
      url.searchParams.set('passive', passive ? 'on' : 'off')
      return url.toString()
    }
  } catch {
    // TUWEL's own login page has the same "TU Wien Login" button.
  }
  return launchUrl
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
