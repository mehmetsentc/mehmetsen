/**
 * Deterministic Feed Reader hero media policy.
 * Never invents images. Distinguishes loading / valid / none / failed.
 */

export type ReaderHeroState = 'LOADING' | 'VALID_MEDIA' | 'NO_MEDIA' | 'FAILED_MEDIA'

export type ReaderHeroResolution = {
  state: ReaderHeroState
  url: string | null
  caption: string | null
  /** First body <img src> that matches hero — suppress duplicate render */
  suppressBodySrc: string | null
}

export function isLikelyHttpImageUrl(raw: string | null | undefined): boolean {
  const u = raw?.trim()
  if (!u) return false
  if (u.startsWith('/')) return !u.startsWith('//')
  try {
    const parsed = new URL(u)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/** Extract first img src from sanitized Reader body HTML (best-effort). */
export function firstBodyImageSrc(bodyHtml: string | null | undefined): string | null {
  if (!bodyHtml) return null
  const m = bodyHtml.match(/<img\b[^>]*\bsrc\s*=\s*("([^"]*)"|'([^']*)')/i)
  return (m?.[2] || m?.[3] || '').trim() || null
}

export function urlsEquivalent(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const na = a.trim()
  const nb = b.trim()
  if (na === nb) return true
  try {
    const ua = new URL(na, 'https://www.nahaber.com')
    const ub = new URL(nb, 'https://www.nahaber.com')
    return ua.pathname === ub.pathname && ua.search === ub.search
  } catch {
    return false
  }
}

/**
 * Resolve initial hero intent from Feed DTO + Reader detail.
 * LOADING only when a candidate URL exists and runtime has not settled yet.
 */
export function resolveReaderHero(input: {
  feedImage: string | null | undefined
  detailImage: string | null | undefined
  detailCaption?: string | null
  bodyHtml?: string | null
  bodySettled: boolean
  imageLoad: 'pending' | 'ok' | 'error'
  loadTimedOut: boolean
}): ReaderHeroResolution {
  const candidate =
    (isLikelyHttpImageUrl(input.detailImage) ? input.detailImage!.trim() : null) ||
    (isLikelyHttpImageUrl(input.feedImage) ? input.feedImage!.trim() : null)

  const bodySrc = firstBodyImageSrc(input.bodyHtml)
  const suppressBodySrc =
    candidate && bodySrc && urlsEquivalent(candidate, bodySrc) ? bodySrc : null

  if (!candidate) {
    return {
      state: 'NO_MEDIA',
      url: null,
      caption: null,
      suppressBodySrc: null,
    }
  }

  // Late success after timeout must NOT resurrect VALID (avoids layout jump).
  // Timeout / error are terminal for this candidate epoch.
  if (input.imageLoad === 'ok' && !input.loadTimedOut) {
    return {
      state: 'VALID_MEDIA',
      url: candidate,
      caption: input.detailCaption?.trim() || null,
      suppressBodySrc,
    }
  }

  if (input.imageLoad === 'error' || input.loadTimedOut) {
    return {
      state: 'FAILED_MEDIA',
      url: candidate,
      caption: null,
      suppressBodySrc: null,
    }
  }

  // Candidate exists, load pending
  if (!input.bodySettled && input.imageLoad === 'pending') {
    return {
      state: 'LOADING',
      url: candidate,
      caption: null,
      suppressBodySrc,
    }
  }

  // Body settled but image still pending → still LOADING until timeout/error/ok
  return {
    state: 'LOADING',
    url: candidate,
    caption: null,
    suppressBodySrc,
  }
}

/** Strip matching hero img from body HTML to avoid immediate duplicate. */
export function stripDuplicateHeroFromBodyHtml(
  bodyHtml: string | null,
  heroSrc: string | null
): string | null {
  if (!bodyHtml || !heroSrc) return bodyHtml
  const escaped = heroSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const figureRe = new RegExp(
    `<figure>\\s*<img\\b[^>]*\\bsrc\\s*=\\s*("|')${escaped}\\1[^>]*/?>\\s*(<figcaption>[\\s\\S]*?<\\/figcaption>)?\\s*<\\/figure>`,
    'i'
  )
  const imgRe = new RegExp(`<img\\b[^>]*\\bsrc\\s*=\\s*("|')${escaped}\\1[^>]*/?>`, 'i')
  let out = bodyHtml.replace(figureRe, '')
  out = out.replace(imgRe, '')
  return out.trim() || null
}
