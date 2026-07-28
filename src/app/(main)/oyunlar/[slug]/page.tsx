import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BackgammonClient } from '@/components/games/BackgammonClient'
import { ChessClient } from '@/components/games/ChessClient'
import { GameAuthGate } from '@/components/games/GameAuthGate'
import { HangmanClient } from '@/components/games/HangmanClient'
import { KelimeClient } from '@/components/games/KelimeClient'
import { MemoryClient } from '@/components/games/MemoryClient'
import { MinesClient } from '@/components/games/MinesClient'
import { SnakeClient } from '@/components/games/SnakeClient'
import { SudokuClient } from '@/components/games/SudokuClient'
import { TetrisClient } from '@/components/games/TetrisClient'
import { Twenty48Client } from '@/components/games/Twenty48Client'
import { getGameBySlug } from '@/constants/games'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const game = getGameBySlug(slug)
  if (!game) return { title: 'Oyun' }
  return {
    title: game.title,
    description: game.description,
    alternates: { canonical: `${getSiteUrl()}${ROUTES.GAME(slug)}` },
    robots: { index: false, follow: false },
  }
}

function gameClient(slug: string) {
  switch (slug) {
    case 'tavla':
      return <BackgammonClient />
    case 'yilan':
      return <SnakeClient />
    case 'satranc':
      return <ChessClient />
    case 'sudoku':
      return <SudokuClient />
    case 'tetris':
      return <TetrisClient />
    case 'kelime':
      return <KelimeClient />
    case 'adam-asmaca':
      return <HangmanClient />
    case 'hafiza':
      return <MemoryClient />
    case 'mayin':
      return <MinesClient />
    case '2048':
      return <Twenty48Client />
    default:
      return null
  }
}

export default async function GamePlayPage({ params }: Props) {
  const { slug } = await params
  const game = getGameBySlug(slug)
  if (!game || game.provider !== 'native') notFound()

  const client = gameClient(slug)
  if (!client) notFound()

  return <GameAuthGate gameSlug={slug}>{client}</GameAuthGate>
}
