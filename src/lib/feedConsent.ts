const FEED_GUEST_CONSENT_KEY = 'nahaber-feed-guest-consent'

export function hasFeedGuestConsent(): boolean {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(FEED_GUEST_CONSENT_KEY) === 'accepted'
}

export function setFeedGuestConsent(): void {
  sessionStorage.setItem(FEED_GUEST_CONSENT_KEY, 'accepted')
}

export function clearFeedGuestConsent(): void {
  sessionStorage.removeItem(FEED_GUEST_CONSENT_KEY)
}
