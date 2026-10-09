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
/** Vercel production alias'ları (proje adı sabit: .vercel/project.json → nahaber). */
const PRODUCTION_VERCEL_HOSTS = ['nahaber.vercel.app']
/** SMM test önizlemesi için ayrılmış dallar: bu dalların preview'ı test ortamı sayılır. */
const SMM_TEST_BRANCHES = ['feat/social-multi-account-foundation']
const SMM_TEST_BRANCH_PREFIX = 'smm-test/'

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

/** Production proje listesi: sabit + SOCIAL_PRODUCTION_FIREBASE_PROJECT_IDS (virgüllü). */
function productionProjectIds(env: Env): string[] {
  const extra = (env.SOCIAL_PRODUCTION_FIREBASE_PROJECT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return [...PRODUCTION_FIREBASE_PROJECT_IDS, ...extra]
}

function isProductionProject(id: string | null | undefined, env: Env = process.env): boolean {
  return !!id && productionProjectIds(env).includes(id.trim())
}

function isProductionHost(host: string, env: Env): boolean {
  const h = host.toLowerCase()
  if (PRODUCTION_HOST_RE.test(h)) return true
  if (PRODUCTION_VERCEL_HOSTS.includes(h)) return true
  const prodUrl = env.VERCEL_PROJECT_PRODUCTION_URL?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  return !!prodUrl && prodUrl === h
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
  if (isProductionHost(u.hostname, env)) return null
  return u.origin
}

/**
 * Production verisine veya gerçek kullanıcılara erişen sırlar (Neon, push,
 * e-posta, R2 yazma, legacy sosyal token'lar, X). SMM test önizlemesinde
 * tanımlıysa engelleyici sorun sayılır.
 */
export const PROD_LINKED_SECRET_NAMES: readonly string[] = [
  'DATABASE_URL',
  'DATABASE_URL_UNPOOLED',
  'FACEBOOK_PAGE_ACCESS_TOKEN',
  'ONYEDITIVI_FB_PAGE_ACCESS_TOKEN',
  'INSTAGRAM_ACCESS_TOKEN',
  'THREADS_ACCESS_TOKEN',
  'X_ACCESS_TOKEN',
  'X_ACCESS_TOKEN_SECRET',
  'ONESIGNAL_REST_API_KEY',
  'GMAIL_CLIENT_SECRET',
  'GMAIL_TOKEN_ENCRYPTION_KEY',
  'R2_SECRET_ACCESS_KEY',
]
/** Maliyet doğuran dış servis anahtarları — uyarı. */
export const COST_SECRET_NAMES: readonly string[] = [
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'GROQ_API_KEY',
  'OPENROUTER_API_KEY', 'LLAMA_API_KEY', 'SERPER_API_KEY', 'JINA_API_KEY', 'APIFY_TOKEN',
]

/** Boş ya da açıkça 'disabled' / 'off' / '0' değer = tanımsız sayılır (Vercel'de dal bazlı geçersiz kılma için). */
function presentSecret(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase()
  return !!s && s !== 'disabled' && s !== 'off' && s !== '0' && s !== 'none'
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
  else if (isProductionProject(testProject, env)) problems.push('SOCIAL_TEST_FIREBASE_PROJECT_ID (production projesi)')

  const admin = adminProjectId(env)
  if (!admin || isProductionProject(admin, env) || (testProject && admin !== testProject)) {
    problems.push(env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ? 'FIREBASE_SERVICE_ACCOUNT_JSON' : 'FIREBASE_ADMIN_PROJECT_ID')
  }
  const client = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || ''
  if (!client || isProductionProject(client, env) || (testProject && client !== testProject)) {
    problems.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID')
  }
  const bucket = (env.FIREBASE_STORAGE_BUCKET?.trim() || env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || '').replace(/^gs:\/\//, '')
  const bucketProject = bucket.split('.')[0] ?? ''
  if (!bucket || isProductionProject(bucketProject, env) || (testProject && bucketProject !== testProject)) {
    problems.push(env.FIREBASE_STORAGE_BUCKET?.trim() ? 'FIREBASE_STORAGE_BUCKET' : 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET')
  }
  if (!testOAuthBaseUrl(env)) problems.push('SOCIAL_OAUTH_BASE_URL')
  const allowed = testAllowedAccountIds(env)
  if (allowed.size === 0) problems.push('SOCIAL_TEST_ALLOWED_ACCOUNT_IDS')

  // Production verisine/kullanıcılarına dokunan kimlik bilgileri: SMM test
  // önizlemesinde TANIMLI OLMAMALI (ya da 'disabled' ile geçersiz kılınmalı).
  // Vercel'de bunlar "Production and Preview" kapsamında olduğu için preview'a
  // kendiliğinden gelir; tanımlıysa sosyal işlem yapılmaz.
  for (const name of PROD_LINKED_SECRET_NAMES) {
    if (presentSecret(env[name])) problems.push(name)
  }
  // Maliyet / dış etki: engellemez, uyarır (sosyal AI kodda zaten kapalı).
  for (const name of COST_SECRET_NAMES) {
    if (presentSecret(env[name])) warnings.push(name)
  }
  for (const name of ['GLOBAL_CRAWLER_ENABLED', 'NEWS_CRAWLER_ENABLED', 'CRAWLER_AI_DISPATCH_ENABLED', 'LEGACY_DIRECT_AI_ENABLED', 'MANUAL_EDITOR_AI_ENABLED', 'POSTGRES_READS_ENABLED']) {
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


// ── Firebase hedef koruması (Görev 8) ───────────────────────────────────────

/**
 * SMM test önizlemesi BEYAN EDİLMİŞ mi? (Firebase init seviyesindeki koruma
 * yalnızca bu durumda çalışır; diğer dalların preview'ları etkilenmez.)
 *   - SOCIAL_TEST_MODE=1 ya da SOCIAL_TEST_FIREBASE_PROJECT_ID tanımlı, veya
 *   - Vercel preview'da SMM test dalı (VERCEL_GIT_COMMIT_REF).
 * Production'da (VERCEL_ENV=production) ASLA etkin değildir: yanlış kapsamla
 * eklenmiş bir değişken production'ı durduramaz.
 */
export function isSmmTestDeclared(env: Env = process.env): boolean {
  if (env.VERCEL_ENV === 'production') return false
  if (flag(env.SOCIAL_TEST_MODE) || !!env.SOCIAL_TEST_FIREBASE_PROJECT_ID?.trim() || !!env.NEXT_PUBLIC_SOCIAL_TEST_FIREBASE_PROJECT_ID?.trim()) return true
  const ref = (env.VERCEL_GIT_COMMIT_REF ?? env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF ?? '').trim()
  return (env.VERCEL_ENV === 'preview' || env.NEXT_PUBLIC_VERCEL_ENV === 'preview') &&
    (SMM_TEST_BRANCHES.includes(ref) || ref.startsWith(SMM_TEST_BRANCH_PREFIX))
}

/**
 * Firebase'e GERÇEKTEN bağlanılacak hedef (projectId, kova, kimlik türü)
 * test projesi değilse sorun döndürür (yalnızca değişken adı). null = izinli.
 * Admin SDK `initializeApp` ve istemci `initializeApp` ÖNCESİNDE çağrılır.
 */
export function firebaseTargetProblem(
  target: { projectId: string | null | undefined; bucket: string | null | undefined; credential: 'cert' | 'adc' | 'client' },
  env: Env = process.env,
): string | null {
  if (!isSmmTestDeclared(env)) return null
  const testProject = (env.SOCIAL_TEST_FIREBASE_PROJECT_ID ?? env.NEXT_PUBLIC_SOCIAL_TEST_FIREBASE_PROJECT_ID ?? '').trim()
  if (!testProject) return 'SOCIAL_TEST_FIREBASE_PROJECT_ID'
  if (isProductionProject(testProject, env)) return 'SOCIAL_TEST_FIREBASE_PROJECT_ID (production projesi)'
  // ADC'de hedef proje kimlik dosyasından/ortamdan çıkarılır — doğrulanamaz.
  if (target.credential === 'adc') return 'FIREBASE_SERVICE_ACCOUNT_JSON / FIREBASE_ADMIN_* (ADC test ortamında kapalı)'
  const pid = target.projectId?.trim() || ''
  if (!pid || isProductionProject(pid, env) || pid !== testProject) {
    return target.credential === 'client' ? 'NEXT_PUBLIC_FIREBASE_PROJECT_ID' : 'FIREBASE_ADMIN_PROJECT_ID / FIREBASE_SERVICE_ACCOUNT_JSON'
  }
  const bucket = (target.bucket ?? '').trim().replace(/^gs:\/\//, '')
  if (bucket) {
    const bucketProject = bucket.split('.')[0] ?? ''
    if (isProductionProject(bucketProject, env) || bucketProject !== testProject) {
      return target.credential === 'client' ? 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET' : 'FIREBASE_STORAGE_BUCKET / NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'
    }
  }
  return null
}

/** Hata mesajı yalnızca değişken adı içerir; değer içermez. */
export class SmmTestFirebaseGuardError extends Error {
  constructor(readonly variable: string) {
    super(`SMM test ortamı: Firebase hedefi test projesi değil (${variable}) — production'a bağlanılmadı`)
    this.name = 'SmmTestFirebaseGuardError'
  }
}
