import toast from 'react-hot-toast'
import type { AiPublishBatchResult } from '@/services/crawler/editorial/aiPublish'
import { AI_PUBLISH_TIMEOUT_SKIP_TR } from '@/services/crawler/editorial/aiPublishEligibility'

function summarizeFailures(results: AiPublishBatchResult['results'], limit = 3): string {
  const problems = results.filter(
    (r) =>
      r.outcome === 'error' ||
      r.outcome === 'skipped' ||
      r.outcome === 'already_published' ||
      r.outcome === 'locked'
  )
  if (problems.length === 0) return ''
  const lines = problems.slice(0, limit).map((r) => {
    const label = r.rawArticleId.replace(/^raw_/, '').slice(0, 8)
    const msg =
      r.error ||
      (r.outcome === 'already_published' ? 'Bu haber zaten yayınlanmış' : r.outcome)
    return `${label}: ${msg}`
  })
  const more = problems.length > limit ? ` (+${problems.length - limit} daha)` : ''
  return lines.join('\n') + more
}

export function notifyAiPublishResult(result: AiPublishBatchResult) {
  const { published, drafted, skipped, failed, requested } = result
  const processed = published + drafted
  const timedOut = result.results.filter((r) => r.error === AI_PUBLISH_TIMEOUT_SKIP_TR).length
  const already = result.results.filter((r) => r.outcome === 'already_published').length
  const skippedOther = Math.max(0, skipped - already - timedOut)

  const headline = [
    `${requested} seçildi`,
    published > 0 ? `${published} yayında (İnceleme)` : null,
    drafted > 0 ? `${drafted} onay bekliyor` : null,
    already > 0 ? `${already} zaten yayında` : null,
    timedOut > 0 ? `${timedOut} süre doldu` : null,
    skippedOther > 0 ? `${skippedOther} atlandı` : null,
    failed > 0 ? `${failed} hata` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  if (processed > 0) toast.success(`AI için onayla: ${headline}`)
  else if (skipped > 0 || failed > 0) toast.error(`AI için onayla: ${headline}`)
  else toast(headline, { icon: 'ℹ️' })

  if (timedOut > 0) {
    toast('Bazı haberler süre sınırına takıldı. Kalan seçimi yeniden onaylayın.', {
      icon: 'ℹ️',
      duration: 7000,
    })
  }

  if (drafted > 0 && published === 0) {
    toast('Taslaklar Yayın Odası → Onay Bekliyor sekmesinde görünür.', { icon: 'ℹ️', duration: 6000 })
  } else if (published > 0) {
    toast('Yayınlananlar Yayın Odası → İnceleme sekmesinde kategori kontrolü için bekler.', {
      icon: 'ℹ️',
      duration: 6000,
    })
  }

  const detail = summarizeFailures(result.results)
  if (detail) toast.error(detail, { duration: 9000 })
}
