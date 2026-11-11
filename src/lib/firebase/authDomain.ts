/**
 * AUTH-DOMAIN-1 — first-party Firebase Auth domain on the production web host.
 *
 * Google/Apple redirect sign-in returns to `<authDomain>/__/auth/handler`. When
 * that is nahaberapp.firebaseapp.com, browsers that partition third-party
 * storage (Safari, every iOS browser, recent Chrome) lose the result and the
 * user lands back on nahaber.com signed out. next.config.ts proxies `/__/auth/*`
 * to firebaseapp.com, so the production host can serve as its own authDomain.
 *
 * Only hosts listed here switch; they must also be registered as OAuth redirect
 * URIs (Google Cloud web client + Apple Services ID): https://<host>/__/auth/handler.
 * Native (Capacitor) builds, city subdomains, previews and localhost keep the
 * configured authDomain.
 */
export const FIRST_PARTY_AUTH_HOSTS: ReadonlySet<string> = new Set(['www.nahaber.com'])

export function resolveAuthDomain(
  configured: string | undefined,
  hostname: string | undefined,
): string | undefined {
  if (hostname && FIRST_PARTY_AUTH_HOSTS.has(hostname)) return hostname
  return configured
}
