/**
 * SMM test (preview) ortamı koruması — Görev 7.
 *
 * Etkin olduğu durumlar:
 *   - Vercel preview dağıtımı (VERCEL_ENV=preview), ya da
 *   - açık bayrak SOCIAL_TEST_MODE=1|true (yerel/izole denemeler).
 * Production'da (VERCEL_ENV=production) bayrak yoksa HİÇBİR davranış değişmez.
 *
 * Etkinken sosyal katman fail-closed çalışır:
 *   - Test Firebase projesi açıkça tanımlanmalı ve production projesi olmamalı;
 *     sunucu (Admin SDK), istemci yapılandırması ve depolama kovası aynı test
 *     projesine işaret etmeli. Aksi halde bağlantı ve yayın yapılmaz.
 *   - OAuth callback kökü yalnızca SOCIAL_OAUTH_BASE_URL'den gelir (getSiteUrl
 *     / NEXT_PUBLIC_APP_URL'ye düşmez) ve production alan adı olamaz.
 *   - Legacy Onyeditivi kimlik bilgileri (env/Firestore token'ları) hiç
 *     çözülmez; hedefsiz (legacy) yayın, X ve cron/otomatik yayın kapalıdır.
 *   - Yalnızca SOCIAL_TEST_ALLOWED_ACCOUNT_IDS listesindeki hesaplar bağlanabilir
 *     ve bunlara yalnızca manuel yayın yapılabilir.
 *   - Sosyal AI metin üretimi çağrılmaz.
 *
 * Bu modül değer DÖNDÜRMEZ ve loglamaz; yalnızca değişken ADLARI ile sorun bildirir.
 */

/** Bilinen production Firebase projesi (.firebaserc → default). */
export const PRODUCTION_FIREBASE_PROJECT_IDS: readonly string[] = ['nahaberapp']
/** Production alan adları — test OAuth callback kökü bunlar olamaz. */
const PRODUCTION_HOST_RE = /(^|\.)nahaber\.com$/i

type Env = NodeJS.ProcessEnv | Record<string, string | undefined>

function flag(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'on'
}

export function isSocialTestMode(env: Env = process.env): boolean {
  return env.VERCEL_ENV === 'preview' || flag(env.SOCIAL_TEST_MODE)
}

const ACCOUNT_ID_RE = /^(facebook|instagram|threads)_[0-9]{1,40}$/

/** SOCIAL_TEST_ALLOWED_ACCOUNT_IDS → geçerli hesap kimlikleri (platform_dışKimlik). */
export function testAllowedAccountIds(env: Env = process.env): Set<string> {
  return new Set(
    (env.SOCIAL_TEST_ALLOWED_ACCOUNT_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => ACCOUNT_ID_RE.test(s)),
  )
}

function serviceAccountProjectId(env: Env): string | null {
  const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { project_id?: unknown }
    return typeof parsed.project_id === 'string' ? parsed.project_id.trim() : null
  } catch {
    return null
  }
}

/** Admin SDK'nın gerçekte bağlanacağı proje (firebase/admin.ts ile aynı öncelik). */
function adminProjectId(env: Env): string | null {
  const fromJson = serviceAccountProjectId(env)
  if (fromJson) return fromJson
  return env.FIREBASE_ADMIN_PROJECT_ID?.trim() || env.GCLOUD_PROJECT?.trim() || null
}

function isProductionProject(id: string | null | undefined): boolean {
  return !!id && PRODUCTION_FIREBASE_PROJECT_IDS.includes(id.trim())
}

/** Callback kökü: yalnızca SOCIAL_OAUTH_BASE_URL, https, production alanı değil. */
export function testOAuthBaseUrl(env: Env = process.env): string | null {
  const raw = env.SOCIAL_OAUTH_BASE_URL?.trim()
  if (!raw) return null
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1') && env.VERCEL_ENV !== 'preview')) {
    return null
  }
  if (u.username || u.password || u.search || u.hash || (u.pathname && u.pathname !== '/')) return null
  if (PRODUCTION_HOST_RE.test(u.hostname)) return null
  return u.origin
}

export interface SocialTestEnvStatus {
  active: boolean
  /** Engelleyici sorunlar (değişken adları). Boşsa test ortamı yayına hazır. */
  problems: string[]
  /** Engellemeyen ama düzeltilmesi önerilen ayarlar (değişken adları). */
  warnings: string[]
  allowedAccountCount: number
}

