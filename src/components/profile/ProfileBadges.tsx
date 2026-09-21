'use client'

import { useMemo } from 'react'
import { Award, BadgeCheck, Crown, Pen } from 'lucide-react'
import type { User } from '@/types/user'

interface ProfileBadgesProps {
  user: User
}

interface Achievement {
  id: string
  label: string
  description: string
  icon: typeof Award
}

export function ProfileBadges({ user }: ProfileBadgesProps) {
  const earned = useMemo<Achievement[]>(() => {
    const items: Achievement[] = []
    if (user.isVerified) {
      items.push({
        id: 'verified',
        label: 'Doğrulanmış',
        description: 'NaHaber onaylı hesap',
        icon: BadgeCheck,
      })
    }
    if (user.role === 'admin' || user.role === 'super_admin') {
      items.push({
        id: 'admin',
        label: 'Yönetici',
        description: 'NaHaber platform yöneticisi',
        icon: Crown,
      })
    }
    if (user.role === 'editor' || user.role === 'managing_editor' || user.role === 'admin' || user.role === 'super_admin') {
      items.push({
        id: 'editor',
        label: 'Editör',
        description: 'Editör ekibinin parçası',
        icon: Pen,
      })
    }
    return items
  }, [user])

  return (
    <section className="mx-3 rounded-2xl border border-white/8 bg-white/4 px-3 py-3" data-testid="profile-badges">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white">
          <Award className="h-4 w-4 text-[rgb(var(--nah-red))]" />
          Rozetler
        </h2>
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
          {earned.length > 0 ? `${earned.length}` : 'Yok'}
        </span>
      </div>
      {earned.length === 0 ? (
        <p className="py-3 text-center text-xs text-[rgb(var(--nah-text-muted))]">
          Kanıtlanmış rozet bulunmuyor.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {earned.map((a) => (
            <div
              key={a.id}
              title={a.description}
              className="flex min-w-[4.5rem] flex-col items-center rounded-2xl bg-white/6 px-2 py-2 text-center"
            >
              <a.icon className="h-5 w-5 text-[rgb(var(--nah-red))]" />
              <span className="mt-1 text-[10px] font-semibold text-white/80">{a.label}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
