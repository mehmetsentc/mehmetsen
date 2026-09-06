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

export type HeroLoadFlag = 'pending' | 'ok' | 'error'

export type HeroRuntimeSnapshot = {
  articleId: string
  url: string | null
  epoch: number
  imageLoad: HeroLoadFlag
  loadTimedOut: boolean
}

export type HeroRuntimeEvent =
  | { type: 'timeout'; articleId: string; url: string | null; epoch: number }
  | { type: 'ok'; articleId: string; url: string; epoch: number }
  | { type: 'error'; articleId: string; url: string; epoch: number }

/**
 * Feed card already rendered this URL — first-choice hero.
 * Reader enrichment may fill a missing Feed image, but must not replace a
 * known-good Feed URL with a different unverified cover.
 */
export function selectReaderHeroCandidate(
  feedImage: string | null | undefined,
  detailImage: string | null | undefined
): string | null {
  const feed = isLikelyHttpImageUrl(feedImage) ? feedImage!.trim() : null
  const detail = isLikelyHttpImageUrl(detailImage) ? detailImage!.trim() : null
  return feed || detail
}

/** Match Feed cards: remote http(s) bypasses /_next/image (unknown hosts 400). */
export function readerHeroShouldBeUnoptimized(url: string | null | undefined): boolean {
  const u = url?.trim() ?? ''
  return u.startsWith('http://') || u.startsWith('https://')
}

/**
 * Epoch + article + URL identity. LOADING → VALID is terminal for that identity.
 * Timeout / onError / onLoad from a previous identity are ignored.
 * Late onLoad after timeout does not resurrect VALID.
 */
export function applyHeroRuntimeEvent(
  current: HeroRuntimeSnapshot,
  event: HeroRuntimeEvent
): Pick<HeroRuntimeSnapshot, 'imageLoad' | 'loadTimedOut'> {
  const flags = { imageLoad: current.imageLoad, loadTimedOut: current.loadTimedOut }
  if (event.epoch !== current.epoch) return flags
  if (event.articleId !== current.articleId) return flags
  if ((event.url ?? null) !== (current.url ?? null)) return flags

  if (current.imageLoad === 'ok') {
    return { imageLoad: 'ok', loadTimedOut: false }
  }

  if (event.type === 'timeout') {
    return { imageLoad: current.imageLoad, loadTimedOut: true }
  }
  if (event.type === 'ok') {
    if (current.loadTimedOut) return flags
    return { imageLoad: 'ok', loadTimedOut: false }
  }
  return { imageLoad: 'error', loadTimedOut: current.loadTimedOut }
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
  const candidate = selectReaderHeroCandidate(input.feedImage, input.detailImage)

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
