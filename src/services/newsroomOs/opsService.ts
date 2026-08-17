/**
 * CMS audit log reader + system health probes (no secrets).
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { AuditLogEntry } from '@/types/newsroomOs'
import { getCmsFeatureFlags } from '@/lib/cms/featureFlags'
import { getSiteSettings } from '@/services/siteSettings.server'

export async function listAuditLogs(limit = 80): Promise<AuditLogEntry[]> {
  const snap = await getAdminFirestore()
    .collection(Collections.CMS_AUDIT_LOGS)
    .limit(Math.min(limit, 200))
    .get()
  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLogEntry, 'id'>) }))
  rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  return rows.slice(0, limit)
}

export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN'

export type HealthCheck = {
  id: string
  label: string
  status: HealthStatus
  detail: string
  href?: string
}

export async function probeSystemHealth(): Promise<{
  checks: HealthCheck[]
  flags: ReturnType<typeof getCmsFeatureFlags>
  at: number
}> {
  const checks: HealthCheck[] = []
  const db = getAdminFirestore()

  try {
    await db.collection(Collections.NEWS).limit(1).get()
    checks.push({
      id: 'firestore',
      label: 'Database (Firestore)',
      status: 'HEALTHY',
      detail: 'Okuma başarılı',
    })
  } catch (e) {
    checks.push({
      id: 'firestore',
      label: 'Database (Firestore)',
      status: 'DOWN',
      detail: e instanceof Error ? e.message : 'Okuma hatası',
    })
  }

  try {
    const q = await db.collection(Collections.NEWS_QUEUE).limit(1).get()
    checks.push({
      id: 'news-queue',
      label: 'News Queue',
      status: 'HEALTHY',
      detail: q.empty ? 'Kuyruk boş / erişilebilir' : 'Kuyruk erişilebilir',
      href: '/admin/newsroom',
    })
  } catch {
    checks.push({
      id: 'news-queue',
      label: 'News Queue',
      status: 'UNKNOWN',
      detail: 'Koleksiyon okunamadı',
      href: '/admin/newsroom',
    })
  }

  const deepseek = Boolean(process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_KEY)
  const gemini = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY)
  checks.push({
    id: 'ai-providers',
    label: 'AI Servisleri',
    status: deepseek || gemini ? 'HEALTHY' : 'DEGRADED',
    detail: `DeepSeek: ${deepseek ? 'yapılandırıldı' : 'yok'} · Gemini: ${gemini ? 'yapılandırıldı' : 'yok'}`,
    href: '/admin/ai-models',
  })

  const fb = Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN)
  checks.push({
    id: 'social',
    label: 'Social Services',
    status: fb ? 'HEALTHY' : 'DEGRADED',
    detail: fb ? 'Meta token mevcut (değer gösterilmez)' : 'Meta token yok — manuel paylaşım sınırlı',
    href: '/admin/social',
  })

  checks.push({
    id: 'cron',
    label: 'Cron / Automation',
    status: 'UNKNOWN',
    detail: 'Son koşular Cron İzleme sayfasından doğrulanır',
    href: '/admin/cron',
  })

  checks.push({
    id: 'auth',
    label: 'Authentication',
    status: 'HEALTHY',
    detail: 'CMS verifyCmsToken + cms_session aktif',
  })

  const settings = await getSiteSettings()
  return { checks, flags: getCmsFeatureFlags(settings.cmsFlags), at: Date.now() }
}

export function getAiModelRegistry() {
  const mask = (configured: boolean) => (configured ? 'configured' : 'missing')
  return [
    {
      id: 'deepseek',
      label: 'DeepSeek',
      role: 'primary rewrite / multi-stage',
      status: mask(Boolean(process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_KEY)),
    },
    {
      id: 'gemini',
      label: 'Gemini',
      role: 'research / social / image',
      status: mask(
        Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY)
      ),
    },
    {
      id: 'groq',
      label: 'Groq',
      role: 'classifier canary (gpt-oss-20b)',
      status: mask(Boolean(process.env.GROQ_API_KEY)),
    },
    {
      id: 'openai',
      label: 'OpenAI',
      role: 'optional fallback',
      status: mask(Boolean(process.env.OPENAI_API_KEY)),
    },
    {
      id: 'anthropic',
      label: 'Anthropic',
      role: 'optional fallback',
      status: mask(Boolean(process.env.ANTHROPIC_API_KEY)),
    },
    {
      id: 'meta-llama',
      label: 'Meta Llama (captions)',
      role: 'social captions',
      status: mask(Boolean(process.env.META_LLAMA_API_KEY || process.env.GROQ_API_KEY)),
    },
  ]
}
