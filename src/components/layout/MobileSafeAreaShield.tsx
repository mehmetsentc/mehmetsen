/**
 * Opaque fixed mask for the iOS status-bar region.
 * Must live outside sticky/fixed chrome (sibling of content) so WKWebView
 * compositor layers from feed images cannot paint through rubber-band gaps.
 */
export function MobileSafeAreaShield() {
  return <div aria-hidden className="mobile-safe-area-shield lg:hidden" />
}
