import { NextResponse } from 'next/server'

export const runtime = 'edge'
export const revalidate = 300

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
interface CurrencySnapshot {
  usdTry: number
  usdEur: number
  usdXau: number  // ounces per 1 USD  →  price = 1/usdXau
}

async function fetchSnapshot(dateStr: 'latest' | string): Promise<CurrencySnapshot> {
  const base = dateStr === 'latest'
    ? 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json'
    : `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${dateStr}/v1/currencies/usd.json`
  const fallback = dateStr === 'latest'
    ? 'https://latest.currency-api.pages.dev/v1/currencies/usd.json'
    : `https://latest.currency-api.pages.dev/v1/currencies/usd.min.json`

  let json: { usd: Record<string, number> }
  try {
    const res = await fetch(base, { next: { revalidate: 300 } })
    if (!res.ok) throw new Error(`status ${res.status}`)
    json = await res.json() as { usd: Record<string, number> }
  } catch {
    const res = await fetch(fallback, { next: { revalidate: 300 } })
    if (!res.ok) throw new Error(`fallback failed ${res.status}`)
    json = await res.json() as { usd: Record<string, number> }
  }

  return {
    usdTry: json.usd['try'] ?? 0,
    usdEur: json.usd['eur'] ?? 0,
    usdXau: json.usd['xau'] ?? 0,
  }
}

/** dün tarihini YYYY-MM-DD döndürür */
function yesterdayStr(): string {
  const d = new Date(Date.now() - 86400000)
  return d.toISOString().slice(0, 10)
}

function pct(now: number, prev: number): number {
  if (!prev || !now) return 0
  return Math.round(((now - prev) / prev) * 10000) / 100
}

/** CoinGecko (ücretsiz, key yok) — BTC/USD fiyatı + 24s % değişim */
async function fetchBtcChange(): Promise<{ price: number; change24h: number }> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true',
      { next: { revalidate: 300 } }
    )
    if (!res.ok) throw new Error(`coingecko ${res.status}`)
    const data = await res.json() as { bitcoin?: { usd?: number; usd_24h_change?: number } }
    return {
      price:    data.bitcoin?.usd         ?? 0,
      change24h: data.bitcoin?.usd_24h_change ?? 0,
    }
  } catch {
    return { price: 0, change24h: 0 }
  }
}

export async function GET() {
  try {
    const [today, yesterday, btc] = await Promise.all([
      fetchSnapshot('latest'),
      fetchSnapshot(yesterdayStr()),
      fetchBtcChange(),
    ])

    const usdTryVal  = today.usdTry > 0 ? today.usdTry : 0
    const eurTryVal  = today.usdEur > 0 ? (1 / today.usdEur) * today.usdTry : 0
    const goldOzUsd  = today.usdXau > 0 ? 1 / today.usdXau : 0
    const goldGramTry = goldOzUsd * usdTryVal / 31.1035

    // Dünkü değerler (değişim hesabı için)
    const prevUsdTry   = yesterday.usdTry > 0 ? yesterday.usdTry : usdTryVal
    const prevEurTry   = yesterday.usdEur > 0 ? (1 / yesterday.usdEur) * yesterday.usdTry : eurTryVal
    const prevGoldGram = yesterday.usdXau > 0 ? (1 / yesterday.usdXau) * yesterday.usdTry / 31.1035 : goldGramTry

    const rates: FinanceRates = {
      usdTry: {
        label: 'Dolar',
        value: Math.round(usdTryVal * 10000) / 10000,
        unit: '₺',
        change: pct(usdTryVal, prevUsdTry),
        format: 'currency',
      },
      eurTry: {
        label: 'Euro',
        value: Math.round(eurTryVal * 10000) / 10000,
        unit: '₺',
        change: pct(eurTryVal, prevEurTry),
        format: 'currency',
      },
      goldTryGram: {
        label: 'Altın',
        value: Math.round(goldGramTry),
        unit: '₺',
        change: pct(goldGramTry, prevGoldGram),
        format: 'currency',
      },
      btcUsd: {
        label: 'BTC/USD',
        value: btc.price > 0 ? Math.round(btc.price) : 0,
        unit: '$',
        change: Math.round(btc.change24h * 100) / 100,
        format: 'price',
      },
      updatedAt: Date.now(),
    }

    return NextResponse.json(rates, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    })
  } catch (err) {
    console.error('[finance/rates]', err)
    return NextResponse.json({ error: 'Kur verisi alınamadı' }, { status: 502 })
  }
}
