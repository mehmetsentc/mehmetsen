import 'server-only'

/** Server-only super admin email — never hardcode a fallback. */
export function getSuperAdminEmail(): string | null {
  return process.env.SUPER_ADMIN_EMAIL?.trim() || null
}

export function isSuperAdminEmailServer(email: string | null | undefined): boolean {
  const configured = getSuperAdminEmail()
  return !!configured && !!email && email.toLowerCase() === configured.toLowerCase()
}

/** Server-only bootstrap UIDs for one-time admin promotion via API. */
export function getBootstrapAdminUids(): string[] {
  const raw =
    process.env.ADMIN_BOOTSTRAP_UIDS?.trim() ||
    process.env.NEXT_PUBLIC_ADMIN_UIDS?.trim()
  if (!raw) return []
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}
