import toast from 'react-hot-toast'
import type { BulkResult } from '@/services/crawler/editorial/bulk'

export function notifyCrawlerBulk(result: BulkResult, success: string) {
  if (result.affected > 0) toast.success(success)
  else toast(success, { icon: 'ℹ️' })
  if (result.skipped > 0) {
    toast(`${result.skipped} kayıt mevcut durumu nedeniyle atlandı.`, { icon: 'ℹ️' })
  }
  if (result.failed > 0) toast.error(`${result.failed} kayıt işlenemedi`)
}
