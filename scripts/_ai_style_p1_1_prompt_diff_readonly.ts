/**
 * AI STYLE P1.1 — Task 13: human preview dataset.
 * READ-ONLY, ZERO AI CALLS, ZERO FIRESTORE ACCESS.
 * Builds CURRENT (pre-P1.1) vs PROPOSED (post-P1.1) full `system` prompt text for
 * 8 representative editors (Son Dakika / Yerel / Türkiye / Dünya / Ekonomi / Spor /
 * Magazin / Teknoloji) purely from static seed source + snapshotted pre-edit
 * constants, and writes a single markdown file a human can read side by side.
 * This produces PROMPT TEXT ONLY — it never calls an AI provider.
 */
import { writeFileSync } from 'node:fs'
import { SEED_AI_EDITORS } from '../src/lib/ai/editorial/seedEditors'
import { SEED_CITY_AI_EDITORS } from '../src/lib/ai/editorial/seedCityEditors'
import { GLOBAL_NEWSROOM_RULES as NEW_GLOBAL_NEWSROOM_RULES } from '../src/lib/ai/editorial/seedEditors'
import { NEWS_FORMAT_LOCK as NEW_NEWS_FORMAT_LOCK } from '../src/lib/ai/editorial/promptBuilder'

// --- Exact pre-P1.1 snapshots (target SHA 5498689, before this phase's edits) ---
const OLD_GLOBAL_NEWSROOM_RULES = `Sen NaHaber dijital newsroom'unda çalışan profesyonel bir AI editörsün.
Yalnızca verilen ve erişilen kanıtlara dayanan özgün Türkçe gazetecilik üret.
Olguları, alıntıları, sayıları, tarihleri, yerleri, isimleri, kaynakları veya tanıklıkları UYDURMA.
Doğrulanmış bilgi ile iddia / gelişen durumu ayır.
Mobil okuma için kısa paragraflar; net Türkçe; sansasyon ve clickbait yok.
Sayıları kaynakla birebir koru (dönüşüm gerekiyorsa matematiksel olarak doğrula).
Kanıt yetersizse varsayımla doldurma; uyarı bayrağı kaldır.
KONUM: teknoloji/otomobil/sağlık/yaşam/gastronomi/magazin → ulusal; TR il uydurma YASAK.
"orta/ortada", "genç", "keskin" günlük kelime ≠ Çankırı/Orta vb. "Bingöl'ün Genç ilçesinde" → Bingöl+Genç.
AA "ANKARA" dateline olay yeri değildir. Belirsizse city boş bırak.`

const OLD_NEWS_FORMAT_LOCK = `
HABER BİÇİMİ (bu editörün tarzıyla birlikte uygula):
- Ters piramit gazete haberi yaz; okul kompozisyonu (giriş-gelişme-sonuç) YAZMA
- content gövdesi 250-450 kelime hedef (asgari ~220); kaynak inceyse bile olguları genişleterek anlamlı paragraf yaz, doldurma/nutuk yok
- Gövdede EN AZ 2, mümkünse 3-4 tane ## alt başlık ZORUNLU (yalnızca asgari kelime sınırına yakın en kısa haberlerde en az 1 yeterli)
- Alt başlıklar olay-özgü ve somut olsun (ör. "Bakanlıktan Açıklama", "Soruşturma Başlatıldı", "Vatandaşlar Ne Diyor"); jenerik ders kitabı başlığı ("Sonuç", "Önemi", "Genel Değerlendirme", "Biyolojik Çeşitlilik…" vb.) YASAK
- Her ## başlıktan sonra en az 1 dolu paragraf gelsin; başlığı yazıp boş bırakma
- Alt başlıkları markdown ## ile yaz, HTML etiketi kullanma
`.trim()

function oldCoreFor(newCore: string): string {
  if (!newCore.includes(NEW_GLOBAL_NEWSROOM_RULES)) {
    throw new Error('Assumption broken: persona core no longer starts with GLOBAL_NEWSROOM_RULES verbatim')
  }
  return newCore.replace(NEW_GLOBAL_NEWSROOM_RULES, OLD_GLOBAL_NEWSROOM_RULES)
}

type Sample = { label: string; slug: string }
const SAMPLES: Sample[] = [
  { label: 'Son Dakika', slug: 'arda-sahin' },
  { label: 'Türkiye / Gündem', slug: 'selin-aras' },
  { label: 'Dünya', slug: 'defne-aksoy' },
  { label: 'Ekonomi', slug: 'kerem-aydin' },
  { label: 'Spor', slug: 'deniz-erdem' },
  { label: 'Magazin', slug: 'melis-kaya' },
  { label: 'Teknoloji', slug: 'can-tunc' },
]

const cityEditor = SEED_CITY_AI_EDITORS.find((e) => e.citySlug === 'canakkale')!
SAMPLES.push({ label: 'Yerel (Çanakkale)', slug: cityEditor.slug })

const allSpecs = [...SEED_AI_EDITORS, ...SEED_CITY_AI_EDITORS]

let md = `# AI STYLE P1.1 — Human Preview Dataset (Task 13)\n\n`
md += `READ-ONLY prompt-text diff. Zero AI provider calls, zero Firestore access, zero production writes.\n`
md += `Bu dosya yalnızca **PROMPT METNİNİ** karşılaştırır — bir AI çıktısı DEĞİLDİR.\n\n---\n\n`

for (const sample of SAMPLES) {
  const spec = allSpecs.find((s) => s.slug === sample.slug)
  if (!spec) throw new Error(`Seed spec not found: ${sample.slug}`)
  const newCore = spec.prompts.core!
  const newsPrompt = spec.prompts.news ?? ''
  const oldCore = oldCoreFor(newCore)

  const CURRENT_SYSTEM = [oldCore, newsPrompt, OLD_NEWS_FORMAT_LOCK].filter(Boolean).join('\n\n')
  const PROPOSED_SYSTEM = [newCore, newsPrompt, NEW_NEWS_FORMAT_LOCK].filter(Boolean).join('\n\n')

  md += `## ${sample.label} — ${spec.name} (\`${spec.slug}\`)\n\n`
  md += `### CURRENT (pre-P1.1, target SHA 5498689)\n\n\`\`\`\n${CURRENT_SYSTEM}\n\`\`\`\n\n`
  md += `### PROPOSED (NaHaber High-Engagement DNA, this phase — NOT applied to production)\n\n\`\`\`\n${PROPOSED_SYSTEM}\n\`\`\`\n\n`
  md += `---\n\n`
}

const outPath = 'scripts/_ai_style_p1_1_prompt_diff_output.md'
writeFileSync(outPath, md, 'utf8')
console.log(JSON.stringify({ success: true, samples: SAMPLES.length, outPath, aiCallsMade: 0, firestoreReadsMade: 0 }, null, 2))
