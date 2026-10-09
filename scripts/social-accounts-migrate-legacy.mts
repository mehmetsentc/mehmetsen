/**
 * Onyeditivi legacy bağlantılarından `socialAccounts` kayıtları hazırlar.
 *
 * Varsayılan: DRY-RUN — hiçbir yere yazmaz, Firestore'a bağlanmaz.
 *
 *   npx tsx scripts/social-accounts-migrate-legacy.mts                 # dry-run (yalnızca env)
 *   npx tsx scripts/social-accounts-migrate-legacy.mts --read-firestore # dry-run + mevcut kayıt/BYO okuması (salt okuma)
 *   npx tsx scripts/social-accounts-migrate-legacy.mts --apply --target=emulator
 *   npx tsx scripts/social-accounts-migrate-legacy.mts --apply --target=production --project=<firebase-project-id>
 *
 * Seçenekler: --city=<il-slug> (varsayılan: canakkale), --publisher=<id>, --dotenv=<yol> (ana çalışma ağacının .env.local dosyası için)
 *
 * Güvenlik:
 *   - Token/secret değerleri okunmaz, yazılmaz, yazdırılmaz; yalnızca "var/yok" bilgisi.
 *   - Yeni kayıtlar legacy kaynağa referans verir (düz metin kopya yok).
 *   - Deterministik kimlik + transaction create → tekrar çalıştırma mükerrer üretmez.
 *   - Yazma için hem --apply hem açık --target gerekir; hedef ortam doğrulanır.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvLocal(): void {
  // --dotenv=<path> (ör. ana çalışma ağacındaki .env.local); varsayılan ./.env.local
  const custom = process.argv.find((a) => a.startsWith('--dotenv='))?.slice('--dotenv='.length)
  const p = resolve(process.cwd(), custom || '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    const [, k, raw] = m
    const v = raw.replace(/^"|"$/g, '')
    if (!(k in process.env)) process.env[k] = v
  }
}

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3).trim() || null : null
}
const flag = (name: string) => process.argv.includes(`--${name}`)
const env = (k: string) => process.env[k]?.trim() || ''

async function main(): Promise<void> {
  loadEnvLocal()
  const apply = flag('apply')
  const readFirestore = flag('read-firestore') || apply
  const target = arg('target')
  const city = (arg('city') ?? 'canakkale').toLowerCase()
  const publisher = arg('publisher')

  if (apply) {
    if (target !== 'emulator' && target !== 'production') {
      console.error('HATA: --apply için --target=emulator veya --target=production zorunlu.')
      process.exit(2)
    }
    if (target === 'emulator' && !env('FIRESTORE_EMULATOR_HOST')) {
      console.error('HATA: --target=emulator ama FIRESTORE_EMULATOR_HOST tanımlı değil.')
      process.exit(2)
    }
    if (target === 'production') {
      if (env('FIRESTORE_EMULATOR_HOST')) {
        console.error('HATA: --target=production ama FIRESTORE_EMULATOR_HOST tanımlı.')
        process.exit(2)
      }
      if (!arg('project')) {
        console.error('HATA: --target=production için --project=<firebase-project-id> zorunlu.')
        process.exit(2)
      }
    }
  }

  const { buildLegacyMigrationPlan, describePlan, applyLegacyMigrationPlan } = await import(
    '../src/lib/social/accounts/legacyMigration.ts'
  )
  const { Collections } = await import('../src/lib/firebase/collections.ts')

  // Facebook page id: same priority as resolveFacebookCredentials (BYO Firestore → ONYEDITIVI_FB_* → global).
  let facebookPageId = { value: null as string | null, source: 'FACEBOOK_PAGE_ID' }
  let existingAccountIds: Set<string> | null = null
  let db: unknown = null

  if (readFirestore) {
    const { getAdminFirestore } = (await import('../src/lib/firebase/admin.ts')) as {
      getAdminFirestore: () => import('firebase-admin/firestore').Firestore
    }
    const fs = getAdminFirestore()
    db = fs
    if (apply && target === 'production') {
      const projectId = fs.app.options.projectId ?? ''
      if (projectId !== arg('project')) {
        console.error('HATA: --project bağlanılan Firebase projesiyle eşleşmiyor; yazma yapılmadı.')
        process.exit(2)
      }
    }
    const byo = await fs.collection('config').doc('socialFacebookApps').get()
    const site = (byo.data()?.sites as Record<string, { fbAppId?: string; fbPageId?: string; fbPageAccessTokenEncrypted?: string }> | undefined)?.onyeditivi
    if (site?.fbAppId?.trim() && site.fbPageAccessTokenEncrypted?.trim() && site.fbPageId?.trim()) {
      facebookPageId = { value: site.fbPageId.trim(), source: 'config/socialFacebookApps.sites.onyeditivi.fbPageId' }
    }
    const snap = await fs.collection(Collections.SOCIAL_ACCOUNTS).select().get()
    existingAccountIds = new Set(snap.docs.map((d) => d.id))
  } else {
    console.log('Not: Firestore okunmadı (dry-run varsayılanı). BYO Facebook sayfa kimliği yalnızca --read-firestore ile görülür;')
    console.log('     resolvePublishTarget yayın anında legacy kimliğin hesabı gösterdiğini ayrıca doğrular.')
  }

  if (!facebookPageId.value) {
    if (env('ONYEDITIVI_FB_APP_ID') && env('ONYEDITIVI_FB_PAGE_ACCESS_TOKEN') && env('ONYEDITIVI_FB_PAGE_ID')) {
      facebookPageId = { value: env('ONYEDITIVI_FB_PAGE_ID'), source: 'ONYEDITIVI_FB_PAGE_ID' }
    } else {
      facebookPageId = { value: env('FACEBOOK_PAGE_ID') || null, source: 'FACEBOOK_PAGE_ID' }
    }
  }

  const plan = buildLegacyMigrationPlan({
    facebookPageId,
    instagramUserId: { value: env('INSTAGRAM_BUSINESS_ID') || null, source: 'INSTAGRAM_BUSINESS_ID' },
    threadsUserId: { value: env('THREADS_USER_ID') || null, source: 'THREADS_USER_ID' },
    credentialPresent: {
      // Presence only. Firestore config/socialMedia tokens are not read here; env presence is a lower bound.
      facebook: Boolean(env('FACEBOOK_PAGE_ACCESS_TOKEN') || env('ONYEDITIVI_FB_PAGE_ACCESS_TOKEN')),
      instagram: Boolean(env('INSTAGRAM_ACCESS_TOKEN') || env('FACEBOOK_PAGE_ACCESS_TOKEN')),
      threads: Boolean(env('THREADS_ACCESS_TOKEN')),
    },
    ownership: { citySlug: city || null, publisherId: publisher },
    actor: 'migration:social-accounts-legacy',
    now: Date.now(),
    existingAccountIds,
  })

  console.log(`\nMod: ${apply ? `APPLY (hedef=${target})` : 'DRY-RUN (yazma yok)'}  sahiplik: il=${city || '-'} yayıncı=${publisher ?? '-'}`)
  for (const line of describePlan(plan)) console.log(line)
  if (plan.problems.length) {
    console.log('\nEksik yapılandırma:')
    for (const p of plan.problems) console.log(` - ${p}`)
  }

  if (!apply) {
    console.log('\nDRY-RUN tamam — hiçbir kayıt yazılmadı.')
    return
  }
  const results = await applyLegacyMigrationPlan(db as never, plan)
  for (const r of results) console.log(`${r.result === 'created' ? 'YAZILDI' : 'ZATEN VAR'}: ${r.accountId.replace(/_(.*)(.{4})$/, '_…$2')}`)
}

main().catch((err) => {
  console.error('Geçiş aracı hatası:', err instanceof Error ? err.message : 'bilinmeyen hata')
  process.exit(1)
})
