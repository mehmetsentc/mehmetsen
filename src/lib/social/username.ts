const RESERVED_USERNAMES = new Set([
  'admin',
  'api',
  'publisher',
  'publishers',
  'login',
  'register',
  'settings',
  'nahaber',
  'haber',
  'feed',
  'search',
  'ara',
  'profile',
  'u',
  'yazar',
  'publisher-studio',
  'onboarding',
  'notifications',
  'messages',
  'saved',
  'discover',
  'events',
  'reels',
  'post',
  'haber',
  'kategori',
  'yerel',
  'canli',
  'cok-okunanlar',
  'skor',
  'oyunlar',
  'weather',
  'uygulama',
  'influencer',
  'muzeler',
  'futbol-canli',
  'site-haritasi',
  'sitemap',
  'rss',
  'og',
  'www',
  'support',
  'help',
  'about',
  'contact',
  'legal',
  'privacy',
  'terms',
  'null',
  'undefined',
  'system',
  'root',
  'moderator',
  'editor',
])

const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/

export const USERNAME_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000

export function normalizeUsernameInput(raw: string): string {
  return raw.trim().toLocaleLowerCase('tr-TR').replace(/[^a-z0-9_]/g, '')
}

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(normalizeUsernameInput(username))
}

export function validateUsername(username: string): { ok: true; username: string } | { ok: false; error: string } {
  const normalized = normalizeUsernameInput(username)
  if (normalized.length < 3) {
    return { ok: false, error: 'Kullanıcı adı en az 3 karakter olmalı' }
  }
  if (normalized.length > 30) {
    return { ok: false, error: 'Kullanıcı adı en fazla 30 karakter olabilir' }
  }
  if (!USERNAME_PATTERN.test(normalized)) {
    return { ok: false, error: 'Kullanıcı adı yalnızca küçük harf, rakam ve alt çizgi içerebilir' }
  }
  if (isReservedUsername(normalized)) {
    return { ok: false, error: 'Bu kullanıcı adı kullanılamaz' }
  }
  return { ok: true, username: normalized }
}

export function canChangeUsername(lastChangedAt: Date | null | undefined, now = Date.now()): boolean {
  if (!lastChangedAt) return true
  return now - lastChangedAt.getTime() >= USERNAME_CHANGE_COOLDOWN_MS
}
