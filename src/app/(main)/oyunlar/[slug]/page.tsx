import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BackgammonClient } from '@/components/games/BackgammonClient'
import { ChessClient } from '@/components/games/ChessClient'
import { SnakeClient } from '@/components/games/SnakeClient'
import { SudokuClient } from '@/components/games/SudokuClient'
import { TetrisClient } from '@/components/games/TetrisClient'
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
    robots: { index: true, follow: true },
  }
}

export default async function GamePlayPage({ params }: Props) {
  const { slug } = await params
  const game = getGameBySlug(slug)
  if (!game || game.provider !== 'native') notFound()

  if (slug === 'tavla') {
    return <BackgammonClient />
  }

  if (slug === 'yilan') {
    return <SnakeClient />
  }

  if (slug === 'satranc') {
    return <ChessClient />
  }

  if (slug === 'sudoku') {
    return <SudokuClient />
  }

  if (slug === 'tetris') {
    return <TetrisClient />
  }

  notFound()
}