export function socialTestEnvStatus(env: Env = process.env): SocialTestEnvStatus {
  if (!isSocialTestMode(env)) return { active: false, problems: [], warnings: [], allowedAccountCount: 0 }
  const problems: string[] = []
  const warnings: string[] = []

  const testProject = env.SOCIAL_TEST_FIREBASE_PROJECT_ID?.trim() || ''
  if (!testProject) problems.push('SOCIAL_TEST_FIREBASE_PROJECT_ID')
  else if (isProductionProject(testProject)) problems.push('SOCIAL_TEST_FIREBASE_PROJECT_ID (production projesi)')

  const admin = adminProjectId(env)
  if (!admin || isProductionProject(admin) || (testProject && admin !== testProject)) {
    problems.push(env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ? 'FIREBASE_SERVICE_ACCOUNT_JSON' : 'FIREBASE_ADMIN_PROJECT_ID')
  }
  const client = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || ''
  if (!client || isProductionProject(client) || (testProject && client !== testProject)) {
    problems.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID')
  }
  const bucket = (env.FIREBASE_STORAGE_BUCKET?.trim() || env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || '').replace(/^gs:\/\//, '')
  const bucketProject = bucket.split('.')[0] ?? ''
  if (!bucket || isProductionProject(bucketProject) || (testProject && bucketProject !== testProject)) {
    problems.push(env.FIREBASE_STORAGE_BUCKET?.trim() ? 'FIREBASE_STORAGE_BUCKET' : 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET')
  }
  if (!testOAuthBaseUrl(env)) problems.push('SOCIAL_OAUTH_BASE_URL')
  const allowed = testAllowedAccountIds(env)
  if (allowed.size === 0) problems.push('SOCIAL_TEST_ALLOWED_ACCOUNT_IDS')

  // Kod tarafından zaten engellenen / sosyal akışın kullanmadığı, ama test
  // ortamında tanımlı olmaması gereken production bağlantıları.
  for (const name of [
    'FACEBOOK_PAGE_ACCESS_TOKEN',
    'ONYEDITIVI_FB_PAGE_ACCESS_TOKEN',
    'INSTAGRAM_ACCESS_TOKEN',
    'THREADS_ACCESS_TOKEN',
    'X_ACCESS_TOKEN',
    'DATABASE_URL',
  ]) {
    if (env[name]?.trim()) warnings.push(name)
  }
  for (const name of ['GLOBAL_CRAWLER_ENABLED', 'NEWS_CRAWLER_ENABLED', 'CRAWLER_AI_DISPATCH_ENABLED', 'MANUAL_EDITOR_AI_ENABLED', 'POSTGRES_READS_ENABLED']) {
    if (flag(env[name])) warnings.push(name)
  }
  return { active: true, problems, warnings, allowedAccountCount: allowed.size }
}

export const TEST_ENV_TEXT = {
  misconfigured: 'Test ortamı yapılandırması eksik veya production kaynağına işaret ediyor — sosyal işlem yapılmadı',
  legacyDisabled: 'Test ortamında Onyeditivi (legacy) bağlantısı ve hedefsiz yayın kapalı',
  autoDisabled: 'Test ortamında otomatik / zamanlanmış sosyal yayın kapalı',
  targetNotAllowed: 'Bu hesap test ortamı izin listesinde değil — yayın yapılmadı',
  twitterDisabled: 'Test ortamında X yayını kapalı',
} as const

/** Test modunda, verilen hesap için sosyal işlem yapılabilir mi? (null = evet) */
export function testModeAccountProblem(accountId: string, env: Env = process.env): 'test_env_misconfigured' | 'test_env_target_not_allowed' | null {
  if (!isSocialTestMode(env)) return null
  if (socialTestEnvStatus(env).problems.length > 0) return 'test_env_misconfigured'
  return testAllowedAccountIds(env).has(accountId) ? null : 'test_env_target_not_allowed'
}

/**
 * Legacy Onyeditivi token'larını okuyan / kullanan eski uçlar için:
 * test modunda istek, hiçbir kimlik bilgisi okunmadan 403 ile reddedilir.
 */
export function testModeLegacyRouteBlock(env: Env = process.env): Response | null {
  if (!isSocialTestMode(env)) return null
  return Response.json({ error: TEST_ENV_TEXT.legacyDisabled, code: 'test_env_legacy_disabled' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
}

/** Cron / otomatik tetikleyici uçları için: test modunda 503. */
export function testModeAutomationBlock(env: Env = process.env): Response | null {
  if (!isSocialTestMode(env)) return null
  return Response.json({ error: TEST_ENV_TEXT.autoDisabled, code: 'test_env_auto_disabled' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
}
