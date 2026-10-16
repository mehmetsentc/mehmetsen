/**
 * FEED-SOUND-2 — one shared <video> element for every feed card.
 *
 * iOS Safari (and other mobile browsers) allow sound only on a media element that has been
 * played inside a user gesture. With a new <video> per card, the first video was allowed
 * sound but every later one started muted (it was a fresh element and the swipe that
 * brought it in had already ended). The feed now moves ONE element from card to card and
 * only swaps its src, so once the viewer has touched the page every video plays with sound.
 */
let shared: HTMLVideoElement | null = null
let unlocked = false
let unlockInstalled = false

export function getSharedFeedVideo(): HTMLVideoElement {
  if (!shared) {
    const v = document.createElement('video')
    v.playsInline = true
    v.setAttribute('playsinline', '')
    v.setAttribute('webkit-playsinline', '')
    v.loop = true
    v.preload = 'auto'
    shared = v
  }
  installSharedVideoUnlock()
  return shared
}

export function isSharedFeedVideoUnlocked(): boolean {
  return unlocked
}

/**
 * At the viewer's first touch / click / key press, call play() on the shared element inside
 * that gesture so the browser marks it as allowed to play with sound from then on.
 */
export function installSharedVideoUnlock(): void {
  if (unlockInstalled || typeof window === 'undefined') return
  unlockInstalled = true
  const events = ['touchend', 'pointerup', 'click', 'keydown'] as const
  const onGesture = () => {
    const v = shared
    if (!v) return
    const wasPaused = v.paused
    try {
      const p = v.play()
      unlocked = true
      if (p && typeof p.then === 'function') {
        p.then(() => {
          if (wasPaused && !v.dataset.feedActive) v.pause()
        }).catch(() => {
          /* no src yet — the gesture still counts for this element */
        })
      }
    } catch {
      /* ignore */
    }
    if (unlocked) events.forEach((e) => window.removeEventListener(e, onGesture, true))
  }
  events.forEach((e) => window.addEventListener(e, onGesture, { capture: true, passive: true }))
}
