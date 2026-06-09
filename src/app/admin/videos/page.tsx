'use client'

import { useEffect, useState, useCallback } from 'react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { db } from '@/lib/firebase/firestore'
import {
  collection, query, orderBy, limit, onSnapshot,
  doc, updateDoc, where, getDocs,
} from 'firebase/firestore'
import { Video, Eye, Clock, CheckCircle2, XCircle, Play, RefreshCw, Filter } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { getCategoryLabel } from '@/lib/newsMapper'

interface VideoQueueItem {
  id: string
  title: string
  status: string
  source: string
  categoryId: string
  videoUrl?: string
  thumbnailUrl?: string
  viewsCount: number
  createdAt: number
  duration?: number
}

const FILTERS = [
  { id: 'all', label: 'Tümü' },
  { id: 'pending', label: 'Bekleyen' },
  { id: 'published', label: 'Yayında' },
  { id: 'queued', label: 'Kuyrukta' },
]

export default function VideosAdminPage() {
  const { can } = useCmsAuth()
  const [filter, setFilter] = useState('all')
  const [videos, setVideos] = useState<VideoQueueItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const col = collection(db, 'videoQueue')
    const q = filter === 'all'
      ? query(col, orderBy('createdAt', 'desc'), limit(50))
      : query(col, where('status', '==', filter), orderBy('createdAt', 'desc'), limit(50))
    return onSnapshot(q, snap => {
      setVideos(snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          title: (data.title as string) ?? '',
          status: (data.status as string) ?? 'pending',
          source: (data.source as string) ?? '',
          categoryId: (data.categoryId as string) ?? '',
          videoUrl: data.videoUrl as string | undefined,
          thumbnailUrl: data.thumbnailUrl as string | undefined,
          viewsCount: (data.viewsCount as number) ?? 0,
          createdAt: (data.createdAt as number) ?? 0,
          duration: data.duration as number | undefined,
        }
      }))
      setLoading(false)
    }, () => setLoading(false))
  }, [filter])

  const handleApprove = async (id: string) => {
    try {
      await updateDoc(doc(db, 'videoQueue', id), { status: 'published', publishedAt: Date.now() })
      toast.success('Video yayınlandı')
    } catch { toast.error('İşlem başarısız') }
  }

  const handleReject = async (id: string) => {
    try {
      await updateDoc(doc(db, 'videoQueue', id), { status: 'rejected' })
      toast.success('Video reddedildi')
    } catch { toast.error('İşlem başarısız') }
  }

  return (
    <div className="flex flex-col">
      <CMSHeader title="Video Yönetimi" subtitle="Video kuyruk ve yayın yönetimi" />
      <div className="p-6 space-y-4">
        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={cn('rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
                filter === f.id ? 'bg-blue-600 text-white' : 'bg-[rgb(var(--color-card))] border border-[rgb(var(--color-border))] text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]'
              )}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Video Grid */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-48 animate-pulse rounded-2xl bg-[rgb(var(--color-surface))]" />
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <Video className="h-12 w-12 text-[rgb(var(--color-muted))]" />
            <p className="text-lg font-semibold text-[rgb(var(--color-text))]">Video bulunamadı</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {videos.map(video => (
              <div key={video.id} className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
                {/* Thumbnail */}
                <div className="relative aspect-video bg-[rgb(var(--color-surface))]">
                  {video.thumbnailUrl ? (
                    <img src={video.thumbnailUrl} alt={video.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Play className="h-12 w-12 text-[rgb(var(--color-muted))]" />
                    </div>
                  )}
                  <div className={cn('absolute right-2 top-2 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase',
                    video.status === 'published' ? 'bg-blue-600 text-white' :
                    video.status === 'pending' ? 'bg-amber-500 text-white' :
                    'bg-gray-600 text-white'
                  )}>
                    {video.status === 'published' ? 'Yayında' : video.status === 'pending' ? 'Bekliyor' : video.status}
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="line-clamp-2 text-sm font-bold text-[rgb(var(--color-text))]">{video.title}</h3>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-[rgb(var(--color-muted))]">
                    <span>{video.source}</span>
                    <span>·</span>
                    <span>{getCategoryLabel(video.categoryId)}</span>
                    <span className="ml-auto flex items-center gap-1"><Eye className="h-3 w-3" />{video.viewsCount}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-[rgb(var(--color-muted))]">
                    {video.createdAt ? formatDistanceToNow(new Date(video.createdAt), { locale: tr, addSuffix: true }) : ''}
                  </p>

                  {/* Actions */}
                  {video.status === 'pending' && can('video:publish') && (
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => handleApprove(video.id)}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Yayınla
                      </button>
                      <button onClick={() => handleReject(video.id)}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-600 py-2 text-xs font-bold text-white hover:bg-red-700">
                        <XCircle className="h-3.5 w-3.5" /> Reddet
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
