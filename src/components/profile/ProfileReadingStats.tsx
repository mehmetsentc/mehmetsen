'use client'

import { useEffect, useState } from 'react'
import { BookOpen, Bookmark, Heart, Clock } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

interface ProfileReadingStatsProps {
  userId: string
  /** Şu an profilini gezen kullanıcı kendi mi? (yalnız own profile'da göster) */
  isOwnProfile: boolean
}

interface ReadingStats {
  articlesRead: number
  saved: number
  liked: number
  minutesRead: number
}

const STORAGE_KEY = 'nahaber:reading-stats'

/**
 * ProfileReadingStats — F5
 *
 * Sadece kullanıcının kendi profilinde görünür okuma istatistikleri kartı.
 * Veri kaynağı: localStorage'a yazılan event'ler (`incrementReadingStat()`).
 *
 * Her haber detay sayfasında `incrementReadingStat('articlesRead', minutes)`
 * çağrısı yapıldığında sayaçlar artar. Bu sayım eski cihaz/oturumlardan
 * gelmez ama Instagram-tarzı bir "kendi okuma alışkanlığını gör" deneyimi
 * için yeterli.
 *
 * Gelecekte readingService ile sunucu tarafında persist edilebilir.
 */
export function ProfileReadingStats({ userId, isOwnProfile }: ProfileReadingStatsProps) {
  const [stats, setStats] = useState<ReadingStats | null>(null)

  useEffect(() => {
    if (!isOwnProfile) return
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}:${userId}`)
      if (raw) {
        setStats(JSON.parse(raw) as ReadingStats)
      } else {
        setStats({ articlesRead: 0, saved: 0, liked: 0, minutesRead: 0 })
      }
    } catch {
      setStats({ articlesRead: 0, saved: 0, liked: 0, minutesRead: 0 })
    }
  }, [userId, isOwnProfile])

  if (!isOwnProfile || !stats) return null

  const cards: Array<{
    icon: typeof BookOpen
    label: string
    value: number
    suffix?: string
    accentBg: string
    accentFg: string
  }> = [
    { icon: BookOpen,  label: 'Okunan',     value: stats.articlesRead, accentBg: 'bg-brand-500/10',     accentFg: 'text-brand-500' },
    { icon: Clock,     label: 'Dakika',     value: stats.minutesRead,  accentBg: 'bg-info/10',          accentFg: 'text-info' },
    { icon: Heart,     label: 'Beğenilen',  value: stats.liked,        accentBg: 'bg-danger/10',        accentFg: 'text-danger' },
    { icon: Bookmark,  label: 'Kaydedilen', value: stats.saved,        accentBg: 'bg-warning/10',       accentFg: 'text-warning' },
  ]

  return (
    <Card surface="elevated" radius="2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-brand-500" />
          Okuma İstatistikleri
        </CardTitle>
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-4 gap-3">
          {cards.map((c) => (
            <div
              key={c.label}
              className="flex flex-col items-center gap-1.5 rounded-xl bg-bg-subtle/60 px-2 py-3 text-center"
            >
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg',
                  c.accentBg,
                  c.accentFg
                )}
              >
                <c.icon className="h-4 w-4" />
              </span>
              <span className="text-lg font-black tabular-nums text-text-primary">
                {c.value.toLocaleString('tr-TR')}
              </span>
              <span className="text-2xs font-medium text-text-tertiary">{c.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-2xs text-text-tertiary">
          Bu istatistikler tarayıcına özeldir. Yakında bulutta senkronlanacak.
        </p>
      </CardBody>
    </Card>
  )
}

/**
 * Reading stats tracker — haber detay sayfası okunduğunda çağrılır.
 *
 * @example
 *   useEffect(() => {
 *     incrementReadingStat(user?.uid, 'articlesRead', 1)
 *     incrementReadingStat(user?.uid, 'minutesRead', readingTimeMinutes)
 *   }, [post.id])
 */
export function incrementReadingStat(
  userId: string | null | undefined,
  field: keyof ReadingStats,
  amount = 1
): void {
  if (!userId) return
  if (typeof window === 'undefined') return
  try {
    const key = `${STORAGE_KEY}:${userId}`
    const raw = localStorage.getItem(key)
    const current: ReadingStats = raw
      ? (JSON.parse(raw) as ReadingStats)
      : { articlesRead: 0, saved: 0, liked: 0, minutesRead: 0 }
    current[field] = (current[field] ?? 0) + amount
    localStorage.setItem(key, JSON.stringify(current))
  } catch {
    /* ignore */
  }
}
