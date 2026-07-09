import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { Collections } from '@/lib/firebase/collections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Thresholds (ms or unitless for CLS)
const THRESHOLDS: Record<string, [number, number]> = {
  FCP:  [1800, 3000],
  LCP:  [2500, 4000],
  INP:  [200,  500],
  TTFB: [800,  1800],
  CLS:  [0.1,  0.25],  // unitless × 1000 stored as int
}

function bucket(name: string, value: number): 'good' | 'ni' | 'poor' {
  const thresholds = THRESHOLDS[name]
  if (!thresholds) return 'good'
  const [good, poor] = thresholds
  // CLS is stored as float × 1000
  const v = name === 'CLS' ? value / 1000 : value
  if (v <= good) return 'good'
  if (v <= poor) return 'ni'
  return 'poor'
}

function sanitizeRoute(rawPath: string): string {
  // 1) Başındaki / kaldır (Firestore'a verilince boş segment oluşturuyor → odd path → hata)
  // 2) Kalan / karakterlerini __ ile değiştir — doc ID içinde / olamaz
  const stripped = rawPath.replace(/^\/+/, '') || 'home'
  return stripped
    .replace(/\//g, '__')
    .replace(/\./g, '_')
    .replace(/\[/g, '')
    .replace(/\]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120)
}

export async function POST(request: Request) {
  try {
    const ua = request.headers.get('user-agent') ?? ''
    if (/bot|crawler|spider/i.test(ua)) return NextResponse.json({ ok: true })

    const body = await request.json() as { name?: string; value?: number; path?: string }
    const { name, value, path } = body
    if (!name || value === undefined || !path) return NextResponse.json({ ok: false }, { status: 400 })

    const validNames = ['FCP', 'LCP', 'INP', 'CLS', 'TTFB']
    if (!validNames.includes(name)) return NextResponse.json({ ok: false }, { status: 400 })

    const b = bucket(name, value)
    const routeKey = sanitizeRoute(path)

    const db = getAdminFirestore()
    const ref = db.collection(Collections.ANALYTICS_VITALS).doc(routeKey)

    await ref.set({
      path,
      [`${name}.${b}`]: FieldValue.increment(1),
      [`${name}.sum`]: FieldValue.increment(value),
      [`${name}.count`]: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[analytics/vitals]', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
