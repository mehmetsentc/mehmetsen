/**
 * Görev 8 — SMM test önizlemesinde Firebase Admin, production projesine
 * initializeApp'ten ÖNCE bağlanmayı reddeder. Gerçek Firebase'e bağlanılmaz.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fb = vi.hoisted(() => ({
  initializeApp: vi.fn((opts: Record<string, unknown>) => ({ options: opts })),
  getApps: vi.fn(() => [] as Array<{ options: Record<string, unknown> }>),
}))
vi.mock('firebase-admin/app', () => ({
  initializeApp: fb.initializeApp,
  getApps: fb.getApps,
  cert: (x: Record<string, unknown>) => ({ kind: 'cert', projectId: x.projectId }),
  applicationDefault: () => ({ kind: 'adc' }),
}))
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({ settings: () => {} }) }))
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({}) }))
vi.mock('firebase-admin/storage', () => ({ getStorage: () => ({}) }))

import { firebaseTargetProblem, isSmmTestDeclared, testOAuthBaseUrl } from './testEnvironment'

const KEYS = [
  'VERCEL_ENV', 'VERCEL_GIT_COMMIT_REF', 'SOCIAL_TEST_MODE', 'SOCIAL_TEST_FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_SOCIAL_TEST_FIREBASE_PROJECT_ID',
  'FIREBASE_SERVICE_ACCOUNT_JSON', 'FIREBASE_ADMIN_PROJECT_ID', 'FIREBASE_ADMIN_CLIENT_EMAIL', 'FIREBASE_ADMIN_PRIVATE_KEY',
  'GCLOUD_PROJECT', 'FIREBASE_STORAGE_BUCKET', 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', 'SOCIAL_PRODUCTION_FIREBASE_PROJECT_IDS',
  'VERCEL_PROJECT_PRODUCTION_URL', 'SOCIAL_OAUTH_BASE_URL',
] as const
let saved: Record<string, string | undefined> = {}
const PROD_KEY = '-----BEGIN PRIVATE KEY-----\nPRODKEYMATERIAL\n-----END PRIVATE KEY-----'

function env(vals: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const [k, v] of Object.entries(vals)) process.env[k] = v
}
function prodCreds() {
  env({
    FIREBASE_ADMIN_PROJECT_ID: 'nahaberapp',
    FIREBASE_ADMIN_CLIENT_EMAIL: 'svc@nahaberapp.iam.gserviceaccount.com',
    FIREBASE_ADMIN_PRIVATE_KEY: PROD_KEY,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'nahaberapp.firebasestorage.app',
  })
}
async function loadAdmin() {
  vi.resetModules()
  return import('@/lib/firebase/admin')
}

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
  for (const k of KEYS) delete process.env[k]
  fb.initializeApp.mockClear()
  fb.getApps.mockReturnValue([])
})
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('Firebase Admin — SMM test önizlemesi koruması', () => {
  it('beyan yoksa (yerel / diğer dalların preview’ı) davranış aynı', async () => {
    prodCreds()
    expect(isSmmTestDeclared()).toBe(false)
    ;(await loadAdmin()).getAdminFirestore()
    expect(fb.initializeApp).toHaveBeenCalledTimes(1)
    expect(fb.initializeApp.mock.calls[0][0]).toMatchObject({ projectId: 'nahaberapp' })

    env({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'cursor/seo6-cache-root' })
    expect(isSmmTestDeclared()).toBe(false)
  })

  it('production’da yanlış kapsamla eklenmiş test değişkeni production’ı durdurmaz', async () => {
    prodCreds()
    env({ VERCEL_ENV: 'production', SOCIAL_TEST_FIREBASE_PROJECT_ID: 'nahaber-smm-test', SOCIAL_TEST_MODE: '1' })
    expect(isSmmTestDeclared()).toBe(false)
    ;(await loadAdmin()).getAdminAuth()
    expect(fb.initializeApp).toHaveBeenCalledTimes(1)
  })

  it('SMM dalının preview’ı + production kimlik bilgileri → initializeApp çağrılmadan hata (değer sızmaz)', async () => {
    prodCreds()
    env({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'feat/social-multi-account-foundation' })
    expect(isSmmTestDeclared()).toBe(true)
    const admin = await loadAdmin()
    let err: unknown
    try { admin.getAdminFirestore() } catch (e) { err = e }
    expect((err as Error).name).toBe('SmmTestFirebaseGuardError')
    expect((err as Error).message).toMatch(/SOCIAL_TEST_FIREBASE_PROJECT_ID/)
    expect((err as Error).message).not.toMatch(/nahaberapp|PRODKEY|svc@/)
    expect(() => admin.getAdminAuth()).toThrow(/production'a bağlanılmadı/)
    expect(() => admin.getAdminStorage()).toThrow()
    expect(fb.initializeApp).not.toHaveBeenCalled()
  })

  it('test projesi beyan edilmiş ama kimlik bilgisi production’a ait → hata', async () => {
    prodCreds()
    env({ VERCEL_ENV: 'preview', SOCIAL_TEST_FIREBASE_PROJECT_ID: 'nahaber-smm-test' })
    await expect((async () => (await loadAdmin()).getAdminFirestore())()).rejects.toThrow(/FIREBASE_ADMIN_PROJECT_ID/)
    expect(fb.initializeApp).not.toHaveBeenCalled()
  })

  it('gerçek öncelik: eksik FIREBASE_SERVICE_ACCOUNT_JSON test projesi gösterse de kullanılan production üçlüsü reddedilir', async () => {
    prodCreds()
    env({
      SOCIAL_TEST_MODE: '1',
      SOCIAL_TEST_FIREBASE_PROJECT_ID: 'nahaber-smm-test',
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'nahaber-smm-test', client_email: 'x@y' }), // private_key yok → kullanılmaz
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'nahaber-smm-test.firebasestorage.app',
    })
    await expect((async () => (await loadAdmin()).getAdminFirestore())()).rejects.toThrow(/FIREBASE_ADMIN_PROJECT_ID/)
    expect(fb.initializeApp).not.toHaveBeenCalled()
  })

  it('ADC (servis hesabı env’i yok) test ortamında kapalı', async () => {
    env({ SOCIAL_TEST_MODE: '1', SOCIAL_TEST_FIREBASE_PROJECT_ID: 'nahaber-smm-test', GCLOUD_PROJECT: 'nahaber-smm-test' })
    await expect((async () => (await loadAdmin()).getAdminFirestore())()).rejects.toThrow(/ADC/)
    expect(fb.initializeApp).not.toHaveBeenCalled()
  })

  it('test servis hesabı + production kovası → hata; test kovası → test projesiyle başlatılır', async () => {
    env({
      VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_REF: 'smm-test/threads-1',
      SOCIAL_TEST_FIREBASE_PROJECT_ID: 'nahaber-smm-test',
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'nahaber-smm-test', client_email: 'svc@nahaber-smm-test.iam', private_key: 'TESTKEY' }),
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'nahaberapp.firebasestorage.app',
    })
    await expect((async () => (await loadAdmin()).getAdminFirestore())()).rejects.toThrow(/STORAGE_BUCKET/)
    env({ NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'nahaber-smm-test.firebasestorage.app' })
    ;(await loadAdmin()).getAdminFirestore()
    expect(fb.initializeApp).toHaveBeenCalledTimes(1)
    expect(fb.initializeApp.mock.calls[0][0]).toMatchObject({ projectId: 'nahaber-smm-test', storageBucket: 'nahaber-smm-test.firebasestorage.app' })
  })

  it('başka modülün production ile başlattığı uygulama da reddedilir', async () => {
    fb.getApps.mockReturnValue([{ options: { projectId: 'nahaberapp' } }])
    env({ SOCIAL_TEST_MODE: '1', SOCIAL_TEST_FIREBASE_PROJECT_ID: 'nahaber-smm-test' })
    await expect((async () => (await loadAdmin()).getAdminFirestore())()).rejects.toThrow(/FIREBASE_ADMIN_PROJECT_ID/)
  })
})

describe('production adları tek sabite bağlı değil', () => {
  it('ek production projeleri env ile genişletilir; test projesi production olamaz', () => {
    const base = { SOCIAL_TEST_MODE: '1', SOCIAL_TEST_FIREBASE_PROJECT_ID: 'nahaber-staging', SOCIAL_PRODUCTION_FIREBASE_PROJECT_IDS: 'nahaber-staging, other-prod' }
    expect(firebaseTargetProblem({ projectId: 'nahaber-staging', bucket: null, credential: 'cert' }, base)).toMatch(/production projesi/)
    expect(firebaseTargetProblem({ projectId: 'other-prod', bucket: null, credential: 'cert' }, { ...base, SOCIAL_TEST_FIREBASE_PROJECT_ID: 't1' })).toMatch(/FIREBASE_ADMIN_PROJECT_ID/)
    expect(firebaseTargetProblem({ projectId: 't1', bucket: 't1.appspot.com', credential: 'cert' }, { ...base, SOCIAL_TEST_FIREBASE_PROJECT_ID: 't1' })).toBeNull()
  })

  it('istemci yapılandırması (NEXT_PUBLIC_*) aynı kurala tabi', () => {
    const clientEnv = { NEXT_PUBLIC_VERCEL_ENV: 'preview', NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF: 'feat/social-multi-account-foundation', NEXT_PUBLIC_SOCIAL_TEST_FIREBASE_PROJECT_ID: 'nahaber-smm-test' }
    expect(firebaseTargetProblem({ projectId: 'nahaberapp', bucket: 'nahaberapp.firebasestorage.app', credential: 'client' }, clientEnv)).toBe('NEXT_PUBLIC_FIREBASE_PROJECT_ID')
    expect(firebaseTargetProblem({ projectId: 'nahaber-smm-test', bucket: 'nahaberapp.firebasestorage.app', credential: 'client' }, clientEnv)).toBe('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET')
    expect(firebaseTargetProblem({ projectId: 'nahaber-smm-test', bucket: 'nahaber-smm-test.firebasestorage.app', credential: 'client' }, clientEnv)).toBeNull()
    // SMM dalı ama test projesi beyan edilmemiş → istemci hiç başlatılmaz
    expect(firebaseTargetProblem({ projectId: 'nahaberapp', bucket: null, credential: 'client' }, { NEXT_PUBLIC_VERCEL_ENV: 'preview', NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF: 'feat/social-multi-account-foundation' })).toBe('SOCIAL_TEST_FIREBASE_PROJECT_ID')
  })

  it('callback kökü: *.nahaber.com, nahaber.vercel.app ve VERCEL_PROJECT_PRODUCTION_URL reddedilir', () => {
    for (const host of ['https://www.nahaber.com', 'https://antalya.nahaber.com', 'https://nahaber.vercel.app', 'https://news.example.org']) {
      expect(testOAuthBaseUrl({ SOCIAL_OAUTH_BASE_URL: host, VERCEL_PROJECT_PRODUCTION_URL: 'news.example.org' }), host).toBeNull()
    }
    expect(testOAuthBaseUrl({ SOCIAL_OAUTH_BASE_URL: 'https://nahaber-git-feat-social-multi-account-foundation-shenteam1.vercel.app' })).toBe(
      'https://nahaber-git-feat-social-multi-account-foundation-shenteam1.vercel.app',
    )
  })
})
