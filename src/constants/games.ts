import { ROUTES } from '@/constants/routes'
import type { GameCatalogItem } from '@/types/game'

export const NAHABER_GAMES: GameCatalogItem[] = [
  {
    slug: 'tavla',
    title: 'Tavla',
    description:
      'Klasik tavla — bilgisayara karşı tek kişi veya aynı cihazda iki oyuncu. Zar at, taşlarını eve taşı.',
    provider: 'native',
    category: 'masa',
    playHref: ROUTES.GAME('tavla'),
    thumbnailEmoji: '🎲',
    featured: true,
    ageRating: '7+',
    tags: ['tavla', 'masa oyunu', 'zar', 'iki oyuncu'],
  },
  {
    slug: 'yilan',
    title: 'Neon Yılan',
    description:
      'Renkli arcade yılan — kolay, orta ve zor seviyede skorunu yükselt. Ok tuşları veya kaydır.',
    provider: 'native',
    category: 'arcade',
    playHref: ROUTES.GAME('yilan'),
    thumbnailEmoji: '🐍',
    featured: true,
    ageRating: '3+',
    tags: ['yılan', 'snake', 'arcade', 'skor'],
  },
  {
    slug: 'satranc',
    title: 'Satranç',
    description:
      'Klasik satranç — bilgisayara karşı veya aynı cihazda iki kişi. Rok, geçerken alma ve terfi dahil.',
    provider: 'native',
    category: 'masa',
    playHref: ROUTES.GAME('satranc'),
    thumbnailEmoji: '♟️',
    featured: true,
    ageRating: '7+',
    tags: ['satranç', 'chess', 'masa oyunu', 'strateji'],
  },
  {
    slug: 'sudoku',
    title: 'Sudoku',
    description:
      'Klasik 9×9 sudoku — kolay, orta ve zor. Online oyna, ipucu al, not tut, süreyi yen.',
    provider: 'native',
    category: 'bulmaca',
    playHref: ROUTES.GAME('sudoku'),
    thumbnailEmoji: '9️⃣',
    featured: true,
    ageRating: '7+',
    tags: ['sudoku', 'bulmaca', 'sayı', 'zeka'],
  },
  {
    slug: 'tetris',
    title: 'Neon Tetris',
    description:
      'Modern blok düşürme — kolay, orta ve zor temposunda skor kır. Ghost, tut ve 7-bag sistemi.',
    provider: 'native',
    category: 'arcade',
    playHref: ROUTES.GAME('tetris'),
    thumbnailEmoji: '🧱',
    featured: true,
    ageRating: '3+',
    tags: ['tetris', 'arcade', 'blok', 'skor'],
  },
  {
    slug: 'kelime',
    title: 'Kelime Günü',
    description:
      'Gazete klasik bulmacası — 5 harfli Türkçe kelimeyi 6 denemede bul. Harf renkleri ipucu verir.',
    provider: 'native',
    category: 'bulmaca',
    playHref: ROUTES.GAME('kelime'),
    thumbnailEmoji: '🔤',
    featured: true,
    ageRating: '7+',
    tags: ['kelime', 'wordle', 'bulmaca', 'türkçe'],
  },
  {
    slug: 'adam-asmaca',
    title: 'Adam Asmaca',
    description:
      'Harf harf tahmin et — klasik gazete molası. Kategorili Türkçe kelimeler, sınırlı can.',
    provider: 'native',
    category: 'bulmaca',
    playHref: ROUTES.GAME('adam-asmaca'),
    thumbnailEmoji: '🪢',
    featured: true,
    ageRating: '7+',
    tags: ['adam asmaca', 'hangman', 'kelime', 'bulmaca'],
  },
  {
    slug: 'hafiza',
    title: 'Hafıza',
    description:
      'Eşleşen kartları bul — konsantrasyon ve kısa mola için ideal gazete oyunu.',
    provider: 'native',
    category: 'bulmaca',
    playHref: ROUTES.GAME('hafiza'),
    thumbnailEmoji: '🃏',
    featured: true,
    ageRating: '3+',
    tags: ['hafıza', 'memory', 'kart', 'eşleştirme'],
  },
  {
    slug: 'mayin',
    title: 'Mayın Tarlası',
    description:
      'Klasik mayın tarlası — kolay, orta, zor. Sayı ipuçlarıyla güvenli alanı aç.',
    provider: 'native',
    category: 'bulmaca',
    playHref: ROUTES.GAME('mayin'),
    thumbnailEmoji: '💣',
    featured: true,
    ageRating: '7+',
    tags: ['mayın', 'minesweeper', 'bulmaca', 'zeka'],
  },
  {
    slug: '2048',
    title: '2048',
    description:
      'Aynı sayıları birleştir, 2048’e ulaş — kaydır, planla, skorunu yükselt.',
    provider: 'native',
    category: 'bulmaca',
    playHref: ROUTES.GAME('2048'),
    thumbnailEmoji: '🔢',
    featured: true,
    ageRating: '3+',
    tags: ['2048', 'sayı', 'bulmaca', 'kaydır'],
  },
]

export function getGameBySlug(slug: string): GameCatalogItem | undefined {
  return NAHABER_GAMES.find((g) => g.slug === slug)
}
