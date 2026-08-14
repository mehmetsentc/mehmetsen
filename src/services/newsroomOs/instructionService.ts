/**
 * Layered instruction inheritance:
 * GLOBAL → DEPARTMENT → ROLE → LOCATION → AGENT → TASK → NEWS
 * Versions are immutable; activate by pointing activeVersionId.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type {
  InstructionLayer,
  InstructionSet,
  InstructionVersion,
  NewsroomAgent,
} from '@/types/newsroomOs'
import { ROLE_DEFAULT_INSTRUCTIONS } from '@/services/newsroomOs/orgSeed'

function setsCol() {
  return getAdminFirestore().collection(Collections.INSTRUCTION_SETS)
}
function versionsCol() {
  return getAdminFirestore().collection(Collections.INSTRUCTION_VERSIONS)
}

export function instructionSetId(layer: InstructionLayer, scopeKey: string): string {
  const safe = scopeKey.replace(/[^a-zA-Z0-9_-]/g, '_') || 'default'
  return `instr-${layer}-${safe}`
}

export async function listInstructionSets(limit = 120): Promise<InstructionSet[]> {
  const snap = await setsCol().limit(Math.min(limit, 200)).get()
  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<InstructionSet, 'id'>) }))
  rows.sort((a, b) => a.layer.localeCompare(b.layer) || a.title.localeCompare(b.title, 'tr'))
  return rows
}

export async function getInstructionSet(id: string): Promise<InstructionSet | null> {
  const snap = await setsCol().doc(id).get()
  if (!snap.exists) return null
  return { id: snap.id, ...(snap.data() as Omit<InstructionSet, 'id'>) }
}

export async function listInstructionVersions(setId: string, limit = 30): Promise<InstructionVersion[]> {
  const snap = await versionsCol().where('setId', '==', setId).limit(Math.min(limit, 50)).get()
  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<InstructionVersion, 'id'>) }))
  rows.sort((a, b) => (b.version ?? 0) - (a.version ?? 0))
  return rows
}

export async function getInstructionVersion(id: string): Promise<InstructionVersion | null> {
  const snap = await versionsCol().doc(id).get()
  if (!snap.exists) return null
  return { id: snap.id, ...(snap.data() as Omit<InstructionVersion, 'id'>) }
}

export async function upsertInstructionSetVersion(input: {
  layer: InstructionLayer
  scopeKey: string
  title: string
  content: string
  changelog?: string
  createdByHumanId?: string | null
  activate?: boolean
}): Promise<{ set: InstructionSet; version: InstructionVersion }> {
  const setId = instructionSetId(input.layer, input.scopeKey)
  const setRef = setsCol().doc(setId)
  const existing = await setRef.get()
  const now = Date.now()
  const prevSet = existing.exists
    ? ({ id: setId, ...(existing.data() as Omit<InstructionSet, 'id'>) } as InstructionSet)
    : null

  let previousContent: string | null = null
  let nextVersion = 1
  if (prevSet?.activeVersionId) {
    const prevVer = await getInstructionVersion(prevSet.activeVersionId)
    previousContent = prevVer?.content ?? null
    nextVersion = (prevSet.activeVersion ?? prevVer?.version ?? 0) + 1
  }

  const versionRef = versionsCol().doc()
  const version: InstructionVersion = {
    id: versionRef.id,
    setId,
    version: nextVersion,
    content: input.content.trim(),
    changelog: input.changelog ?? null,
    createdByHumanId: input.createdByHumanId ?? null,
    createdByAgentId: null,
    createdAt: now,
    previousContent,
  }
  await versionRef.set(version)

  const set: InstructionSet = {
    id: setId,
    layer: input.layer,
    title: input.title,
    scopeKey: input.scopeKey,
    status: input.activate === false ? 'draft' : 'active',
    activeVersionId: input.activate === false ? prevSet?.activeVersionId ?? null : version.id,
    activeVersion: input.activate === false ? prevSet?.activeVersion ?? null : nextVersion,
    createdAt: prevSet?.createdAt ?? now,
    updatedAt: now,
  }
  await setRef.set(set, { merge: true })
  return { set, version }
}

const GLOBAL_EDITORIAL = `NaHaber Global Editorial Rules
1) Kaynakta yazıyor diye kesin doğru kabul etme. İddia ile doğrulanmış bilgiyi ayır.
2) Türkçe haber dili: net, tarafsız, abartısız. "şok/dehşet/korkunç" gibi sansasyon ifadelerinden kaçın.
3) İsim, sayı, tarih, alıntı ve yer bilgisini kaynakla uyumlu tut.
4) Yüksek riskli suçlama, çocuk kimliği, özel hayat, nefret söylemi, telifte human approval uygula.
5) SEO için yanıltıcı başlık yazma. Clickbait yasak.
6) AI çıktısını schema ile doğrula; başarısızsa retry/fallback.
7) Production kurallarını kendi başına değiştirme — learning yalnızca öneri üretir.`

const DEPARTMENT_RULES: Array<{ scopeKey: string; title: string; content: string }> = [
  {
    scopeKey: 'writing',
    title: 'Yazı İşleri Kuralları',
    content:
      'Fact-check, quality ve legal aşamalarını atlama. Skorları açıklanabilir tut. NEEDS_HUMAN durumunu gizleme.',
  },
  {
    scopeKey: 'social',
    title: 'Sosyal Medya Kuralları',
    content:
      'Platforma göre metin üret. Aynı gönderiyi idempotent yayınla. Token/şifre prompta koyma. Başarısız yayında escalation yap.',
  },
  {
    scopeKey: 'desk-local',
    title: 'Yerel Masa Kuralları',
    content:
      'İl/ilçe bağlamını doğrula. Ulusal haberi yerel gibi sunma. Belediye duyurularında kaynak kurumunu belirt.',
  },
  {
    scopeKey: 'desk-health',
    title: 'Sağlık Masası Kuralları',
    content:
      'Tıbbi iddialarda kesin tedavi vaadi verme. Çalışma/uzman kaynağı yoksa UNVERIFIED işaretle.',
  },
  {
    scopeKey: 'desk-politics',
    title: 'Politika Masası Kuralları',
    content:
      'Tarafsız dil kullan. Suç isnadı ve seçim iddialarında kaynak + human approval eşiklerini yükselt.',
  },
  {
    scopeKey: 'digital',
    title: 'Dijital Yayın Kuralları',
    content:
      'Push/discover önerilerinde breaking ve risk skorunu dikkate al. Otomatik yayın autonomy level sınırları içinde kalsın.',
  },
  {
    scopeKey: 'algorithm',
    title: 'Algoritma Kuralları',
    content: 'Yalnızca proposal üret. Production feed ağırlıklarını insan onayı olmadan değiştirme.',
  },
  {
    scopeKey: 'learning',
    title: 'Öğrenme Kuralları',
    content:
      'Diff + performans patternlerinden öneri çıkar. Sandbox test + human approval olmadan deploy etme.',
  },
]

const ROLE_RULE_SCOPES: Array<{ scopeKey: keyof typeof ROLE_DEFAULT_INSTRUCTIONS; title: string }> = [
  { scopeKey: 'fact-checker', title: 'Fact Checker Rol Kuralları' },
  { scopeKey: 'legal-risk', title: 'Legal/Risk Rol Kuralları' },
  { scopeKey: 'seo-editor', title: 'SEO Editor Rol Kuralları' },
  { scopeKey: 'city-smm', title: 'City SMM Rol Kuralları' },
  { scopeKey: 'desk-editor', title: 'Masa Editörü Rol Kuralları' },
  { scopeKey: 'local-editor', title: 'Yerel Editör Rol Kuralları' },
  { scopeKey: 'algorithm-analyst', title: 'Algorithm Agent Rol Kuralları' },
  { scopeKey: 'learning-analyst', title: 'Learning Agent Rol Kuralları' },
]

const LOCATION_CANAKKALE = `Çanakkale lokasyon kuralları
- Yerel duyuru ve belediye içeriklerinde kurum adını koru.
- Gelibolu / Ezine / Biga gibi ilçe adlarını doğru kullan.
- Troya / Çanakkale Boğazı bağlamını abartılı turizm diliyle çarpıtma.
- Yerel spor ve etkinlik haberlerinde tarih/saat net olsun.`

export async function seedDefaultInstructionSets(createdByHumanId?: string | null): Promise<{
  created: string[]
  updated: string[]
}> {
  const created: string[] = []
  const updated: string[] = []

  const write = async (
    layer: InstructionLayer,
    scopeKey: string,
    title: string,
    content: string
  ) => {
    const id = instructionSetId(layer, scopeKey)
    const exists = await getInstructionSet(id)
    await upsertInstructionSetVersion({
      layer,
      scopeKey,
      title,
      content,
      changelog: exists ? 'Seed refresh' : 'Initial seed',
      createdByHumanId,
      activate: true,
    })
    if (exists) updated.push(id)
    else created.push(id)
  }

  await write('global', 'default', 'Global Editorial Rules', GLOBAL_EDITORIAL)
  for (const d of DEPARTMENT_RULES) {
    await write('department', d.scopeKey, d.title, d.content)
  }
  for (const r of ROLE_RULE_SCOPES) {
    const content = ROLE_DEFAULT_INSTRUCTIONS[r.scopeKey]
    if (!content) continue
    await write('role', r.scopeKey, r.title, content)
  }
  await write('location', 'canakkale', 'Çanakkale Location Rules', LOCATION_CANAKKALE)

  return { created, updated }
}

export async function buildEffectiveInstructions(agent: NewsroomAgent): Promise<{
  layers: Array<{
    layer: InstructionLayer
    setId: string
    versionId: string
    title: string
    content: string
  }>
  combinedText: string
  versionIds: string[]
}> {
  const wanted: Array<{ layer: InstructionLayer; scopeKey: string }> = [
    { layer: 'global', scopeKey: 'default' },
    { layer: 'department', scopeKey: agent.departmentId },
    { layer: 'role', scopeKey: agent.roleTemplateId },
  ]
  for (const city of agent.territories ?? []) {
    wanted.push({ layer: 'location', scopeKey: city })
  }
  // Agent custom instructions as virtual layer (not necessarily a set doc)
  const layers: Array<{
    layer: InstructionLayer
    setId: string
    versionId: string
    title: string
    content: string
  }> = []

  for (const w of wanted) {
    const set = await getInstructionSet(instructionSetId(w.layer, w.scopeKey))
    if (!set?.activeVersionId || set.status !== 'active') continue
    const ver = await getInstructionVersion(set.activeVersionId)
    if (!ver?.content) continue
    layers.push({
      layer: w.layer,
      setId: set.id,
      versionId: ver.id,
      title: set.title,
      content: ver.content,
    })
  }

  if (agent.customInstructions?.trim()) {
    layers.push({
      layer: 'agent',
      setId: `agent:${agent.id}`,
      versionId: `agent-custom:${agent.id}`,
      title: `${agent.displayName} custom`,
      content: agent.customInstructions.trim(),
    })
  }

  const combinedText = layers
    .map((l) => `### [${l.layer.toUpperCase()}] ${l.title}\n${l.content}`)
    .join('\n\n')

  return {
    layers,
    combinedText,
    versionIds: layers.map((l) => l.versionId),
  }
}
