export type MemoryCard = {
  id: number
  emoji: string
  matched: boolean
}

const EMOJI_POOL = [
  '📰', '📺', '🎙️', '📷', '⚽', '🏀', '🎾', '🏁',
  '🌍', '🏛️', '💰', '📚', '🏥', '🎓', '🚗', '✈️',
]

export function createDeck(pairCount = 8): MemoryCard[] {
  const picks = EMOJI_POOL.slice(0, pairCount)
  const cards: MemoryCard[] = []
  picks.forEach((emoji, i) => {
    cards.push({ id: i * 2, emoji, matched: false })
    cards.push({ id: i * 2 + 1, emoji, matched: false })
  })
  // Fisher–Yates
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j]!, cards[i]!]
  }
  return cards
}
