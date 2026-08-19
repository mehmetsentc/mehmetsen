import type { CmsRole } from '@/types/cms'
import { hasPermission } from '@/types/cms'

export type CrawlerBulkAction =
  | 'review'
  | 'ai_candidate'
  | 'reject'
  | 'archive'
  | 'soft_delete'
  | 'hard_delete'
  | 'approve_for_ai'
  | 'watch'

export function canMutateCrawlerEditorial(role: CmsRole): boolean {
  return hasPermission(role, 'news:edit') || hasPermission(role, 'news:bulk_action')
}

export function canHardDeleteCrawler(role: CmsRole): boolean {
  return role === 'super_admin' && hasPermission(role, 'news:delete')
}

export function authorizeCrawlerBulk(role: CmsRole, action: CrawlerBulkAction): { ok: true } | { ok: false; error: string } {
  if (!canMutateCrawlerEditorial(role)) {
    return { ok: false, error: 'Bu işlem için yetkiniz yok' }
  }
  if (action === 'hard_delete' && !canHardDeleteCrawler(role)) {
    return { ok: false, error: 'Kalıcı silme yalnızca süper admin' }
  }
  return { ok: true }
}
