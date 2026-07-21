export type GameProvider = 'native' | 'external'

export type GameCategory = 'masa' | 'bulmaca' | 'arcade' | 'spor'

export interface GameCatalogItem {
  slug: string
  title: string
  description: string
  provider: GameProvider
  category: GameCategory
  /** Yerel route veya harici embed (ileride) */
  playHref: string
  thumbnailEmoji: string
  featured?: boolean
  ageRating: '3+' | '7+' | '12+'
  tags: string[]
}
