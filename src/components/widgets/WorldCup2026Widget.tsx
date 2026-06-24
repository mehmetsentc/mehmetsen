'use client'

import { useState } from 'react'
import { Trophy, Flag, Star, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────────────
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
  isturkiye?: boolean
}

interface Group {
  id: string
  name: string
  teams: TeamStat[]
}

interface MatchResult {
  home: string
  homeFlag: string
  homeScore: number
  awayScore: number
  away: string
  awayFlag: string
  date: string
  group: string
  finished: boolean
}

// ─── Data ───────────────────────────────────────────────────────────────────
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
      { team: 'Türkiye',       flag: '🇹🇷', p: 2, w: 0, d: 0, l: 2, gf: 0,  ga: 3,  gd: -3, pts: 0, isturkiye: true },
    ],
  },
  {
    id: 'E', name: 'Grup E',
    teams: [
      { team: 'Almanya',       flag: '🇩🇪', p: 2, w: 2, d: 0, l: 0, gf: 9,  ga: 2,  gd: 7,  pts: 6 },
      { team: 'Fildişi Sah.', flag: '🇨🇮', p: 2, w: 1, d: 0, l: 1, gf: 2,  ga: 2,  gd: 0,  pts: 3 },
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

const MATCHES: MatchResult[] = [
  // Group A
  { home: 'Meksika', homeFlag: '🇲🇽', homeScore: 2, awayScore: 0, away: 'G. Afrika', awayFlag: '🇿🇦', date: '13 Haz', group: 'A', finished: true },
  { home: 'G. Kore', homeFlag: '🇰🇷', homeScore: 2, awayScore: 1, away: 'Çekya', awayFlag: '🇨🇿', date: '13 Haz', group: 'A', finished: true },
  { home: 'Çekya', homeFlag: '🇨🇿', homeScore: 1, awayScore: 1, away: 'G. Afrika', awayFlag: '🇿🇦', date: '19 Haz', group: 'A', finished: true },
  { home: 'Meksika', homeFlag: '🇲🇽', homeScore: 1, awayScore: 0, away: 'G. Kore', awayFlag: '🇰🇷', date: '19 Haz', group: 'A', finished: true },
  // Group B
  { home: 'Kanada', homeFlag: '🇨🇦', homeScore: 1, awayScore: 1, away: 'Bosna Hersek', awayFlag: '🇧🇦', date: '14 Haz', group: 'B', finished: true },
  { home: 'İsviçre', homeFlag: '🇨🇭', homeScore: 1, awayScore: 1, away: 'Katar', awayFlag: '🇶🇦', date: '14 Haz', group: 'B', finished: true },
  { home: 'İsviçre', homeFlag: '🇨🇭', homeScore: 4, awayScore: 1, away: 'Bosna Hersek', awayFlag: '🇧🇦', date: '20 Haz', group: 'B', finished: true },
  { home: 'Kanada', homeFlag: '🇨🇦', homeScore: 6, awayScore: 0, away: 'Katar', awayFlag: '🇶🇦', date: '20 Haz', group: 'B', finished: true },
  // Group C
  { home: 'Brezilya', homeFlag: '🇧🇷', homeScore: 1, awayScore: 1, away: 'Fas', awayFlag: '🇲🇦', date: '14 Haz', group: 'C', finished: true },
  { home: 'İskoçya', homeFlag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', homeScore: 1, awayScore: 0, away: 'Haiti', awayFlag: '🇭🇹', date: '14 Haz', group: 'C', finished: true },
  { home: 'Fas', homeFlag: '🇲🇦', homeScore: 1, awayScore: 0, away: 'İskoçya', awayFlag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', date: '20 Haz', group: 'C', finished: true },
  { home: 'Brezilya', homeFlag: '🇧🇷', homeScore: 3, awayScore: 0, away: 'Haiti', awayFlag: '🇭🇹', date: '20 Haz', group: 'C', finished: true },
  // Group D — TÜRKİYE
  { home: 'ABD', homeFlag: '🇺🇸', homeScore: 4, awayScore: 1, away: 'Paraguay', awayFlag: '🇵🇾', date: '15 Haz', group: 'D', finished: true },
  { home: 'Avustralya', homeFlag: '🇦🇺', homeScore: 2, awayScore: 0, away: 'Türkiye', awayFlag: '🇹🇷', date: '15 Haz', group: 'D', finished: true },
  { home: 'ABD', homeFlag: '🇺🇸', homeScore: 2, awayScore: 0, away: 'Avustralya', awayFlag: '🇦🇺', date: '21 Haz', group: 'D', finished: true },
  { home: 'Türkiye', homeFlag: '🇹🇷', homeScore: 0, awayScore: 1, away: 'Paraguay', awayFlag: '🇵🇾', date: '21 Haz', group: 'D', finished: true },
  // Group E
  { home: 'Almanya', homeFlag: '🇩🇪', homeScore: 7, awayScore: 1, away: 'Curaçao', awayFlag: '🇨🇼', date: '14 Haz', group: 'E', finished: true },
  { home: 'Fildişi Sah.', homeFlag: '🇨🇮', homeScore: 1, awayScore: 0, away: 'Ekvador', awayFlag: '🇪🇨', date: '14 Haz', group: 'E', finished: true },
  { home: 'Almanya', homeFlag: '🇩🇪', homeScore: 2, awayScore: 1, away: 'Fildişi Sah.', awayFlag: '🇨🇮', date: '20 Haz', group: 'E', finished: true },
  { home: 'Ekvador', homeFlag: '🇪🇨', homeScore: 0, awayScore: 0, away: 'Curaçao', awayFlag: '🇨🇼', date: '20 Haz', group: 'E', finished: true },
  // Group F
  { home: 'Hollanda', homeFlag: '🇳🇱', homeScore: 2, awayScore: 2, away: 'Japonya', awayFlag: '🇯🇵', date: '15 Haz', group: 'F', finished: true },
  { home: 'İsveç', homeFlag: '🇸🇪', homeScore: 5, awayScore: 1, away: 'Tunus', awayFlag: '🇹🇳', date: '15 Haz', group: 'F', finished: true },
  { home: 'Hollanda', homeFlag: '🇳🇱', homeScore: 5, awayScore: 1, away: 'İsveç', awayFlag: '🇸🇪', date: '21 Haz', group: 'F', finished: true },
  { home: 'Japonya', homeFlag: '🇯🇵', homeScore: 4, awayScore: 0, away: 'Tunus', awayFlag: '🇹🇳', date: '21 Haz', group: 'F', finished: true },
  // Group G
  { home: 'Belçika', homeFlag: '🇧🇪', homeScore: 1, awayScore: 1, away: 'Mısır', awayFlag: '🇪🇬', date: '15 Haz', group: 'G', finished: true },
  { home: 'İran', homeFlag: '🇮🇷', homeScore: 2, awayScore: 2, away: 'Yeni Zelanda', awayFlag: '🇳🇿', date: '15 Haz', group: 'G', finished: true },
  { home: 'Belçika', homeFlag: '🇧🇪', homeScore: 0, awayScore: 0, away: 'İran', awayFlag: '🇮🇷', date: '21 Haz', group: 'G', finished: true },
  { home: 'Mısır', homeFlag: '🇪🇬', homeScore: 3, awayScore: 1, away: 'Yeni Zelanda', awayFlag: '🇳🇿', date: '21 Haz', group: 'G', finished: true },
  // Group H
  { home: 'Fransa', homeFlag: '🇫🇷', homeScore: 3, awayScore: 1, away: 'Senegal', awayFlag: '🇸🇳', date: '16 Haz', group: 'H', finished: true },
  { home: 'Norveç', homeFlag: '🇳🇴', homeScore: 4, awayScore: 1, away: 'Irak', awayFlag: '🇮🇶', date: '16 Haz', group: 'H', finished: true },
  { home: 'Fransa', homeFlag: '🇫🇷', homeScore: 3, awayScore: 0, away: 'Irak', awayFlag: '🇮🇶', date: '22 Haz', group: 'H', finished: true },
  { home: 'Norveç', homeFlag: '🇳🇴', homeScore: 3, awayScore: 2, away: 'Senegal', awayFlag: '🇸🇳', date: '22 Haz', group: 'H', finished: true },
  // Group I
  { home: 'Arjantin', homeFlag: '🇦🇷', homeScore: 3, awayScore: 0, away: 'Cezayir', awayFlag: '🇩🇿', date: '16 Haz', group: 'I', finished: true },
  { home: 'Avusturya', homeFlag: '🇦🇹', homeScore: 3, awayScore: 1, away: 'Ürdün', awayFlag: '🇯🇴', date: '17 Haz', group: 'I', finished: true },
  { home: 'Arjantin', homeFlag: '🇦🇷', homeScore: 1, awayScore: 0, away: 'Avusturya', awayFlag: '🇦🇹', date: '22 Haz', group: 'I', finished: true },
  { home: 'Ürdün', homeFlag: '🇯🇴', homeScore: 2, awayScore: 1, away: 'Cezayir', awayFlag: '🇩🇿', date: '22 Haz', group: 'I', finished: true },
  // Group J
  { home: 'Portekiz', homeFlag: '🇵🇹', homeScore: 1, awayScore: 1, away: 'K. Kongo', awayFlag: '🇨🇩', date: '17 Haz', group: 'J', finished: true },
  { home: 'Kolombiya', homeFlag: '🇨🇴', homeScore: 3, awayScore: 1, away: 'Özbekistan', awayFlag: '🇺🇿', date: '17 Haz', group: 'J', finished: true },
  { home: 'Portekiz', homeFlag: '🇵🇹', homeScore: 5, awayScore: 0, away: 'Özbekistan', awayFlag: '🇺🇿', date: '23 Haz', group: 'J', finished: true },
  { home: 'Kolombiya', homeFlag: '🇨🇴', homeScore: 1, awayScore: 0, away: 'K. Kongo', awayFlag: '🇨🇩', date: '23 Haz', group: 'J', finished: true },
  // Group K
  { home: 'İngiltere', homeFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', homeScore: 4, awayScore: 2, away: 'Hırvatistan', awayFlag: '🇭🇷', date: '17 Haz', group: 'K', finished: true },
  { home: 'Gana', homeFlag: '🇬🇭', homeScore: 1, awayScore: 0, away: 'Panama', awayFlag: '🇵🇦', date: '17 Haz', group: 'K', finished: true },
  { home: 'İngiltere', homeFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', homeScore: 0, awayScore: 0, away: 'Gana', awayFlag: '🇬🇭', date: '23 Haz', group: 'K', finished: true },
  { home: 'Hırvatistan', homeFlag: '🇭🇷', homeScore: 1, awayScore: 0, away: 'Panama', awayFlag: '🇵🇦', date: '23 Haz', group: 'K', finished: true },
  // Group L
  { home: 'İspanya', homeFlag: '🇪🇸', homeScore: 3, awayScore: 0, away: 'Madagaskar', awayFlag: '🇲🇬', date: '18 Haz', group: 'L', finished: true },
  { home: 'Uruguay', homeFlag: '🇺🇾', homeScore: 2, awayScore: 1, away: 'G. Arabistan', awayFlag: '🇸🇦', date: '18 Haz', group: 'L', finished: true },
  { home: 'İspanya', homeFlag: '🇪🇸', homeScore: 2, awayScore: 1, away: 'Uruguay', awayFlag: '🇺🇾', date: '24 Haz', group: 'L', finished: true },
  { home: 'G. Arabistan', homeFlag: '🇸🇦', homeScore: 1, awayScore: 1, away: 'Madagaskar', awayFlag: '🇲🇬', date: '24 Haz', group: 'L', finished: true },
  // 3. Tur (devam ediyor)
  { home: 'Türkiye', homeFlag: '🇹🇷', homeScore: 0, awayScore: 0, away: 'ABD', awayFlag: '🇺🇸', date: '26 Haz', group: 'D', finished: false },
  { home: 'Paraguay', homeFlag: '🇵🇾', homeScore: 0, awayScore: 0, away: 'Avustralya', awayFlag: '🇦🇺', date: '26 Haz', group: 'D', finished: false },
]

// ─── Sub-Components ──────────────────────────────────────────────────────────
function GroupTable({ group }: { group: Group }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
      <div className="flex items-center gap-2 bg-amber-500 px-3 py-2">
        <Trophy className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-black text-white">{group.name}</span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
            <th className="px-2 py-1.5 text-left font-semibold text-[rgb(var(--color-muted))]">Takım</th>
            <th className="px-1 py-1.5 text-center font-semibold text-[rgb(var(--color-muted))]">O</th>
            <th className="px-1 py-1.5 text-center font-semibold text-[rgb(var(--color-muted))]">G</th>
            <th className="px-1 py-1.5 text-center font-semibold text-[rgb(var(--color-muted))]">B</th>
            <th className="px-1 py-1.5 text-center font-semibold text-[rgb(var(--color-muted))]">M</th>
            <th className="px-1 py-1.5 text-center font-semibold text-[rgb(var(--color-muted))]">A</th>
            <th className="px-1 py-1.5 text-center font-semibold text-[rgb(var(--color-muted))]">Y</th>
            <th className="px-1 py-1.5 text-center font-semibold text-[rgb(var(--color-muted))]">AV</th>
            <th className="px-2 py-1.5 text-center font-bold text-[rgb(var(--color-text))]">P</th>
          </tr>
        </thead>
        <tbody>
          {group.teams.map((t, i) => (
            <tr key={t.team}
              className={cn(
                'border-b border-[rgb(var(--color-border))] last:border-0 transition-colors',
                t.isturkiye && 'bg-red-50 dark:bg-red-950/20',
                i < 2 && !t.isturkiye && 'bg-emerald-50/50 dark:bg-emerald-950/10',
              )}
            >
              <td className="px-2 py-2">
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-black text-white',
                    i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : 'bg-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]'
                  )}>{i + 1}</span>
                  <span className="text-base leading-none">{t.flag}</span>
                  <span className={cn('font-semibold', t.isturkiye ? 'text-red-600 dark:text-red-400' : 'text-[rgb(var(--color-text))]')}>{t.team}</span>
                  {t.isturkiye && <span className="rounded-full bg-red-100 px-1 py-0.5 text-[9px] font-black text-red-600 dark:bg-red-900/40 dark:text-red-400">TR</span>}
                </div>
              </td>
              <td className="px-1 py-2 text-center text-[rgb(var(--color-muted))]">{t.p}</td>
              <td className="px-1 py-2 text-center text-[rgb(var(--color-muted))]">{t.w}</td>
              <td className="px-1 py-2 text-center text-[rgb(var(--color-muted))]">{t.d}</td>
              <td className="px-1 py-2 text-center text-[rgb(var(--color-muted))]">{t.l}</td>
              <td className="px-1 py-2 text-center text-[rgb(var(--color-muted))]">{t.gf}</td>
              <td className="px-1 py-2 text-center text-[rgb(var(--color-muted))]">{t.ga}</td>
              <td className={cn('px-1 py-2 text-center font-semibold', t.gd > 0 ? 'text-emerald-600' : t.gd < 0 ? 'text-red-500' : 'text-[rgb(var(--color-muted))]')}>{t.gd > 0 ? `+${t.gd}` : t.gd}</td>
              <td className="px-2 py-2 text-center">
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-black text-white">{t.pts}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-3 px-3 py-1.5 text-[10px] text-[rgb(var(--color-muted))]">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> Tur atlıyor</span>
      </div>
    </div>
  )
}

function MatchCard({ match }: { match: MatchResult }) {
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-xl border px-3 py-2.5',
      match.finished
        ? 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]'
        : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20',
      (match.home === 'Türkiye' || match.away === 'Türkiye') && 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20'
    )}>
      <span className="min-w-[32px] text-center text-[10px] font-semibold text-[rgb(var(--color-muted))]">{match.date}</span>
      <span className="hidden text-[10px] text-[rgb(var(--color-muted))] sm:inline">Grup {match.group}</span>
      <div className="flex flex-1 items-center justify-end gap-1.5">
        <span className="text-right text-xs font-semibold text-[rgb(var(--color-text))]">{match.home}</span>
        <span className="text-sm">{match.homeFlag}</span>
      </div>
      <div className={cn(
        'flex min-w-[44px] items-center justify-center rounded-lg px-2 py-1 text-sm font-black',
        match.finished
          ? 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text))]'
          : 'bg-amber-400 text-white'
      )}>
        {match.finished ? `${match.homeScore} - ${match.awayScore}` : 'vs'}
      </div>
      <div className="flex flex-1 items-center gap-1.5">
        <span className="text-sm">{match.awayFlag}</span>
        <span className="text-xs font-semibold text-[rgb(var(--color-text))]">{match.away}</span>
      </div>
    </div>
  )
}

