/** Her oyun için çok sade, ilk kez oynayanlara yönelik kurallar. */

export type GameRules = {
  slug: string
  title: string
  /** Tek cümle: oyun ne ister? */
  goal: string
  /** Nasıl oynanır — kısa maddeler */
  how: string[]
  /** Kazanma / bitiş */
  win: string
  /** Sıralamada ne sayılır */
  ranking: string
  /** score: yüksek iyi · time: düşük süre iyi · wins: galibiyet */
  metric: 'score' | 'time' | 'wins'
}

export const GAME_RULES: Record<string, GameRules> = {
  '2048': {
    slug: '2048',
    title: '2048',
    goal: 'Aynı sayılı kutuları birleştirip hedef sayıya ulaş.',
    how: [
      'Kutuları kaydır: ok tuşları veya parmağınla kaydır.',
      'İki aynı sayı çarpışınca birleşir (2+2=4, 4+4=8…).',
      'Her hareketten sonra yeni bir 2 (bazen 4) gelir.',
    ],
    win: 'Hedef taşa (ör. 256 / 512 / 2048) ulaşınca seviyeyi kazanırsın. Tahta dolup hareket kalmazsa oyun biter.',
    ranking: 'En yüksek skor sıralamada üstte.',
    metric: 'score',
  },
  mayin: {
    slug: 'mayin',
    title: 'Mayın Tarlası',
    goal: 'Mayınlara basmadan tüm güvenli kareleri aç.',
    how: [
      'Bir kareye dokunarak aç.',
      'Sayı, etrafındaki mayın sayısını gösterir.',
      'Mayın sandığın yere bayrak koy (sağ tık veya Bayrak modu).',
    ],
    win: 'Mayın olmayan tüm kareler açılınca kazanırsın. Mayına basarsan kaybedersin.',
    ranking: 'En hızlı bitirme süresi üstte.',
    metric: 'time',
  },
  sudoku: {
    slug: 'sudoku',
    title: 'Sudoku',
    goal: 'Her satır, sütun ve 3×3 kutuda 1–9 rakamları birer kez olsun.',
    how: [
      'Boş bir kareye dokun, altta rakam seç.',
      'Yanlış yerde kırmızı uyarı çıkar.',
      'İstersen “Not” ile küçük ipucu rakamlar yaz.',
    ],
    win: 'Tüm kareler doğru dolunca kazanırsın.',
    ranking: 'En hızlı bitirme süresi üstte.',
    metric: 'time',
  },
  yilan: {
    slug: 'yilan',
    title: 'Neon Yılan',
    goal: 'Yılanı büyüt, duvara veya kendine çarpmadan skor topla.',
    how: [
      'Ok tuşları veya kaydırarak yön ver.',
      'Yemi ye — yılan uzar, skor artar.',
      'Duvara veya kuyruğa çarpma.',
    ],
    win: 'Seviye hedef skoruna ulaşınca sonraki seviye açılır.',
    ranking: 'En yüksek skor üstte.',
    metric: 'score',
  },
  tetris: {
    slug: 'tetris',
    title: 'Neon Tetris',
    goal: 'Düşen blokları yerleştirip dolu satırları temizle.',
    how: [
      'Blokları kaydır / döndür (oklar veya dokunuş).',
      'Bir satır tamamen dolunca silinir ve puan gelir.',
      'Bloklar üstte birikirse oyun biter.',
    ],
    win: 'Seviye satır hedefine ulaşınca ilerlersin.',
    ranking: 'En yüksek skor üstte.',
    metric: 'score',
  },
  kelime: {
    slug: 'kelime',
    title: 'Kelime Günü',
    goal: 'Gizli 5 harfli Türkçe kelimeyi sınırlı denemede bul.',
    how: [
      'Klavyeden 5 harfli bir kelime yaz, gönder.',
      'Yeşil: doğru yer · Sarı: kelimede var ama yeri yanlış · Gri: yok.',
      'Renklere bakarak bir sonraki tahminini yap.',
    ],
    win: 'Kelimeyi bulunca kazanırsın; hakların bitince kaybedersin.',
    ranking: 'Kazanma sayısı üstte.',
    metric: 'wins',
  },
  'adam-asmaca': {
    slug: 'adam-asmaca',
    title: 'Adam Asmaca',
    goal: 'Gizli kelimenin harflerini, canın bitmeden tahmin et.',
    how: [
      'Harf seç. Doğruysa kelimede açılır.',
      'Yanlışsa bir can gider.',
      'Kategori seçerek kelime türünü daraltabilirsin.',
    ],
    win: 'Kelime tamamlanınca kazanırsın; can bitince kaybedersin.',
    ranking: 'Kazanma sayısı üstte.',
    metric: 'wins',
  },
  hafiza: {
    slug: 'hafiza',
    title: 'Hafıza',
    goal: 'Aynı resimli kart çiftlerini bul.',
    how: [
      'Bir karta dokun, sonra ikinciyi aç.',
      'Aynıysa açık kalır; değilse kapanır.',
      'Hepsini eşleştirene kadar devam et.',
    ],
    win: 'Tüm çiftler bulununca kazanırsın.',
    ranking: 'En hızlı bitirme süresi üstte.',
    metric: 'time',
  },
  satranc: {
    slug: 'satranc',
    title: 'Satranç',
    goal: 'Rakip şahı mat et (kaçacak yeri kalmasın).',
    how: [
      'Kendi taşını seç, gidebileceği kareye dokun.',
      'Tek kişide sen beyazsın; bilgisayar siyah oynar.',
      'İki kişide sırayla aynı cihazda oynarsınız.',
    ],
    win: 'Rakip şah mat olunca kazanırsın. Pat olursa berabere.',
    ranking: 'Galibiyet sayısı üstte.',
    metric: 'wins',
  },
  tavla: {
    slug: 'tavla',
    title: 'Tavla',
    goal: 'Tüm taşlarını zarla ilerletip evine taşı ve dışarı çıkar.',
    how: [
      'Zar at, taşını geçerli bir noktaya taşı.',
      'Tek taşlı noktaya gelince rakibi kırabilirsin.',
      'Tüm taşlar evdeyken dışarı çıkararak bitir.',
    ],
    win: 'Tüm taşlarını çıkaran kazanır.',
    ranking: 'Galibiyet sayısı üstte.',
    metric: 'wins',
  },
}

export function getGameRules(slug: string): GameRules | null {
  return GAME_RULES[slug] ?? null
}

export function rulesSeenKey(slug: string, userId: string): string {
  return `nahaber_game_rules_seen_${userId}_${slug}`
}
