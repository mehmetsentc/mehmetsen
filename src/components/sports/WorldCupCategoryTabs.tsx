'use client'

/**
 * WorldCupCategoryTabs — 2026 FIFA Dünya Kupası kategori sayfası
 *
 * Kaydırmalı chip navigation:
 *   [📰 Haberler] [Grup A] [Grup B] ... [Grup L]
 *
 * - Haberler chipsi: haber feed gösterir (CategoryFeed)
 * - Grup chipleri: o grubun puan durumu + maç sonuçları
 */

import { useState } from 'react'
import { Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CategoryFeed } from '@/components/feed/CategoryFeed'
import type { TimelinePost } from '@/types/post'

// ─── Types ────────────────────────────────────────────────────────────────────
interface TeamStat {
  team: string
  flag: string
  p: number
  w: number
  d: number
  l: number
  gf: number
  ga: number
  gd: number
  pts: number
  isTurkiye?: boolean
}

interface Group {
  id: string
  name: string
  teams: TeamStat[]
}

interface Match {
  home: string
  homeFlag: string
  homeScore: number
  awayScore: number
  away: string
  awayFlag: string
  date: string
  group: string
  finished: boolean
  isLive?: boolean
}

// ─── Data (güncel: 25 Haziran 2026, Grup Aşaması devam ediyor) ───────────────
const GROUPS: Group[] = [
  {
    id: 'A', name: 'Grup A',
    teams: [
      { team: 'Meksika',       flag: '🇲🇽', p: 2, w: 2, d: 0, l: 0, gf: 3,  ga: 0,  gd: 3,  pts: 6 },
      { team: 'G. Kore',       flag: '🇰🇷', p: 2, w: 1, d: 0, l: 1, gf: 2,  ga: 2,  gd: 0,  pts: 3 },
      { team: 'Çekya',         flag: '🇨🇿', p: 2, w: 0, d: 1, l: 1, gf: 2,  ga: 3,  gd: -1, pts: 1 },
      { team: 'G. Afrika',     flag: '🇿🇦', p: 2, w: 0, d: 1, l: 1, gf: 1,  ga: 3,  gd: -2, pts: 1 },
    ],
  },
  {
    id: 'B', name: 'Grup B',
    teams: [
      { team: 'Kanada',        flag: '🇨🇦', p: 2, w: 1, d: 1, l: 0, gf: 7,  ga: 1,  gd: 6,  pts: 4 },
      { team: 'İsviçre',       flag: '🇨🇭', p: 2, w: 1, d: 1, l: 0, gf: 5,  ga: 2,  gd: 3,  pts: 4 },
      { team: 'Bosna Hersek',  flag: '🇧🇦', p: 2, w: 0, d: 1, l: 1, gf: 2,  ga: 5,  gd: -3, pts: 1 },
      { team: 'Katar',         flag: '🇶🇦', p: 2, w: 0, d: 1, l: 1, gf: 1,  ga: 7,  gd: -6, pts: 1 },
    ],
  },
  {
    id: 'C', name: 'Grup C',
    teams: [
      { team: 'Brezilya',      flag: '🇧🇷', p: 2, w: 1, d: 1, l: 0, gf: 4,  ga: 1,  gd: 3,  pts: 4 },
      { team: 'Fas',           flag: '🇲🇦', p: 2, w: 1, d: 1, l: 0, gf: 2,  ga: 1,  gd: 1,  pts: 4 },
      { team: 'İskoçya',       flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', p: 2, w: 1, d: 0, l: 1, gf: 1,  ga: 1,  gd: 0,  pts: 3 },
      { team: 'Haiti',         flag: '🇭🇹', p: 2, w: 0, d: 0, l: 2, gf: 0,  ga: 4,  gd: -4, pts: 0 },
    ],
  },
  {
    id: 'D', name: 'Grup D',
    teams: [
      { team: 'ABD',           flag: '🇺🇸', p: 2, w: 2, d: 0, l: 0, gf: 6,  ga: 1,  gd: 5,  pts: 6 },
      { team: 'Avustralya',    flag: '🇦🇺', p: 2, w: 1, d: 0, l: 1, gf: 2,  ga: 2,  gd: 0,  pts: 3 },
      { team: 'Paraguay',      flag: '🇵🇾', p: 2, w: 1, d: 0, l: 1, gf: 2,  ga: 4,  gd: -2, pts: 3 },
      { team: 'Türkiye',       flag: '🇹🇷', p: 2, w: 0, d: 0, l: 2, gf: 0,  ga: 3,  gd: -3, pts: 0, isTurkiye: true },
    ],
  },
  {
    id: 'E', name: 'Grup E',
    teams: [
      { team: 'Almanya',       flag: '🇩🇪', p: 2, w: 2, d: 0, l: 0, gf: 9,  ga: 2,  gd: 7,  pts: 6 },
      { team: 'Fildişi Sah.', flag: '🇨🇮',  p: 2, w: 1, d: 0, l: 1, gf: 2,  ga: 2,  gd: 0,  pts: 3 },
      { team: 'Ekvador',       flag: '🇪🇨', p: 2, w: 0, d: 1, l: 1, gf: 0,  ga: 1,  gd: -1, pts: 1 },
      { team: 'Curaçao',       flag: '🇨🇼', p: 2, w: 0, d: 1, l: 1, gf: 1,  ga: 9,  gd: -8, pts: 1 },
    ],
  },
  {
    id: 'F', name: 'Grup F',
    teams: [
      { team: 'Hollanda',      flag: '🇳🇱', p: 2, w: 1, d: 1, l: 0, gf: 7,  ga: 3,  gd: 4,  pts: 4 },
      { team: 'Japonya',       flag: '🇯🇵', p: 2, w: 1, d: 1, l: 0, gf: 6,  ga: 2,  gd: 4,  pts: 4 },
      { team: 'İsveç',         flag: '🇸🇪', p: 2, w: 1, d: 0, l: 1, gf: 6,  ga: 6,  gd: 0,  pts: 3 },
      { team: 'Tunus',         flag: '🇹🇳', p: 2, w: 0, d: 0, l: 2, gf: 1,  ga: 9,  gd: -8, pts: 0 },
    ],
  },
  {
    id: 'G', name: 'Grup G',
    teams: [
      { team: 'Mısır',         flag: '🇪🇬', p: 2, w: 1, d: 1, l: 0, gf: 4,  ga: 2,  gd: 2,  pts: 4 },
      { team: 'İran',          flag: '🇮🇷', p: 2, w: 0, d: 2, l: 0, gf: 2,  ga: 2,  gd: 0,  pts: 2 },
      { team: 'Belçika',       flag: '🇧🇪', p: 2, w: 0, d: 2, l: 0, gf: 1,  ga: 1,  gd: 0,  pts: 2 },
      { team: 'Yeni Zelanda',  flag: '🇳🇿', p: 2, w: 0, d: 0, l: 2, gf: 3,  ga: 5,  gd: -2, pts: 0 },
    ],
  },
  {
    id: 'H', name: 'Grup H',
    teams: [
      { team: 'Fransa',        flag: '🇫🇷', p: 2, w: 2, d: 0, l: 0, gf: 6,  ga: 1,  gd: 5,  pts: 6 },
      { team: 'Norveç',        flag: '🇳🇴', p: 2, w: 2, d: 0, l: 0, gf: 7,  ga: 3,  gd: 4,  pts: 6 },
      { team: 'Senegal',       flag: '🇸🇳', p: 2, w: 0, d: 0, l: 2, gf: 3,  ga: 6,  gd: -3, pts: 0 },
      { team: 'Irak',          flag: '🇮🇶', p: 2, w: 0, d: 0, l: 2, gf: 1,  ga: 7,  gd: -6, pts: 0 },
    ],
  },
  {
    id: 'I', name: 'Grup I',
    teams: [
      { team: 'Arjantin',      flag: '🇦🇷', p: 2, w: 2, d: 0, l: 0, gf: 4,  ga: 0,  gd: 4,  pts: 6 },
      { team: 'Avusturya',     flag: '🇦🇹', p: 2, w: 1, d: 0, l: 1, gf: 3,  ga: 2,  gd: 1,  pts: 3 },
      { team: 'Ürdün',         flag: '🇯🇴', p: 2, w: 1, d: 0, l: 1, gf: 3,  ga: 4,  gd: -1, pts: 3 },
      { team: 'Cezayir',       flag: '🇩🇿', p: 2, w: 0, d: 0, l: 2, gf: 1,  ga: 5,  gd: -4, pts: 0 },
    ],
  },
  {
    id: 'J', name: 'Grup J',
    teams: [
      { team: 'Kolombiya',     flag: '🇨🇴', p: 2, w: 2, d: 0, l: 0, gf: 4,  ga: 1,  gd: 3,  pts: 6 },
      { team: 'Portekiz',      flag: '🇵🇹', p: 2, w: 1, d: 1, l: 0, gf: 6,  ga: 1,  gd: 5,  pts: 4 },
      { team: 'K. Kongo',      flag: '🇨🇩', p: 2, w: 0, d: 1, l: 1, gf: 1,  ga: 2,  gd: -1, pts: 1 },
      { team: 'Özbekistan',    flag: '🇺🇿', p: 2, w: 0, d: 0, l: 2, gf: 1,  ga: 8,  gd: -7, pts: 0 },
    ],
  },
  {
    id: 'K', name: 'Grup K',
    teams: [
      { team: 'İngiltere',     flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', p: 2, w: 1, d: 1, l: 0, gf: 4,  ga: 2,  gd: 2,  pts: 4 },
      { team: 'Gana',          flag: '🇬🇭', p: 2, w: 1, d: 1, l: 0, gf: 1,  ga: 0,  gd: 1,  pts: 4 },
      { team: 'Hırvatistan',   flag: '🇭🇷', p: 2, w: 1, d: 0, l: 1, gf: 3,  ga: 4,  gd: -1, pts: 3 },
      { team: 'Panama',        flag: '🇵🇦', p: 2, w: 0, d: 0, l: 2, gf: 0,  ga: 2,  gd: -2, pts: 0 },
    ],
  },
  {
    id: 'L', name: 'Grup L',
    teams: [
      { team: 'İspanya',       flag: '🇪🇸', p: 2, w: 2, d: 0, l: 0, gf: 5,  ga: 1,  gd: 4,  pts: 6 },
      { team: 'Uruguay',       flag: '🇺🇾', p: 2, w: 1, d: 0, l: 1, gf: 2,  ga: 2,  gd: 0,  pts: 3 },
      { team: 'G. Arabistan',  flag: '🇸🇦', p: 2, w: 1, d: 0, l: 1, gf: 2,  ga: 3,  gd: -1, pts: 3 },
      { team: 'Madagaskar',    flag: '🇲🇬', p: 2, w: 0, d: 0, l: 2, gf: 1,  ga: 4,  gd: -3, pts: 0 },
    ],
  },
]

const MATCHES: Match[] = [
  // Grup A
  { home: 'Meksika',      homeFlag: '🇲🇽', homeScore: 2, awayScore: 0, away: 'G. Afrika',     awayFlag: '🇿🇦', date: '13 Haz', group: 'A', finished: true },
  { home: 'G. Kore',      homeFlag: '🇰🇷', homeScore: 2, awayScore: 1, away: 'Çekya',          awayFlag: '🇨🇿', date: '13 Haz', group: 'A', finished: true },
  { home: 'Çekya',        homeFlag: '🇨🇿', homeScore: 1, awayScore: 1, away: 'G. Afrika',     awayFlag: '🇿🇦', date: '19 Haz', group: 'A', finished: true },
  { home: 'Meksika',      homeFlag: '🇲🇽', homeScore: 1, awayScore: 0, away: 'G. Kore',       awayFlag: '🇰🇷', date: '19 Haz', group: 'A', finished: true },
  // Grup B
  { home: 'Kanada',       homeFlag: '🇨🇦', homeScore: 1, awayScore: 1, away: 'Bosna Hersek', awayFlag: '🇧🇦', date: '14 Haz', group: 'B', finished: true },
  { home: 'İsviçre',      homeFlag: '🇨🇭', homeScore: 1, awayScore: 1, away: 'Katar',         awayFlag: '🇶🇦', date: '14 Haz', group: 'B', finished: true },
  { home: 'İsviçre',      homeFlag: '🇨🇭', homeScore: 4, awayScore: 1, away: 'Bosna Hersek', awayFlag: '🇧🇦', date: '20 Haz', group: 'B', finished: true },
  { home: 'Kanada',       homeFlag: '🇨🇦', homeScore: 6, awayScore: 0, away: 'Katar',         awayFlag: '🇶🇦', date: '20 Haz', group: 'B', finished: true },
  // Grup C
  { home: 'Brezilya',     homeFlag: '🇧🇷', homeScore: 1, awayScore: 1, away: 'Fas',           awayFlag: '🇲🇦', date: '14 Haz', group: 'C', finished: true },
  { home: 'İskoçya',      homeFlag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', homeScore: 1, awayScore: 0, away: 'Haiti',         awayFlag: '🇭🇹', date: '14 Haz', group: 'C', finished: true },
  { home: 'Fas',          homeFlag: '🇲🇦', homeScore: 1, awayScore: 0, away: 'İskoçya',       awayFlag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', date: '20 Haz', group: 'C', finished: true },
  { home: 'Brezilya',     homeFlag: '🇧🇷', homeScore: 3, awayScore: 0, away: 'Haiti',         awayFlag: '🇭🇹', date: '20 Haz', group: 'C', finished: true },
  // Grup D — TÜRKİYE
  { home: 'ABD',          homeFlag: '🇺🇸', homeScore: 4, awayScore: 1, away: 'Paraguay',      awayFlag: '🇵🇾', date: '15 Haz', group: 'D', finished: true },
  { home: 'Avustralya',   homeFlag: '🇦🇺', homeScore: 2, awayScore: 0, away: 'Türkiye',       awayFlag: '🇹🇷', date: '15 Haz', group: 'D', finished: true },
  { home: 'ABD',          homeFlag: '🇺🇸', homeScore: 2, awayScore: 0, away: 'Avustralya',    awayFlag: '🇦🇺', date: '21 Haz', group: 'D', finished: true },
  { home: 'Türkiye',      homeFlag: '🇹🇷', homeScore: 0, awayScore: 1, away: 'Paraguay',      awayFlag: '🇵🇾', date: '21 Haz', group: 'D', finished: true },
  { home: 'Türkiye',      homeFlag: '🇹🇷', homeScore: 0, awayScore: 0, away: 'ABD',           awayFlag: '🇺🇸', date: '26 Haz', group: 'D', finished: false },
  { home: 'Paraguay',     homeFlag: '🇵🇾', homeScore: 0, awayScore: 0, away: 'Avustralya',    awayFlag: '🇦🇺', date: '26 Haz', group: 'D', finished: false },
  // Grup E
  { home: 'Almanya',      homeFlag: '🇩🇪', homeScore: 7, awayScore: 1, away: 'Curaçao',       awayFlag: '🇨🇼', date: '14 Haz', group: 'E', finished: true },
  { home: 'Fildişi Sah.', homeFlag: '🇨🇮', homeScore: 1, awayScore: 0, away: 'Ekvador',       awayFlag: '🇪🇨', date: '14 Haz', group: 'E', finished: true },
  { home: 'Almanya',      homeFlag: '🇩🇪', homeScore: 2, awayScore: 1, away: 'Fildişi Sah.', awayFlag: '🇨🇮',  date: '20 Haz', group: 'E', finished: true },
  { home: 'Ekvador',      homeFlag: '🇪🇨', homeScore: 0, awayScore: 0, away: 'Curaçao',       awayFlag: '🇨🇼', date: '20 Haz', group: 'E', finished: true },
  // Grup F
  { home: 'Hollanda',     homeFlag: '🇳🇱', homeScore: 2, awayScore: 2, away: 'Japonya',       awayFlag: '🇯🇵', date: '15 Haz', group: 'F', finished: true },
  { home: 'İsveç',        homeFlag: '🇸🇪', homeScore: 5, awayScore: 1, away: 'Tunus',         awayFlag: '🇹🇳', date: '15 Haz', group: 'F', finished: true },
  { home: 'Hollanda',     homeFlag: '🇳🇱', homeScore: 5, awayScore: 1, away: 'İsveç',         awayFlag: '🇸🇪', date: '21 Haz', group: 'F', finished: true },
  { home: 'Japonya',      homeFlag: '🇯🇵', homeScore: 4, awayScore: 0, away: 'Tunus',         awayFlag: '🇹🇳', date: '21 Haz', group: 'F', finished: true },
  // Grup G
  { home: 'Belçika',      homeFlag: '🇧🇪', homeScore: 1, awayScore: 1, away: 'Mısır',         awayFlag: '🇪🇬', date: '15 Haz', group: 'G', finished: true },
  { home: 'İran',         homeFlag: '🇮🇷', homeScore: 2, awayScore: 2, away: 'Yeni Zelanda',  awayFlag: '🇳🇿', date: '15 Haz', group: 'G', finished: true },
  { home: 'Belçika',      homeFlag: '🇧🇪', homeScore: 0, awayScore: 0, away: 'İran',          awayFlag: '🇮🇷', date: '21 Haz', group: 'G', finished: true },
  { home: 'Mısır',        homeFlag: '🇪🇬', homeScore: 3, awayScore: 1, away: 'Yeni Zelanda',  awayFlag: '🇳🇿', date: '21 Haz', group: 'G', finished: true },
  // Grup H
  { home: 'Fransa',       homeFlag: '🇫🇷', homeScore: 3, awayScore: 1, away: 'Senegal',       awayFlag: '🇸🇳', date: '16 Haz', group: 'H', finished: true },
  { home: 'Norveç',       homeFlag: '🇳🇴', homeScore: 4, awayScore: 1, away: 'Irak',          awayFlag: '🇮🇶', date: '16 Haz', group: 'H', finished: true },
  { home: 'Fransa',       homeFlag: '🇫🇷', homeScore: 3, awayScore: 0, away: 'Irak',          awayFlag: '🇮🇶', date: '22 Haz', group: 'H', finished: true },
  { home: 'Norveç',       homeFlag: '🇳🇴', homeScore: 3, awayScore: 2, away: 'Senegal',       awayFlag: '🇸🇳', date: '22 Haz', group: 'H', finished: true },
  // Grup I
  { home: 'Arjantin',     homeFlag: '🇦🇷', homeScore: 3, awayScore: 0, away: 'Cezayir',       awayFlag: '🇩🇿', date: '16 Haz', group: 'I', finished: true },
  { home: 'Avusturya',    homeFlag: '🇦🇹', homeScore: 3, awayScore: 1, away: 'Ürdün',         awayFlag: '🇯🇴', date: '17 Haz', group: 'I', finished: true },
  { home: 'Arjantin',     homeFlag: '🇦🇷', homeScore: 1, awayScore: 0, away: 'Avusturya',     awayFlag: '🇦🇹', date: '22 Haz', group: 'I', finished: true },
  { home: 'Ürdün',        homeFlag: '🇯🇴', homeScore: 2, awayScore: 1, away: 'Cezayir',       awayFlag: '🇩🇿', date: '22 Haz', group: 'I', finished: true },
  // Grup J
  { home: 'Portekiz',     homeFlag: '🇵🇹', homeScore: 1, awayScore: 1, away: 'K. Kongo',      awayFlag: '🇨🇩', date: '17 Haz', group: 'J', finished: true },
  { home: 'Kolombiya',    homeFlag: '🇨🇴', homeScore: 3, awayScore: 1, away: 'Özbekistan',    awayFlag: '🇺🇿', date: '17 Haz', group: 'J', finished: true },
  { home: 'Portekiz',     homeFlag: '🇵🇹', homeScore: 5, awayScore: 0, away: 'Özbekistan',    awayFlag: '🇺🇿', date: '23 Haz', group: 'J', finished: true },
  { home: 'Kolombiya',    homeFlag: '🇨🇴', homeScore: 1, awayScore: 0, away: 'K. Kongo',      awayFlag: '🇨🇩', date: '23 Haz', group: 'J', finished: true },
  // Grup K
  { home: 'İngiltere',    homeFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', homeScore: 4, awayScore: 2, away: 'Hırvatistan',   awayFlag: '🇭🇷', date: '17 Haz', group: 'K', finished: true },
  { home: 'Gana',         homeFlag: '🇬🇭', homeScore: 1, awayScore: 0, away: 'Panama',        awayFlag: '🇵🇦', date: '17 Haz', group: 'K', finished: true },
  { home: 'İngiltere',    homeFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', homeScore: 0, awayScore: 0, away: 'Gana',          awayFlag: '🇬🇭', date: '23 Haz', group: 'K', finished: true },
  { home: 'Hırvatistan',  homeFlag: '🇭🇷', homeScore: 1, awayScore: 0, away: 'Panama',        awayFlag: '🇵🇦', date: '23 Haz', group: 'K', finished: true },
  // Grup L
  { home: 'İspanya',      homeFlag: '🇪🇸', homeScore: 3, awayScore: 0, away: 'Madagaskar',    awayFlag: '🇲🇬', date: '18 Haz', group: 'L', finished: true },
  { home: 'Uruguay',      homeFlag: '🇺🇾', homeScore: 2, awayScore: 1, away: 'G. Arabistan',  awayFlag: '🇸🇦', date: '18 Haz', group: 'L', finished: true },
  { home: 'İspanya',      homeFlag: '🇪🇸', homeScore: 2, awayScore: 1, away: 'Uruguay',       awayFlag: '🇺🇾', date: '24 Haz', group: 'L', finished: true },
  { home: 'G. Arabistan', homeFlag: '🇸🇦', homeScore: 1, awayScore: 1, away: 'Madagaskar',    awayFlag: '🇲🇬', date: '24 Haz', group: 'L', finished: true },
]

// ─── Sub-Components ───────────────────────────────────────────────────────────
function StandingsTable({ group }: { group: Group }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
      <div className="flex items-center gap-2 bg-amber-500 px-3 py-2">
        <Trophy className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-black text-white">{group.name} Puan Durumu</span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
            <th className="px-2 py-1.5 text-left font-semibold text-[rgb(var(--color-muted))]">Takım</th>
            <th className="px-1 py-1.5 text-center font-semibold text-[rgb(var(--color-muted))]">O</th>
            <th className="px-1 py-1.5 text-center font-semibold text-[rgb(var(--color-muted))]">G</th>
            <th className="px-1 py-1.5 text-center font-semibold text-[rgb(var(--color-muted))]">B</th>
            <th className="px-1 py-1.5 text-center font-semibold text-[rgb(var(--color-muted))]">M</th>
            <th className="px-1 py-1.5 text-center font-semibold text-[rgb(var(--color-muted))]">A/Y</th>
            <th className="px-1 py-1.5 text-center font-semibold text-[rgb(var(--color-muted))]">AV</th>
            <th className="px-2 py-1.5 text-center font-bold text-[rgb(var(--color-text))]">P</th>
          </tr>
        </thead>
        <tbody>
          {group.teams.map((t, i) => (
            <tr
              key={t.team}
              className={cn(
                'border-b border-[rgb(var(--color-border))] last:border-0',
                t.isTurkiye && 'bg-red-50 dark:bg-red-950/20',
                i < 2 && !t.isTurkiye && 'bg-emerald-50/50 dark:bg-emerald-950/10',
              )}
            >
              <td className="px-2 py-2">
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-black text-white',
                    i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : 'bg-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]'
                  )}>{i + 1}</span>
                  <span className="text-sm leading-none">{t.flag}</span>
                  <span className={cn('font-semibold', t.isTurkiye ? 'text-red-600 dark:text-red-400' : 'text-[rgb(var(--color-text))]')}>
                    {t.team}
                  </span>
                  {t.isTurkiye && (
                    <span className="rounded-full bg-red-100 px-1 py-0.5 text-[9px] font-black text-red-600 dark:bg-red-900/40 dark:text-red-400">TR</span>
                  )}
                </div>
              </td>
              <td className="px-1 py-2 text-center text-[rgb(var(--color-muted))]">{t.p}</td>
              <td className="px-1 py-2 text-center text-[rgb(var(--color-muted))]">{t.w}</td>
              <td className="px-1 py-2 text-center text-[rgb(var(--color-muted))]">{t.d}</td>
              <td className="px-1 py-2 text-center text-[rgb(var(--color-muted))]">{t.l}</td>
              <td className="px-1 py-2 text-center text-[rgb(var(--color-muted))]">{t.gf}:{t.ga}</td>
              <td className={cn('px-1 py-2 text-center font-semibold text-xs',
                t.gd > 0 ? 'text-emerald-600' : t.gd < 0 ? 'text-red-500' : 'text-[rgb(var(--color-muted))]'
              )}>
                {t.gd > 0 ? `+${t.gd}` : t.gd}
              </td>
              <td className="px-2 py-2 text-center">
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-black text-white">{t.pts}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-3 px-3 py-1.5 text-[10px] text-[rgb(var(--color-muted))]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Tur atlıyor (ilk 2)
        </span>
      </div>
    </div>
  )
}

function MatchRow({ match }: { match: Match }) {
  const hasTurkiye = match.home === 'Türkiye' || match.away === 'Türkiye'
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs',
      hasTurkiye
        ? 'border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-950/20'
        : match.finished
          ? 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]'
          : 'border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20',
    )}>
      <span className="w-14 shrink-0 text-center text-[10px] text-[rgb(var(--color-muted))]">{match.date}</span>
      <div className="flex flex-1 items-center justify-end gap-1.5">
        <span className="text-right font-semibold text-[rgb(var(--color-text))]">{match.home}</span>
        <span className="text-sm">{match.homeFlag}</span>
      </div>
      <div className={cn(
        'flex w-12 shrink-0 items-center justify-center rounded-lg px-1.5 py-1 text-sm font-black',
        match.finished
          ? 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text))]'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      )}>
        {match.finished ? `${match.homeScore}–${match.awayScore}` : 'vs'}
      </div>
      <div className="flex flex-1 items-center gap-1.5">
        <span className="text-sm">{match.awayFlag}</span>
        <span className="font-semibold text-[rgb(var(--color-text))]">{match.away}</span>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
type ActiveChip = 'haberler' | string  // string = grup ID ('A'…'L')

interface Props {
  initialPosts?: TimelinePost[]
}

export function WorldCupCategoryTabs({ initialPosts }: Props) {
  const [active, setActive] = useState<ActiveChip>('haberler')

  const chips: { id: ActiveChip; label: string }[] = [
    { id: 'haberler', label: '📰 Haberler' },
    ...GROUPS.map(g => ({
      id: g.id,
      label: g.id === 'D' ? `🇹🇷 ${g.name}` : g.name,
    })),
  ]

  const activeGroup = active !== 'haberler'
    ? GROUPS.find(g => g.id === active) ?? null
    : null

  const groupMatches = activeGroup
    ? MATCHES.filter(m => m.group === activeGroup.id)
    : []

  return (
    <div>
      {/* ── Kaydırmalı chip bar ── */}
      <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
        {chips.map(chip => {
          const isActive = active === chip.id
          return (
            <button
              key={chip.id}
              onClick={() => setActive(chip.id)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                isActive
                  ? 'border-amber-400 bg-amber-500 text-white'
                  : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] hover:border-amber-300 hover:text-amber-600',
              )}
            >
              {chip.label}
            </button>
          )
        })}
      </div>

      {/* ── Haberler ── CategoryFeed her zaman mount'lu, sadece görünürlük değişir */}
      <div className={active === 'haberler' ? '' : 'hidden'}>
        <CategoryFeed categoryId="dunya-kupasi-2026" initialPosts={initialPosts} />
      </div>

      {/* ── Grup görünümü ── */}
      {activeGroup && (
        <div className="space-y-4">
          {/* Puan durumu */}
          <StandingsTable group={activeGroup} />

          {/* Maç sonuçları */}
          <div>
            <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-[rgb(var(--color-muted))]">
              {activeGroup.name} Maçları
            </h3>
            <div className="space-y-2">
              {groupMatches.map((m, i) => (
                <MatchRow key={i} match={m} />
              ))}
            </div>
          </div>

          {/* Güncelleme notu */}
          <p className="text-center text-[10px] text-[rgb(var(--color-muted))]">
            Güncelleme: 25 Haziran 2026 · Kaynak: FIFA / ESPN
          </p>
        </div>
      )}
    </div>
  )
}
