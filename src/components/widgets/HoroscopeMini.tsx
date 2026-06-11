'use client'

import { useState } from 'react'

const SIGNS = [
  { id: 'koc', label: 'Koç', emoji: '♈' },
  { id: 'boga', label: 'Boğa', emoji: '♉' },
  { id: 'ikizler', label: 'İkizler', emoji: '♊' },
  { id: 'yengec', label: 'Yengeç', emoji: '♋' },
  { id: 'aslan', label: 'Aslan', emoji: '♌' },
  { id: 'basak', label: 'Başak', emoji: '♍' },
  { id: 'terazi', label: 'Terazi', emoji: '♎' },
  { id: 'akrep', label: 'Akrep', emoji: '♏' },
  { id: 'yay', label: 'Yay', emoji: '♐' },
  { id: 'oglak', label: 'Oğlak', emoji: '♑' },
  { id: 'kova', label: 'Kova', emoji: '♒' },
  { id: 'balik', label: 'Balık', emoji: '♓' },
]

// Simple deterministic daily horoscope hints (no API needed for MVP)
const THEMES = [
  'Bugün yeni başlangıçlar için güçlü bir gün.',
  'İlişkilerinize dikkat edin, iletişim önemli.',
  'Kariyer fırsatları kapınızı çalabilir.',
  'Mali konularda temkinli olun.',
  'Sağlığınıza önem verin, dinlenmeye vakit ayırın.',
  'Yaratıcı enerjiniz yüksek, projelerinizi ilerletin.',
  'Sosyal hayatınız canlı, yeni dostluklar kurabilirsiniz.',
  'Sevdiklerinizle zaman geçirmek size iyi gelecek.',
  'Planlı hareket etmek bugün avantaj sağlar.',
  'Sezgilerinize güvenin, içgüdüleriniz doğru.',
  'Beklenmedik bir haber sizi şaşırtabilir.',
  'Sabır ve kararlılık bu dönemin anahtarı.',
]

function getDailyHint(signId: string): string {
  const seed = signId.charCodeAt(0) + new Date().getDate() + new Date().getMonth()
  return THEMES[seed % THEMES.length]!
}

export function HoroscopeMini() {
  const [selected, setSelected] = useState('koc')
  const sign = SIGNS.find((s) => s.id === selected)!
  const hint = getDailyHint(selected)

  return (
    <div className="flex h-full flex-col rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 p-3 text-white">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-purple-200">
          Günlük Burç
        </p>
        <span className="text-xl leading-none">{sign.emoji}</span>
      </div>
      <select
        className="mt-1 bg-white/20 rounded-lg px-2 py-1 text-[12px] font-bold text-white appearance-none outline-none cursor-pointer w-full"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        {SIGNS.map((s) => (
          <option key={s.id} value={s.id} className="text-black bg-white">
            {s.emoji} {s.label}
          </option>
        ))}
      </select>
      <p className="mt-2 text-[11px] leading-snug text-purple-100 line-clamp-3">
        {hint}
      </p>
    </div>
  )
}
