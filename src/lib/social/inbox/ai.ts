/**
 * AI reply drafts for the social inbox (server only). Uses the shared AI
 * router (same providers and cost gates as the rest of NaHaber):
 *   - editor-requested drafts run in the `manual_editor` lane (MANUAL_EDITOR_AI_ENABLED)
 *   - worker drafts run in the automated lane (crawler AI gate)
 * When AI is off the inbox falls back to fixed templates for the safe
 * categories; nothing is invented. The model never decides alone that an item
 * is safe: the stricter of the rule-based and the model category wins.
 */
import 'server-only'
import { runAI } from '@/lib/ai/router/aiRouter'
import { runWithAiUsageContext } from '@/lib/ai/usage/context'
import {
  classifyByRules,
  cleanReplyText,
  hasForeignLink,
  INBOX_CATEGORIES,
  isAutoSafe,
  type InboxCategory,
} from './model'

export interface DraftInput {
  kind: 'comment' | 'dm'
  platform: string
  text: string
  newsTitle: string | null
  newsUrl: string | null
  /** Last messages of a DM conversation, oldest first (already plain text). */
  history?: Array<{ direction: 'in' | 'out'; text: string }>
  lane: 'manual_editor' | 'automated'
  maxLength: number
}

export interface DraftResult {
  text: string | null
  category: InboxCategory
  needsHuman: boolean
  provider: string | null
  reason: 'ok' | 'ai_off' | 'ai_failed' | 'unsafe_output' | 'test_mode'
}

const SYSTEM = `Sen NaHaber haber sitesinin sosyal medya editör asistanısın.
Görevin: Instagram, Facebook, Threads ve YouTube yorumlarına ya da özel mesajlara NaHaber adına kısa, nazik ve kurumsal bir CEVAP TASLAĞI yazmak.
KURALLAR:
- Türkçe, saygılı, sakin, kısa (en fazla 2 cümle, 280 karakter). Emoji en fazla bir tane.
- Asla bilgi uydurma; haberde olmayan rakam, isim, tarih, söz, vaat yazma.
- Siyasi taraf tutma, tartışmaya girme, kimseyi suçlama, hukuki görüş verme, sağlık/finans tavsiyesi verme.
- Ölüm, kaza, şiddet gibi hassas konularda yalnız kısa ve saygılı bir ifade kullan; espri yapma.
- Bağlantı olarak yalnız sana verilen NaHaber haber adresini kullanabilirsin; başka link, telefon, e-posta yazma.
- Kişinin kişisel bilgisini isteme, tekrar etme.
- Şikâyet, düzeltme talebi, hakaret, tehdit, hukuki konu, siyasi tartışma veya editör kararı gerektiren her durumda needs_human=true yap.
Kategori seçenekleri: ${INBOX_CATEGORIES.join(', ')}.
Yalnız JSON döndür: {"category":"...","needs_human":true|false,"reply":"..."}`

function buildUser(i: DraftInput): string {
  const lines = [`Tür: ${i.kind === 'dm' ? 'özel mesaj' : 'gönderi yorumu'} (${i.platform})`]
  if (i.newsTitle) lines.push(`İlgili haber başlığı: ${i.newsTitle}`)
  if (i.newsUrl) lines.push(`Haber adresi: ${i.newsUrl}`)
  if (i.history?.length) {
    lines.push('Önceki mesajlar:')
    for (const m of i.history.slice(-6)) lines.push(`${m.direction === 'in' ? 'Kişi' : 'NaHaber'}: ${m.text.slice(0, 300)}`)
  }
  lines.push(`Cevaplanacak metin: """${i.text.slice(0, 1000)}"""`)
  return lines.join('\n')
}

function parse(raw: string): { category: InboxCategory; needsHuman: boolean; reply: string } | null {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>
    const category = (INBOX_CATEGORIES as readonly string[]).includes(o.category as string) ? (o.category as InboxCategory) : 'other'
    const reply = typeof o.reply === 'string' ? o.reply : ''
    return { category, needsHuman: o.needs_human === true, reply }
  } catch {
    return null
  }
}

/** The stricter category wins: a «needs a person» answer from either side is kept. */
export function mergeCategory(rules: InboxCategory, model: InboxCategory): InboxCategory {
  if (!isAutoSafe(rules) && rules !== 'other') return rules
  if (!isAutoSafe(model) && model !== 'other') return model
  return rules !== 'other' ? rules : model
}

export async function draftReply(input: DraftInput): Promise<DraftResult> {
  const rules = classifyByRules(input.text)
  const { isSocialTestMode } = await import('../testEnvironment')
  if (isSocialTestMode()) return { text: null, category: rules, needsHuman: !isAutoSafe(rules), provider: null, reason: 'test_mode' }

  const ctx = { ingestionLane: input.lane === 'manual_editor' ? ('manual_editor' as const) : ('crawler' as const), agentName: 'social_inbox', operation: 'draft_reply', promptVersion: 'social-inbox:v1' }
  let routed: Awaited<ReturnType<typeof runAI<ReturnType<typeof parse>>>>
  try {
    routed = await runWithAiUsageContext(ctx, () =>
      runAI({
        agent: 'social_inbox',
        operation: 'draft_reply',
        promptVersion: 'social-inbox:v1',
        taskType: 'social',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: buildUser(input) },
        ],
        temperature: 0.3,
        maxTokens: 300,
        jsonMode: true,
        validate: parse,
        cohortKey: input.text.slice(0, 64),
      }),
    )
  } catch {
    return { text: null, category: rules, needsHuman: !isAutoSafe(rules), provider: null, reason: 'ai_failed' }
  }
  if (!routed.provider && routed.value === null) return { text: null, category: rules, needsHuman: !isAutoSafe(rules), provider: null, reason: 'ai_off' }
  const v = routed.value && typeof routed.value === 'object' ? routed.value : null
  if (!v) return { text: null, category: rules, needsHuman: !isAutoSafe(rules), provider: routed.provider, reason: 'ai_failed' }
  const category = mergeCategory(rules, v.category)
  const text = cleanReplyText(v.reply, input.maxLength)
  if (!text || hasForeignLink(text)) return { text: null, category, needsHuman: true, provider: routed.provider, reason: 'unsafe_output' }
  return { text, category, needsHuman: v.needsHuman || !isAutoSafe(category), provider: routed.provider, reason: 'ok' }
}
