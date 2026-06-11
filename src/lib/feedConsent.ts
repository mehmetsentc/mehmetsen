const FEED_GUEST_CONSENT_KEY = 'nahaber-feed-guest-consent'

// localStorage kullan — sessionStorage her oturumda sıfırlanırdı.
// Misafirler haberleri her zaman okuyabilir, onay yalnızca bir kez alınır.
export function hasFeedGuestConsent(): boolean {
  // Haberleri görmek için artık ayrı bir onay gerekmez.
  // Cookie consent (lib/consent.ts) yeterli.
  return true
}

export function setFeedGuestConsent(): void {
  try { localStorage.setItem(FEED_GUEST_CONSENT_KEY, 'accepted') } catch { /* ignore */ }
}

export function clearFeedGuestConsent(): void {
  try { localStorage.removeItem(FEED_GUEST_CONSENT_KEY) } catch { /* ignore */ }
}
