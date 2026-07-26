import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getGameRules } from '@/constants/gameRules'
import {
  gameScoreDocId,
  timeToSortValue,
  type GameScoreMetric,
} from '@/lib/games/scores'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/games/scores?game=2048&limit=10
 * Public leaderboard (top N by sortValue).
 *
 * POST /api/games/scores
 * Body: { gameSlug, value, won?: boolean, username?, displayName? }
 * Auth required. Upserts best score for the member.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const gameSlug = (searchParams.get('game') ?? '').trim()
  const limit = Math.min(25, Math.max(1, Number(searchParams.get('limit') ?? 10) || 10))

  if (!gameSlug || !getGameRules(gameSlug)) {
    return NextResponse.json({ error: 'Geçersiz oyun' }, { status: 400 })
  }

  try {
    const db = getAdminFirestore()
    const snap = await db
      .collection(Collections.GAME_SCORES)
      .where('gameSlug', '==', gameSlug)
      .orderBy('sortValue', 'desc')
      .limit(limit)
      .get()

    const leaders = snap.docs.map((doc, i) => {
      const d = doc.data()
      return {
        rank: i + 1,
        userId: String(d.userId ?? ''),
        username: String(d.username ?? ''),
        displayName: String(d.displayName ?? d.username ?? 'Oyuncu'),
        metric: d.metric as GameScoreMetric,
        displayValue: Number(d.displayValue ?? 0),
        sortValue: Number(d.sortValue ?? 0),
        wins: Number(d.wins ?? 0),
      }
    })

    return NextResponse.json({ leaders })
  } catch (err) {
    console.error('[games/scores] GET failed:', err)
    return NextResponse.json({ error: 'Sıralama alınamadı' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await verifyFirebaseIdToken(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    gameSlug?: string
    value?: number
    won?: boolean
    username?: string
    displayName?: string
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
  }

  const gameSlug = (body.gameSlug ?? '').trim()
  const rules = getGameRules(gameSlug)
  if (!rules) return NextResponse.json({ error: 'Geçersiz oyun' }, { status: 400 })

  const rawValue = Number(body.value)
  if (!Number.isFinite(rawValue) || rawValue < 0) {
    return NextResponse.json({ error: 'Geçersiz skor' }, { status: 400 })
  }

  const metric = rules.metric
  const displayValue = Math.round(rawValue)
  const sortValue =
    metric === 'time'
      ? timeToSortValue(displayValue)
      : metric === 'wins'
        ? Math.max(1, displayValue)
        : displayValue

  const won = Boolean(body.won)
  const username = String(body.username ?? '').trim().slice(0, 40) || 'oyuncu'
  const displayName =
    String(body.displayName ?? '').trim().slice(0, 60) || username

  const db = getAdminFirestore()
  const docId = gameScoreDocId(gameSlug, auth.uid)
  const ref = db.collection(Collections.GAME_SCORES).doc(docId)

  try {
    // Enrich username from user profile when possible
    let finalUsername = username
    let finalDisplay = displayName
    try {
      const userSnap = await db.collection(Collections.USERS).doc(auth.uid).get()
      if (userSnap.exists) {
        const u = userSnap.data() ?? {}
        if (typeof u.username === 'string' && u.username.trim()) {
          finalUsername = u.username.trim().slice(0, 40)
        }
        if (typeof u.displayName === 'string' && u.displayName.trim()) {
          finalDisplay = u.displayName.trim().slice(0, 60)
        } else if (typeof u.name === 'string' && u.name.trim()) {
          finalDisplay = u.name.trim().slice(0, 60)
        }
      }
    } catch {
      /* profile optional */
    }

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const prev = snap.exists ? snap.data()! : null
      const prevSort = Number(prev?.sortValue ?? 0)
      const prevDisplay = Number(prev?.displayValue ?? 0)
      const prevWins = Number(prev?.wins ?? 0)
      const prevPlays = Number(prev?.plays ?? 0)

      let nextSort = prevSort
      let nextDisplay = prevDisplay
      let nextWins = prevWins

      if (metric === 'wins') {
        nextWins = Math.max(prevWins + (won ? 1 : 0), displayValue || 0)
        nextSort = nextWins
        nextDisplay = nextWins
      } else if (metric === 'time') {
        if (!prev || sortValue > prevSort) {
          nextSort = sortValue
          nextDisplay = displayValue
        }
        if (won) nextWins = prevWins + 1
      } else {
        // score — yüksek iyi
        if (!prev || sortValue > prevSort) {
          nextSort = sortValue
          nextDisplay = displayValue
        }
        if (won) nextWins = prevWins + 1
      }

      tx.set(
        ref,
        {
          gameSlug,
          userId: auth.uid,
          username: finalUsername,
          displayName: finalDisplay,
          metric,
          sortValue: nextSort,
          displayValue: nextDisplay,
          lastValue: displayValue,
          plays: prevPlays + 1,
          wins: nextWins,
          updatedAt: Date.now(),
          updatedAtServer: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    })

    const updated = await ref.get()
    const data = updated.data()!
    return NextResponse.json({
      ok: true,
      best: {
        displayValue: Number(data.displayValue ?? 0),
        sortValue: Number(data.sortValue ?? 0),
        wins: Number(data.wins ?? 0),
        plays: Number(data.plays ?? 0),
        metric,
      },
    })
  } catch (err) {
    console.error('[games/scores] POST failed:', err)
    return NextResponse.json({ error: 'Skor kaydedilemedi' }, { status: 500 })
  }
}
