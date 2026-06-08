import { addDoc, collection } from 'firebase/firestore'
import { db, Collections } from '@/lib/firebase/firestore'
import type { ReportReason } from '@/types/common'

export const reportService = {
  async reportPost(reporterId: string, postId: string, reason: ReportReason = 'other'): Promise<void> {
    await addDoc(collection(db, Collections.REPORTS), {
      reporterId,
      targetId: postId,
      targetType: 'post',
      reason,
      status: 'pending',
      createdAt: Date.now(),
    })
  },
}