// ─── Main Widget ─────────────────────────────────────────────────────────────
type Tab = 'gruplar' | 'maclar' | 'turkiye'

export function WorldCup2026Widget() {
  const [tab, setTab] = useState<Tab>('gruplar')
  const [selectedGroup, setSelectedGroup] = useState<string>('all')

  const turkeyMatches = MATCHES.filter(m => m.home === 'Türkiye' || m.away === 'Türkiye')
  const turkeyGroup = GROUPS.find(g => g.id === 'D')!
  const turkeyStat = turkeyGroup.teams.find(t => t.isturkiye)!

  const filteredMatches = MATCHES.filter(m => m.finished && (selectedGroup === 'all' || m.group === selectedGroup))

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-amber-200 bg-[rgb(var(--color-card))] shadow-sm dark:border-amber-800/40">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-r from-amber-600 to-amber-500 px-4 py-4">
        <div className="absolute inset-0 opacity-10">
          {['⚽', '🏆', '⚽', '🏆', '⚽'].map((e, i) => (
            <span key={i} className="absolute text-4xl" style={{ left: `${i * 25}%`, top: '50%', transform: 'translateY(-50%) rotate(-10deg)' }}>{e}</span>
          ))}
        </div>
        <div className="relative">
          <div className="flex items-center gap-2">
            <Trophy className="h-6 w-6 text-white" />
            <div>
              <h2 className="text-lg font-black text-white">2026 FIFA Dünya Kupası</h2>
              <p className="text-xs text-amber-100">Kanada · Meksika · ABD · 11 Haziran – 19 Temmuz 2026</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <div className="rounded-full bg-white/20 px-2.5 py-1 text-white"><span className="font-black">48</span> Takım</div>
            <div className="rounded-full bg-white/20 px-2.5 py-1 text-white"><span className="font-black">12</span> Grup</div>
            <div className="rounded-full bg-white/20 px-2.5 py-1 text-white"><span className="font-black">104</span> Maç</div>
            <div className="rounded-full bg-white/20 px-2.5 py-1 text-white"><span className="font-black">16</span> Ülke</div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[rgb(var(--color-border))]">
        {([['gruplar', '📊 Gruplar'], ['maclar', '⚽ Maçlar'], ['turkiye', '🇹🇷 Türkiye']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as Tab)}
            className={cn('flex-1 py-2.5 text-xs font-bold transition-colors',
              tab === id
                ? 'border-b-2 border-amber-500 text-amber-600 dark:text-amber-400'
                : 'text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
            )}>
            {label}
          </button>
        ))}
      </div>

      {/* ── GRUPLAR ── */}
      {tab === 'gruplar' && (
        <div className="p-4">
          <p className="mb-3 text-[11px] text-[rgb(var(--color-muted))]">
            Grup aşaması devam ediyor · Güncelleme: 25 Haziran 2026
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {GROUPS.map(g => <GroupTable key={g.id} group={g} />)}
          </div>
        </div>
      )}

      {/* ── MAÇLAR ── */}
      {tab === 'maclar' && (
        <div className="p-4">
          {/* Group filter */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            <button onClick={() => setSelectedGroup('all')}
              className={cn('rounded-full px-3 py-1 text-xs font-semibold transition-all',
                selectedGroup === 'all' ? 'bg-amber-500 text-white' : 'border border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]')}>
              Tümü
            </button>
            {GROUPS.map(g => (
              <button key={g.id} onClick={() => setSelectedGroup(g.id)}
                className={cn('rounded-full px-2.5 py-1 text-xs font-semibold transition-all',
                  selectedGroup === g.id ? 'bg-amber-500 text-white' : 'border border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]')}>
                {g.id}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {filteredMatches.length === 0
              ? <p className="py-6 text-center text-sm text-[rgb(var(--color-muted))]">Bu grup için sonuç bulunamadı</p>
              : filteredMatches.map((m, i) => <MatchCard key={i} match={m} />)
            }
          </div>
        </div>
      )}

      {/* ── TÜRKİYE ── */}
      {tab === 'turkiye' && (
        <div className="p-4 space-y-4">
          {/* Status card */}
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800/40 dark:bg-red-950/20">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-3xl">🇹🇷</span>
              <div>
                <h3 className="font-black text-[rgb(var(--color-text))]">Türkiye Milli Takımı</h3>
                <p className="text-xs text-[rgb(var(--color-muted))]">Grup D · FIFA Sıralaması: 28</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { label: 'Puan', value: turkeyStat.pts, color: turkeyStat.pts > 3 ? 'text-emerald-600' : 'text-red-500' },
                { label: 'Galibiyet', value: turkeyStat.w, color: 'text-emerald-600' },
                { label: 'Beraberlik', value: turkeyStat.d, color: 'text-amber-600' },
                { label: 'Mağlubiyet', value: turkeyStat.l, color: 'text-red-500' },
              ].map(s => (
                <div key={s.label} className="rounded-lg bg-white p-2 dark:bg-[rgb(var(--color-card))]">
                  <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
                  <div className="text-[10px] text-[rgb(var(--color-muted))]">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg bg-red-100 p-2.5 text-xs dark:bg-red-900/30">
              <div className="flex items-center gap-1.5 text-red-700 dark:text-red-300">
                <Flag className="h-3.5 w-3.5 shrink-0" />
                <span className="font-semibold">Durum:</span>
                <span>2 maçta 0 puan toplandı. Son maç Avustralya–Paraguay eş zamanlı oynanacak. Türkiye'nin tur atlama şansı çok düşük.</span>
              </div>
            </div>
          </div>

          {/* Turkey matches */}
          <div>
            <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-[rgb(var(--color-muted))]">Türkiye Maçları</h4>
            <div className="space-y-2">
              {turkeyMatches.map((m, i) => <MatchCard key={i} match={m} />)}
            </div>
          </div>

          {/* Group D table */}
          <div>
            <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-[rgb(var(--color-muted))]">Grup D Puan Durumu</h4>
            <GroupTable group={turkeyGroup} />
          </div>

          {/* Key players */}
          <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
            <h4 className="mb-3 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-[rgb(var(--color-muted))]">
              <Star className="h-3.5 w-3.5 text-amber-500" /> Öne Çıkan Oyuncular
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { name: 'Hakan Çalhanoğlu', pos: 'Orta Saha', club: 'Inter Milan', no: '10' },
                { name: 'Arda Güler', pos: 'Orta Saha / Kanat', club: 'Real Madrid', no: '7' },
                { name: 'Kenan Yıldız', pos: 'Kanat', club: 'Juventus', no: '11' },
                { name: 'Mert Günok', pos: 'Kaleci', club: 'Galatasaray', no: '1' },
                { name: 'Kaan Ayhan', pos: 'Defans', club: 'Sassuolo', no: '5' },
                { name: 'Ferdi Kadıoğlu', pos: 'Defans', club: 'Brighton', no: '3' },
              ].map(p => (
                <div key={p.name} className="flex items-center gap-2.5 rounded-lg bg-[rgb(var(--color-surface))] px-3 py-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-600 text-[11px] font-black text-white">{p.no}</div>
                  <div>
                    <p className="text-xs font-bold text-[rgb(var(--color-text))]">{p.name}</p>
                    <p className="text-[10px] text-[rgb(var(--color-muted))]">{p.pos} · {p.club}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[rgb(var(--color-border))] px-4 py-2">
        <span className="text-[10px] text-[rgb(var(--color-muted))]">Kaynak: FIFA.com · CBS Sports · ESPN · 25 Haziran 2026</span>
        <a href="https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026"
          target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 hover:underline">
          FIFA <ChevronRight className="h-3 w-3" />
        </a>
      </div>
    </div>
  )
}
