import type { SoutApi } from '../../shared/types'

declare global {
  interface Window {
    /** Provided by the preload script (src/preload/index.ts). */
    sout: SoutApi
  }
}

export {}
