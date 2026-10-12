'use client'

/** Colour-coded share result toast: green = all ok, amber = partial / uncertain, red = failed. */
import toast from 'react-hot-toast'
import { OVERALL_HEADLINE, type ShareOverall } from './shareResultText'

const AMBER = { background: '#FEF3C7', color: '#78350F', border: '1px solid #F59E0B' }

export function showShareToast(overall: ShareOverall, lines: string[], opts: { id?: string | number; style?: Record<string, string | number> } = {}) {
  const text = [OVERALL_HEADLINE[overall], ...lines].join('\n')
  const base = { id: opts.id === undefined ? undefined : String(opts.id), style: opts.style }
  if (overall === 'published') return toast.success(text, { ...base, duration: 10000 })
  if (overall === 'partial' || overall === 'uncertain') return toast(text, { ...base, icon: '⚠️', duration: 15000, style: { ...(opts.style ?? {}), ...AMBER } })
  return toast.error(text, { ...base, duration: 12000 })
}
