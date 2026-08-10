'use client'

import { useMemo } from 'react'
import {
  Award,
  BadgeCheck,
  Crown,
  Flame,
  Newspaper,
  Pen,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import type { User } from '@/types/user'

interface ProfileBadgesProps {
  user: User
}

interface Achievement {
  id: string
  label: string
  description: string
  icon: typeof Award
  earned: boolean
  /** Hangi token rengini kullanacağı */
  accent: 'brand' | 'info' | 'warning' | 'success' | 'magazin' | 'teknoloji' | 'spor' | 'siyaset'
}

const ACCENT_CLS: Record<Achievement['accent'], { bg: string; fg: string; ring: string }> = {
  brand:     { bg: 'bg-brand-500/10',     fg: 'text-brand-500',     ring: 'ring-brand-500/30' },
  info:      { bg: 'bg-info/10',          fg: 'text-info',          ring: 'ring-info/30' },
  warning:   { bg: 'bg-warning/10',       fg: 'text-warning',       ring: 'ring-warning/30' },
  success:   { bg: 'bg-success/10',       fg: 'text-success',       ring: 'ring-success/30' },
  magazin:   { bg: 'bg-cat-magazin/10',   fg: 'text-cat-magazin',   ring: 'ring-cat-magazin/30' },
  teknoloji: { bg: 'bg-cat-teknoloji/10', fg: 'text-cat-teknoloji', ring: 'ring-cat-teknoloji/30' },
  spor:      { bg: 'bg-cat-spor/10',      fg: 'text-cat-spor',      ring: 'ring-cat-spor/30' },
  siyaset:   { bg: 'bg-cat-siyaset/10',   fg: 'text-cat-siyaset',   ring: 'ring-cat-siyaset/30' },
}

/**
 * ProfileBadges — F5
 *
 * Kullanıcının `User` objesinden türetilmiş rozetleri gösterir. Backend
 * tarafında ekstra sorgu yok — `postsCount`, `followersCount`, `role`,
 * `isVerified`, `createdAt` kullanılıyor.
 *
 * Earned olmayan rozetler grayscale + opacity-50 ile gösterilir (kullanıcıya
 * "neyi açabilirim" hedefi vermek için).
 */
export function ProfileBadges({ user }: ProfileBadgesProps) {
  const achievements = useMemo<Achievement[]>(() => {
    const days = createdDays(user.createdAt)
    return [
      {
        id: 'verified',
        label: 'Doğrulanmış',
        description: 'NaHaber editör onaylı hesap',
        icon: BadgeCheck,
        earned: Boolean(user.isVerified),
        accent: 'info',
      },
      {
        id: 'admin',
        label: 'Yönetici',
        description: 'NaHaber platform yöneticisi',
        icon: Crown,
        earned: user.role === 'admin',
        accent: 'warning',
      },
      {
        id: 'editor',
        label: 'Editör',
        description: 'Editör ekibinin parçası',
        icon: Pen,
        earned: user.role === 'editor' || user.role === 'admin',
        accent: 'brand',
      },
      {
        id: 'pioneer',
        label: 'Öncü',
        description: 'NaHaber\'in ilk üyelerinden',
        icon: Sparkles,
        earned: days > 365,
        accent: 'magazin',
      },
      {
        id: 'reporter',
        label: 'Muhabir',
        description: '10+ gönderi paylaşmış',
        icon: Newspaper,
        earned: user.postsCount >= 10,
        accent: 'teknoloji',
      },
      {
        id: 'social',
        label: 'Sosyal',
        description: '100+ takipçi kazanmış',
        icon: Users,
        earned: user.followersCount >= 100,
        accent: 'success',
      },
      {
        id: 'hot',
        label: 'Popüler',
        description: '1000+ takipçi kazanmış',
        icon: Flame,
        earned: user.followersCount >= 1000,
        accent: 'spor',
      },
      {
        id: 'trusted',
        label: 'Güvenilir',
        description: 'NaHaber topluluk kurallarına uyum',
        icon: Shield,
        earned: !user.isBlocked && days > 30,
        accent: 'siyaset',
      },
    ]
  }, [user])

  const earnedCount = achievements.filter((a) => a.earned).length

  return (
    <Card surface="elevated" radius="2xl" className="overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-brand-500" />
            Rozetler
          </CardTitle>
          <span className="text-2xs font-bold uppercase tracking-widest text-text-tertiary">
            {earnedCount} / {achievements.length}
          </span>
        </div>
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-4 gap-2.5 sm:gap-3 md:grid-cols-4 lg:grid-cols-8">
          {achievements.map((a, i) => {
            const cls = ACCENT_CLS[a.accent]
            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                className="group relative flex flex-col items-center text-center"
                title={a.description}
              >
                <div
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-2xl ring-1 transition-all',
                    a.earned
                      ? `${cls.bg} ${cls.fg} ${cls.ring}`
                      : 'bg-bg-subtle text-text-muted ring-border opacity-50 grayscale'
                  )}
                >
                  <a.icon className="h-5 w-5" />
                </div>
                <span
                  className={cn(
                    'mt-1.5 line-clamp-1 text-2xs font-semibold',
                    a.earned ? 'text-text-secondary' : 'text-text-muted'
                  )}
                >
                  {a.label}
                </span>
              </motion.div>
            )
          })}
        </div>
      </CardBody>
    </Card>
  )
}

function createdDays(iso: string | null | undefined): number {
  if (!iso) return 0
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return 0
    return Math.floor((Date.now() - d.getTime()) / 86_400_000)
  } catch {
    return 0
  }
}
