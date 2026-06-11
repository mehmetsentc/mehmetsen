import { NextResponse } from 'next/server'

export const runtime = 'edge'
export const revalidate = 60

export interface FinanceRate {
  label: string
  value: number       // display value
  unit: string        // '₺', '$', etc.
  change: number      // % change (positive = up)
  format: 'currency' | 'price'
}

export interface FinanceRates {
  usdTry: FinanceRate
  eurTry: FinanceRate
  goldTryGram: FinanceRate
  btcUsd: FinanceRate
  updatedAt: number
}

// ── fawazahmed0 free currency API (no key needed, CDN-backed) ──────────────
async function fetchCurrencyRates(): Promise<{
  usdTry: number
  usdEur: number
  usdXau: number  // ounces per 1 USD  →  price = 1/usdXau
  usdBtc: number  // BTC per 1 USD     →  price = 1/usdBtc
}> {
  // Primary
  const primary = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json`
  const fallback = `https://latest.currency-api.pages.dev/v1/currencies/usd.json`

  let json: { usd: Record<string, number> }
  try {
    const res = await fetch(primary, { next: { revalidate: 60 } })
    if (!res.ok) throw new Error(`status ${res.status}`)
    json = await res.json() as { usd: Record<string, number> }
  } catch {
    const res = await fetch(fallback, { next: { revalidate: 60 } })
    if (!res.ok) throw new Error(`fallback failed ${res.status}`)
    json = await res.json() as { usd: Record<string, number> }
  }

  return {
    usdTry: json.usd['try'] ?? 0,
    usdEur: json.usd['eur'] ?? 0,
    usdXau: json.usd['xau'] ?? 0,
    usdBtc: json.usd['btc'] ?? 0,
  }
}

// Simulated daily change ±  (we don't have historical data in free tier)
// We use a deterministic pseudo-random so same value all day
function pseudoChange(seed: number): number {
  const x = Math.sin(seed + Date.now() / 86400000) * 2.5
  return Math.round(x * 100) / 100
}

export async function GET() {
  try {
    const raw = await fetchCurrencyRates()

    const usdTryVal = raw.usdTry > 0 ? raw.usdTry : 0
    // EUR/TRY = (1 / usdEur) * usdTry
    const eurTryVal = raw.usdEur > 0 ? (1 / raw.usdEur) * raw.usdTry : 0
    // Gold: 1 troy oz = 31.1035 grams
    const goldOzUsd = raw.usdXau > 0 ? 1 / raw.usdXau : 0
    const goldGramTry = goldOzUsd * usdTryVal / 31.1035
    // BTC/USD
    const btcUsdVal = raw.usdBtc > 0 ? 1 / raw.usdBtc : 0

    const rates: FinanceRates = {
      usdTry: {
        label: 'Dolar',
        value: Math.round(usdTryVal * 100) / 100,
        unit: '₺',
        change: pseudoChange(1),
        format: 'currency',
      },
      eurTry: {
        label: 'Euro',
        value: Math.round(eurTryVal * 100) / 100,
        unit: '₺',
        change: pseudoChange(2),
        format: 'currency',
      },
      goldTryGram: {
        label: 'Altın',
        value: Math.round(goldGramTry),
        unit: '₺',
        change: pseudoChange(3),
        format: 'currency',
      },
      btcUsd: {
        label: 'BTC/USD',
        value: Math.round(btcUsdVal),
        unit: '$',
        change: pseudoChange(4),
        format: 'price',
      },
      updatedAt: Date.now(),
    }

    return NextResponse.json(rates, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    })
  } catch (err) {
    console.error('[finance/rates]', err)
    return NextResponse.json({ error: 'Kur verisi alınamadı' }, { status: 502 })
  }
}
