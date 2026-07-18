import type { CSSProperties } from 'react'
import { getParentCategory } from '@/constants/config'
import { getCategoryAccent } from '@/constants/categoryTheme'
import type { ExperienceTheme } from './types'

const MOOD_BY_ROOT: Record<string, ExperienceTheme['mood']> = {
  gundem: 'minimal',
  'son-dakika': 'minimal',
  siyaset: 'minimal',
  dunya: 'global',
  spor: 'sport',
  teknoloji: 'tech',
  'oyun-espor': 'tech',
  magazin: 'magazine',
  kultur: 'magazine',
  saglik: 'calm',
  yasam: 'calm',
  bilim: 'science',
  'cevre-iklim': 'science',
  gezi: 'travel',
  gastronomi: 'travel',
  'yerel-haber': 'local',
  ekonomi: 'minimal',
}

const SURFACE_BY_MOOD: Record<ExperienceTheme['mood'], string> = {
  minimal: '0 0 0',
  global: '37 99 235',
  sport: '5 150 105',
  tech: '15 23 42',
  magazine: '190 24 93',
  calm: '255 255 255',
  science: '20 184 166',
  travel: '14 165 233',
  local: '13 148 136',
}

const RADIUS_BY_MOOD: Record<ExperienceTheme['mood'], ExperienceTheme['cardRadius']> = {
  minimal: 'sharp',
  global: 'soft',
  sport: 'round',
  tech: 'soft',
  magazine: 'round',
  calm: 'soft',
  science: 'soft',
  travel: 'round',
  local: 'soft',
}

const WEIGHT_BY_MOOD: Record<ExperienceTheme['mood'], ExperienceTheme['titleWeight']> = {
  minimal: 800,
  global: 800,
  sport: 900,
  tech: 700,
  magazine: 900,
  calm: 600,
  science: 700,
  travel: 800,
  local: 700,
}

function rootIdOf(categoryId: string): string {
  const parent = getParentCategory(categoryId)
  return parent?.id ?? categoryId
}

export function getExperienceTheme(categoryId: string): ExperienceTheme {
  const root = rootIdOf(categoryId)
  const accent = getCategoryAccent(categoryId)
  const mood = MOOD_BY_ROOT[root] ?? MOOD_BY_ROOT[categoryId] ?? 'minimal'

  return {
    id: root,
    accent: accent.hex,
    accentRgb: accent.rgb,
    kicker: accent.kicker,
    mood,
    surfaceTint: SURFACE_BY_MOOD[mood],
    titleWeight: WEIGHT_BY_MOOD[mood],
    cardRadius: RADIUS_BY_MOOD[mood],
  }
}

export function experienceThemeStyle(theme: ExperienceTheme): CSSProperties {
  return {
    ['--cat-accent' as string]: theme.accentRgb,
    ['--exp-tint' as string]: theme.surfaceTint,
    ['--exp-title-weight' as string]: String(theme.titleWeight),
    ['--exp-radius' as string]:
      theme.cardRadius === 'sharp' ? '0.5rem' : theme.cardRadius === 'round' ? '1.35rem' : '1rem',
  }
}
