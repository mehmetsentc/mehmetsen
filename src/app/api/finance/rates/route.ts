import { NextResponse } from 'next/server'

export const runtime = 'edge'
export const revalidate = 60   // 1 dakika — Yahoo intraday verisi

export interface FinanceRate {
  label: string
  value: number       // display value
  unit: string        // '₺', '$', etc.
  change: number      // % change (pozitif = artış)
  format: 'currency' | 'price'
}

export interface FinanceRates {
  usdTry: FinanceRate
  eurTry: FinanceRate
  goldTryGram: FinanceRate
  btcUsd: FinanceRate
  bist100: FinanceRate
  updatedAt: number
}

interface YahooMeta {
  regularMarketPrice: number
  previousClose: number
  chartPreviousClose?: number
}

/** Yahoo Finance v8 chart endpoint — API key gerektirmez */
async function fetchYahoo(symbol: string): Promise<YahooMeta | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`
  const fallback = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`

  for (const endpoint of [url, fallback]) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NaHaber/1.0)',
          'Accept': 'application/json',
        },
        next: { revalidate: 60 },
      })
      if (!res.ok) continue
      const data = await res.json() as {
        chart: {
          result?: [{ meta: YahooMeta }]
          error?: { message: string }
        }
      }
      const meta = data.chart.result?.[0]?.meta
      if (!meta?.regularMarketPrice) continue
      return {
        regularMarketPrice: meta.regularMarketPrice,
        previousClose: meta.previousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice,
      }
    } catch {
      continue
    }
  }
  return null
}

function pct(now: number, prev: number): number {
  if (!prev || !now) return 0
  return Math.round(((now - prev) / prev) * 10000) / 100
}

export async function GET() {
  try {
    // Paralel fetch — 4 sembol aynı anda
    const [usdTry, eurTry, gold, btc, bist] = await Promise.all([
      fetchYahoo('USDTRY=X'),   // Dolar/TL
      fetchYahoo('EURTRY=X'),   // Euro/TL
      fetchYahoo('GC=F'),       // Altın vadeli (USD/troy oz)
      fetchYahoo('BTC-USD'),    // Bitcoin/USD
      fetchYahoo('XU100.IS'),   // BIST 100
    ])

    const usdVal  = usdTry?.regularMarketPrice ?? 0
    const usdPrev = usdTry?.previousClose      ?? usdVal

    const eurVal  = eurTry?.regularMarketPrice ?? 0
    const eurPrev = eurTry?.previousClose      ?? eurVal

    // Altın: GC=F → USD/troy oz → TL/gram
    const goldOzUsd      = gold?.regularMarketPrice ?? 0
    const goldOzUsdPrev  = gold?.previousClose      ?? goldOzUsd
    const goldGramTry     = goldOzUsd     > 0 && usdVal  > 0 ? (goldOzUsd     / 31.1035) * usdVal  : 0
    const goldGramTryPrev = goldOzUsdPrev > 0 && usdPrev > 0 ? (goldOzUsdPrev / 31.1035) * usdPrev : goldGramTry

    const btcVal  = btc?.regularMarketPrice ?? 0
    const btcPrev = btc?.previousClose      ?? btcVal

    const bistVal  = bist?.regularMarketPrice ?? 0
    const bistPrev = bist?.previousClose      ?? bistVal

    const rates: FinanceRates = {
      usdTry: {
        label:  'Dolar',
        value:  Math.round(usdVal  * 10000) / 10000,
        unit:   '₺',
        change: pct(usdVal,  usdPrev),
        format: 'currency',
      },
      eurTry: {
        label:  'Euro',
        value:  Math.round(eurVal  * 10000) / 10000,
        unit:   '₺',
        change: pct(eurVal,  eurPrev),
        format: 'currency',
      },
      goldTryGram: {
        label:  'Altın',
        value:  Math.round(goldGramTry),
        unit:   '₺',
        change: pct(goldGramTry, goldGramTryPrev),
        format: 'currency',
      },
      btcUsd: {
        label:  'BTC/USD',
        value:  btcVal > 0 ? Math.round(btcVal) : 0,
        unit:   '$',
        change: pct(btcVal, btcPrev),
        format: 'price',
      },
      bist100: {
        label:  'BIST 100',
        value:  Math.round(bistVal * 100) / 100,
        unit:   '',
        change: pct(bistVal, bistPrev),
        format: 'price',
      },
      updatedAt: Date.now(),
    }

    return NextResponse.json(rates, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    })
  } catch (err) {
    console.error('[finance/rates]', err)
    return NextResponse.json({ error: 'Kur verisi alınamadı' }, { status: 502 })
  }
}
