import type { MediaItem } from '@/types/post'

/**
 * Haber sayfasında medya yerleşimini hesaplar.
 *
 * Kurallar (kullanıcı talebi):
 *   • Eğer en az bir VIDEO varsa: ilk video hero alır (en üstte). Geri kalan
 *     görseller paragraf araları arasına dağıtılır. (Birden fazla video
 *     pratikte ender — yine de hero=ilk video.)
 *   • Eğer video yoksa ve TEK görsel varsa: o görsel hero olur, inline
 *     görsel yoktur.
 *   • Eğer video yoksa ve BİRDEN FAZLA görsel varsa: ilk görsel hero,
 *     kalan görseller paragraflar arasına eşit aralıkla dağıtılır.
 *     (AI sıralama Admin tarafında zaten yapıldı; render-time sadece
 *     dağılımı belirler.)
 *
 * Çıktı: `paragraphs` listesinin nereye (hangi index'ten SONRA) hangi
 * `MediaItem`'ın yerleştirileceğini gösteren `Map<number, MediaItem>`.
 * Anahtar 0 ise: 1. paragraftan SONRA. -1 ise paragraflardan ÖNCE
 * (kullanılmıyor — hero ayrı render edilir).
 */
export interface MediaPlacement {
  hero: MediaItem | null
  /** Her paragraf index'i için (anahtar = paragraf index), o paragraftan SONRA gelecek görsel. */
  inlineAfter: Map<number, MediaItem>
  /** Hero ve inline'lara giremeyen kalan görseller (en sona galeri olarak basılır). */
  trailing: MediaItem[]
}

export function planMediaPlacement(
  rawMedia: readonly MediaItem[] | undefined,
  paragraphCount: number
): MediaPlacement {
  if (!rawMedia || rawMedia.length === 0) {
    return { hero: null, inlineAfter: new Map(), trailing: [] }
  }

  // Sırala: önce explicit order, sonra mevcut array sırası.
  const ordered = [...rawMedia]
    .map((m, i) => ({ m, order: typeof m.order === 'number' ? m.order : i, idx: i }))
    .sort((a, b) => a.order - b.order || a.idx - b.idx)
    .map((x) => x.m)

  const firstVideo = ordered.find((m) => m.type === 'video')
  const hero: MediaItem | null = firstVideo ?? ordered.find((m) => m.type === 'image') ?? ordered[0] ?? null

  // Hero hariç inline'a girecek olan görseller (yalnızca image)
  const remaining = ordered.filter(
    (m) => m !== hero && m.type === 'image' && m.url.trim()
  )

  const inlineAfter = new Map<number, MediaItem>()
  const trailing: MediaItem[] = []

  if (remaining.length === 0 || paragraphCount === 0) {
    return { hero, inlineAfter, trailing: remaining }
  }

  // N adet görseli P+1 dilime böl → her dilim sonunda bir görsel
  // Dilim boyutu = P / (N+1) → görsel pozisyonu k * (P / (N+1)) − 1
  // (paragraf index 0-based; o paragraftan SONRA yerleştirilir)
  //
  // Örnek: P=10 paragraf, N=3 görsel → dilim ≈ 2.5
  //   k=1 → index ≈ 1.5 → round down → 1 (2. paragraftan sonra)
  //   k=2 → index ≈ 4.0 → 4 (5. paragraftan sonra)
  //   k=3 → index ≈ 6.5 → 6 (7. paragraftan sonra)
  //
  // Pozisyon çakışırsa bir sonraki uygun paragrafa kaydır; yer kalmazsa
  // kalanları trailing'e at.
  const usedIndexes = new Set<number>()
  const step = paragraphCount / (remaining.length + 1)

  for (let k = 0; k < remaining.length; k++) {
    const ideal = Math.max(0, Math.min(paragraphCount - 1, Math.floor((k + 1) * step) - 1))
    let target = ideal
    while (usedIndexes.has(target) && target < paragraphCount - 1) target++
    if (usedIndexes.has(target)) {
      // Tüm hedefler dolu — kalan kuyruğa
      trailing.push(remaining[k])
      continue
    }
    usedIndexes.add(target)
    inlineAfter.set(target, remaining[k])
  }

  return { hero, inlineAfter, trailing }
}
