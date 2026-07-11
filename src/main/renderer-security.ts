import { pathToFileURL } from 'node:url'

export interface RendererTarget {
  url: URL
  isDevelopment: boolean
  isExpectedUrl: (url: string) => boolean
}

interface RendererTargetOptions {
  isPackaged: boolean
  developmentUrl?: string
  bundledRendererPath: string
}

/** Selects the only renderer URL that may receive the privileged preload API. */
export function createRendererTarget({
  isPackaged,
  developmentUrl,
  bundledRendererPath
}: RendererTargetOptions): RendererTarget {
  // electron-vite sets this in development. Packaged applications must ignore
  // inherited environment variables and load only their bundled renderer.
  const allowedDevelopmentUrl = isPackaged ? undefined : developmentUrl
  const url = allowedDevelopmentUrl
    ? new URL(allowedDevelopmentUrl)
    : pathToFileURL(bundledRendererPath)

  if (
    allowedDevelopmentUrl &&
    ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username !== '' || url.password !== '')
  ) {
    throw new Error('The development renderer URL must be credential-free HTTP or HTTPS')
  }

  const expected = {
    protocol: url.protocol,
    username: url.username,
    password: url.password,
    hostname: url.hostname,
    port: url.port,
    pathname: url.pathname,
    search: url.search
  }

  return {
    url,
    isDevelopment: Boolean(allowedDevelopmentUrl),
    isExpectedUrl(candidateUrl) {
      try {
        const candidate = new URL(candidateUrl)
        return (
          candidate.protocol === expected.protocol &&
          candidate.username === expected.username &&
          candidate.password === expected.password &&
          candidate.hostname === expected.hostname &&
          candidate.port === expected.port &&
          candidate.pathname === expected.pathname &&
          candidate.search === expected.search
        )
      } catch {
        return false
      }
    }
  }
}

/** Returns a normalized URL only for links safe to hand to the operating system. */
export function safeExternalUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === ''
      ? parsed.toString()
      : null
  } catch {
    return null
  }
}
