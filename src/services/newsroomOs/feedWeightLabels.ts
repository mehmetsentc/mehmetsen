import type { FeedAlgorithmWeights } from '@/types/newsroomOs'

export type FeedWeightKey = keyof FeedAlgorithmWeights['weights']

export const FEED_WEIGHT_META: Record<
  FeedWeightKey,
  { label: string; description: string; kind: 'score' | 'penalty' }
> = {
  recency: {
    label: 'Güncellik',
    description: 'Yeni yayınlanan haberlere verilen ağırlık.',
    kind: 'score',
  },
  userInterest: {
    label: 'Kullanıcı İlgisi',
    description: 'Kullanıcının daha önce okuduğu konulara yakın haberlere verilen ağırlık.',
    kind: 'score',
  },
  locationAffinity: {
    label: 'Konum Yakınlığı',
    description: 'Kullanıcının takip ettiği veya bulunduğu bölgedeki haberlere verilen ağırlık.',
    kind: 'score',
  },
  categoryAffinity: {
    label: 'Kategori İlgisi',
    description: 'Kullanıcının tercih ettiği kategorilere verilen ağırlık.',
    kind: 'score',
  },
  trend: {
    label: 'Trend',
    description: 'Kısa sürede yükselen haberlere verilen ağırlık.',
    kind: 'score',
  },
  editorialPriority: {
    label: 'Editoryal Öncelik',
    description: 'Editörün öne çıkardığı haberlere verilen ağırlık.',
    kind: 'score',
  },
  sourceReliability: {
    label: 'Kaynak Güvenilirliği',
    description: 'Güvenilir kaynaklardan gelen haberlere verilen ağırlık.',
    kind: 'score',
  },
  contentQuality: {
    label: 'İçerik Kalitesi',
    description: 'Daha tam ve kaliteli içeriklere verilen ağırlık.',
    kind: 'score',
  },
  diversity: {
    label: 'İçerik Çeşitliliği',
    description: 'Feed’de aynı tür haberlerin üst üste yığılmasını azaltır.',
    kind: 'score',
  },
  breakingPriority: {
    label: 'Son Dakika Önceliği',
    description: 'Son dakika haberlerinin feed’de öne çıkma ağırlığı.',
    kind: 'score',
  },
  spamPenalty: {
    label: 'Spam Cezası',
    description: 'Düşük değerli veya spam benzeri içeriğin görünürlüğünü azaltır.',
    kind: 'penalty',
  },
  duplicatePenalty: {
    label: 'Tekrar İçerik Cezası',
    description: 'Aynı veya çok benzer haberlerin feed’de tekrar gösterilmesini azaltır.',
    kind: 'penalty',
  },
}

export function sumFeedWeights(weights: FeedAlgorithmWeights['weights']) {
  let score = 0
  let penalty = 0
  for (const [key, value] of Object.entries(weights) as Array<[FeedWeightKey, number]>) {
    if (FEED_WEIGHT_META[key].kind === 'penalty') penalty += value
    else score += value
  }
  return {
    score: Number(score.toFixed(4)),
    penalty: Number(penalty.toFixed(4)),
    total: Number((score + penalty).toFixed(4)),
    scoreNearOne: Math.abs(score - 1) <= 0.15,
  }
}

export function describeWeightDelta(
  current: FeedAlgorithmWeights['weights'],
  proposed: FeedAlgorithmWeights['weights']
): Array<{ key: FeedWeightKey; from: number; to: number; delta: number }> {
  return (Object.keys(current) as FeedWeightKey[])
    .map((key) => ({
      key,
      from: current[key],
      to: proposed[key],
      delta: Number((proposed[key] - current[key]).toFixed(4)),
    }))
    .filter((row) => row.delta !== 0)
}
