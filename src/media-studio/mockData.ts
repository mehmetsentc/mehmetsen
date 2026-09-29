/**
 * PHASE 1 development fixtures.
 * These records are local UI state. They do not represent downloads,
 * storage objects, or database rows.
 */
import type {
  AnalysisItem,
  AssetAvailability,
  AssetChoice,
  LibraryItem,
  StudioJob,
  StudioSettingsPreview,
  Workspace,
  WorkspaceText,
} from './types'

const ASSET_LABEL: Record<AssetChoice, string> = {
  video: 'Video',
  description: 'Açıklama',
  images: 'Görseller',
  thumbnail: 'Thumbnail',
  metadata: 'Metadata',
  subtitle: 'Altyazı',
  audio: 'Ses',
}

function assets(flags: Partial<Record<AssetChoice, string | false>>): AssetAvailability[] {
  const order: AssetChoice[] = ['video', 'description', 'images', 'thumbnail', 'metadata', 'subtitle', 'audio']
  return order.map((key) => {
    const value = flags[key]
    const available = Boolean(value)
    return {
      key,
      label: ASSET_LABEL[key],
      available,
      detail: typeof value === 'string' ? value : undefined,
    }
  })
}

function defaultSelected(list: AssetAvailability[]): AssetChoice[] {
  return list
    .filter((asset) => asset.available && asset.key !== 'subtitle' && asset.key !== 'audio')
    .map((asset) => asset.key)
}

export function withDefaultSelection(item: Omit<AnalysisItem, 'mock'>): AnalysisItem {
  return { ...item, mock: true }
}

function textBlock(input: Partial<WorkspaceText> & Pick<WorkspaceText, 'title' | 'originalUrl' | 'source'>): WorkspaceText {
  return {
    title: input.title,
    description: input.description ?? '',
    caption: input.caption ?? '',
    tags: input.tags ?? '',
    notes: input.notes ?? '',
    source: input.source,
    originalUrl: input.originalUrl,
  }
}

const galleryAssets = assets({
  video: '1080p',
  description: 'Açıklama',
  images: '6 görsel',
  thumbnail: 'Thumbnail',
  metadata: 'Metadata',
  subtitle: 'Türkçe',
  audio: false,
})

const shortAssets = assets({
  video: '720p',
  description: false,
  images: false,
  thumbnail: 'Thumbnail',
  metadata: 'Metadata',
  subtitle: false,
  audio: false,
})

const photoAssets = assets({
  video: false,
  description: 'Açıklama',
  images: '4 görsel',
  thumbnail: false,
  metadata: 'Metadata',
  subtitle: false,
  audio: false,
})

const metaAssets = assets({
  video: false,
  description: false,
  images: false,
  thumbnail: false,
  metadata: 'Metadata',
  subtitle: false,
  audio: false,
})

export const SAMPLE_IMPORT_TEXT = [
  'https://example.com/content/video-gallery',
  'https://example.com/content/video-short',
  'https://example.com/content/photo-story',
  'https://example.com/content/metadata-only',
  'https://example.com/content/broken',
  'https://example.com/content/pending',
].join('\n')

export const ANALYSIS_FIXTURES: Record<string, Omit<AnalysisItem, 'id' | 'url' | 'mock'>> = {
  'https://example.com/content/video-gallery': {
    status: 'READY',
    title: 'Sahil yürüyüşü ve akşam pazarı',
    source: 'Example',
    durationLabel: '03:42',
    qualityLabel: '1080p',
    summary: ['Video', '1080p', '03:42', '6 Görsel', 'Açıklama', 'Thumbnail', 'Metadata'],
    assets: galleryAssets,
    thumbHue: 198,
  },
  'https://example.com/content/video-short': {
    status: 'READY',
    title: 'Kısa liman kaydı',
    source: 'Example',
    durationLabel: '00:28',
    qualityLabel: '720p',
    summary: ['Video', '720p', 'Thumbnail'],
    assets: shortAssets,
    thumbHue: 262,
  },
  'https://example.com/content/photo-story': {
    status: 'READY',
    title: 'Pazar tezgâhları',
    source: 'Example Foto',
    durationLabel: null,
    qualityLabel: null,
    summary: ['4 Görsel', 'Açıklama', 'Metadata'],
    assets: photoAssets,
    thumbHue: 28,
  },
  'https://example.com/content/metadata-only': {
    status: 'READY',
    title: 'Platform kaydı',
    source: 'Metadata',
    durationLabel: null,
    qualityLabel: null,
    summary: ['Metadata'],
    assets: metaAssets,
    thumbHue: 220,
  },
  'https://example.com/content/broken': {
    status: 'FAILED',
    title: 'Bağlantı çözümlenemedi',
    source: 'Example',
    durationLabel: null,
    qualityLabel: null,
    summary: [],
    assets: assets({}),
    errorTitle: 'Video kaynağı analiz edilemedi.',
    errorDetail: 'Kaynak sayfa medya listesi döndürmedi. (mock: ANALYZE_EMPTY)',
    thumbHue: 0,
  },
  'https://example.com/content/pending': {
    status: 'ANALYZING',
    title: 'Analiz sürüyor',
    source: 'Example',
    durationLabel: null,
    qualityLabel: null,
    summary: [],
    assets: assets({}),
    thumbHue: 210,
  },
}

export function fixtureForUrl(url: string, index: number): Omit<AnalysisItem, 'id' | 'url' | 'mock'> {
  const known = ANALYSIS_FIXTURES[url]
  if (known) return known
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '')
    } catch {
      return 'Kaynak'
    }
  })()
  const fallback = [galleryAssets, shortAssets, photoAssets][index % 3]
  const summary = fallback.filter((asset) => asset.available).map((asset) => asset.detail || asset.label)
  return {
    status: 'READY',
    title: `${host} içeriği`,
    source: host,
    durationLabel: fallback === galleryAssets ? '02:10' : fallback === shortAssets ? '00:41' : null,
    qualityLabel: fallback === galleryAssets ? '1080p' : fallback === shortAssets ? '720p' : null,
    summary,
    assets: fallback,
    thumbHue: (index * 47) % 360,
  }
}

export function selectedAssetsFor(item: Omit<AnalysisItem, 'mock'>): AssetChoice[] {
  return defaultSelected(item.assets)
}

export const MOCK_JOBS: StudioJob[] = [
  {
    id: 'job_downloading',
    title: 'Sahil yürüyüşü ve akşam pazarı',
    source: 'Example',
    status: 'DOWNLOADING',
    createdLabel: '2 dk önce',
    sizeLabel: '182 MB',
    thumbHue: 198,
    workspaceId: null,
    progress: {
      percent: 68,
      loadedLabel: '124 MB',
      totalLabel: '182 MB',
      speedLabel: '8.4 MB/s',
      etaLabel: '00:07 kaldı',
    },
    stageLabel: 'Video indiriliyor',
    mediaLabel: 'Video · MP4 · 1080p',
    mock: true,
  },
  {
    id: 'job_queued',
    title: 'Kısa liman kaydı',
    source: 'Example',
    status: 'QUEUED',
    createdLabel: '4 dk önce',
    sizeLabel: '—',
    thumbHue: 262,
    workspaceId: null,
    progress: null,
    stageLabel: 'Sırada',
    mock: true,
  },
  {
    id: 'job_processing',
    title: 'Pazar tezgâhları',
    source: 'Example Foto',
    status: 'PROCESSING',
    createdLabel: '6 dk önce',
    sizeLabel: '18 MB',
    thumbHue: 28,
    workspaceId: null,
    progress: null,
    stageLabel: 'Görseller hazırlanıyor',
    mock: true,
  },
  {
    id: 'job_completed',
    title: 'Troya kıyısı',
    source: 'Example',
    status: 'COMPLETED',
    createdLabel: 'Bugün 09:40',
    sizeLabel: '246 MB',
    thumbHue: 168,
    workspaceId: 'ws_troya',
    progress: { percent: 100, loadedLabel: '246 MB', totalLabel: '246 MB', speedLabel: '', etaLabel: '' },
    resultLabel: 'Video · 6 Görsel · Açıklama',
    mock: true,
  },
  {
    id: 'job_completed_pazar',
    title: 'Pazar tezgâhları',
    source: 'Example Foto',
    status: 'COMPLETED',
    createdLabel: 'Bugün 08:15',
    sizeLabel: '18 MB',
    thumbHue: 28,
    workspaceId: 'ws_pazar',
    progress: null,
    resultLabel: '6 Görsel · Açıklama',
    mock: true,
  },
  {
    id: 'job_completed_handoff',
    title: 'NaHaber taslağına hazır',
    source: 'Example',
    status: 'COMPLETED',
    createdLabel: 'Dün 18:20',
    sizeLabel: '96 MB',
    thumbHue: 330,
    workspaceId: 'ws_handoff',
    progress: null,
    resultLabel: 'Video · Açıklama',
    mock: true,
  },
  {
    id: 'job_completed_draft',
    title: 'Taslak stüdyo notu',
    source: 'Example',
    status: 'COMPLETED',
    createdLabel: 'Dün 11:05',
    sizeLabel: '4 MB',
    thumbHue: 250,
    workspaceId: 'ws_draft',
    progress: null,
    resultLabel: 'Görseller · Metin',
    mock: true,
  },
  {
    id: 'job_failed',
    title: 'Kapalı arşiv kaydı',
    source: 'Example',
    status: 'FAILED',
    createdLabel: 'Dün',
    sizeLabel: '—',
    thumbHue: 350,
    workspaceId: null,
    progress: null,
    errorTitle: 'Video kaynağı analiz edilemedi.',
    errorDetail: 'Kaynak yanıtı medya adresi içermiyor. (mock: SOURCE_UNAVAILABLE)',
    mock: true,
  },
  {
    id: 'job_cancelled',
    title: 'Yarım kalan prova',
    source: 'Example',
    status: 'CANCELLED',
    createdLabel: 'Dün',
    sizeLabel: '40 MB',
    thumbHue: 120,
    workspaceId: null,
    progress: { percent: 22, loadedLabel: '40 MB', totalLabel: '180 MB', speedLabel: '', etaLabel: '' },
    mock: true,
  },
  {
    id: 'job_failed_images',
    title: 'Galeri zaman aşımı',
    source: 'Example Foto',
    status: 'FAILED',
    createdLabel: '2 gün önce',
    sizeLabel: '—',
    thumbHue: 12,
    workspaceId: 'ws_draft',
    progress: null,
    errorTitle: 'Görseller alınamadı.',
    errorDetail: 'Görsel adresleri süre aşımına uğradı. (mock: IMAGE_TIMEOUT)',
    mock: true,
  },
]

const troyaText = textBlock({
  title: 'Troya kıyısı',
  description: 'Akşam ışığında kıyı şeridi ve uzaktaki feribot. Orijinal açıklama kaynak sayfadan alındı.',
  caption: 'Kıyı, feribot ve akşam ışığı.',
  tags: 'çanakkale, kıyı, troya',
  notes: '',
  source: 'Example',
  originalUrl: 'https://example.com/content/troya-shore',
})

const pazarText = textBlock({
  title: 'Pazar tezgâhları',
  description: 'Sabah pazarı, tezgâhlar ve yerel ürünler.',
  caption: 'Tezgâh detayı.',
  tags: 'pazar, yerel',
  notes: 'Kapak ikinci kare olsun.',
  source: 'Example Foto',
  originalUrl: 'https://example.com/content/photo-story',
})

function images(prefix: string, count: number, hue: number): Workspace['images'] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}_${index + 1}`,
    filename: `${String(index + 1).padStart(2, '0')}.${index % 4 === 3 ? 'png' : 'jpg'}`,
    width: 1600,
    height: index % 2 === 0 ? 1066 : 1200,
    sizeLabel: `${1.2 + index * 0.3}`.slice(0, 3) + ' MB',
    format: index % 4 === 3 ? 'PNG' : 'JPEG',
    cover: index === 0,
    hue: (hue + index * 18) % 360,
  }))
}

export const MOCK_WORKSPACES: Workspace[] = [
  {
    id: 'ws_troya',
    title: 'Troya kıyısı',
    source: 'Example',
    originalUrl: 'https://example.com/content/troya-shore',
    importedLabel: 'Bugün 09:40',
    sizeLabel: '246 MB',
    retention: { mode: 'temporary', label: '18 saat sonra otomatik silinecek' },
    status: 'COMPLETED',
    thumbHue: 168,
    video: {
      filename: 'video.mp4',
      resolution: '1920×1080',
      duration: '03:42',
      format: 'MP4',
      sizeLabel: '228 MB',
    },
    images: images('troya', 6, 168),
    originalText: troyaText,
    editedText: { ...troyaText },
    savedText: { ...troyaText },
    files: [
      { id: 'f1', name: 'video.mp4', type: 'Video', sizeLabel: '228 MB', modifiedLabel: 'Bugün 09:41', depth: 0 },
      { id: 'f2', name: 'description.txt', type: 'Metin', sizeLabel: '2 KB', modifiedLabel: 'Bugün 09:41', depth: 0 },
      { id: 'f3', name: 'metadata.json', type: 'JSON', sizeLabel: '6 KB', modifiedLabel: 'Bugün 09:41', depth: 0 },
      { id: 'f4', name: 'thumbnail.jpg', type: 'JPEG', sizeLabel: '180 KB', modifiedLabel: 'Bugün 09:41', depth: 0 },
      { id: 'f5', name: 'images/', type: 'Klasör', sizeLabel: '—', modifiedLabel: 'Bugün 09:41', depth: 0 },
      { id: 'f6', name: '01.jpg', type: 'JPEG', sizeLabel: '1.2 MB', modifiedLabel: 'Bugün 09:41', depth: 1 },
      { id: 'f7', name: '02.jpg', type: 'JPEG', sizeLabel: '1.5 MB', modifiedLabel: 'Bugün 09:41', depth: 1 },
      { id: 'f8', name: '03.png', type: 'PNG', sizeLabel: '2.1 MB', modifiedLabel: 'Bugün 09:41', depth: 1 },
    ],
    mock: true,
  },
  {
    id: 'ws_pazar',
    title: 'Pazar tezgâhları',
    source: 'Example Foto',
    originalUrl: 'https://example.com/content/photo-story',
    importedLabel: 'Bugün 11:05',
    sizeLabel: '18 MB',
    retention: { mode: 'temporary', label: '6 saat sonra otomatik silinecek' },
    status: 'COMPLETED',
    thumbHue: 28,
    video: null,
    images: images('pazar', 4, 28),
    originalText: pazarText,
    editedText: { ...pazarText },
    savedText: { ...pazarText },
    files: [
      { id: 'p1', name: 'description.txt', type: 'Metin', sizeLabel: '1 KB', modifiedLabel: 'Bugün 11:06', depth: 0 },
      { id: 'p2', name: 'metadata.json', type: 'JSON', sizeLabel: '4 KB', modifiedLabel: 'Bugün 11:06', depth: 0 },
      { id: 'p3', name: 'images/', type: 'Klasör', sizeLabel: '—', modifiedLabel: 'Bugün 11:06', depth: 0 },
      { id: 'p4', name: '01.jpg', type: 'JPEG', sizeLabel: '1.4 MB', modifiedLabel: 'Bugün 11:06', depth: 1 },
    ],
    mock: true,
  },
  {
    id: 'ws_draft',
    title: 'Taslak stüdyo notu',
    source: 'Example',
    originalUrl: 'https://example.com/content/draft-note',
    importedLabel: 'Dün 18:12',
    sizeLabel: '4 MB',
    retention: { mode: 'saved', label: 'Kalıcı olarak saklanıyor' },
    status: 'PARTIAL',
    thumbHue: 250,
    video: null,
    images: images('draft', 1, 250),
    originalText: textBlock({
      title: 'Taslak stüdyo notu',
      description: 'Henüz tamamlanmamış metin.',
      source: 'Example',
      originalUrl: 'https://example.com/content/draft-note',
    }),
    editedText: textBlock({
      title: 'Taslak stüdyo notu',
      description: 'Henüz tamamlanmamış metin.',
      source: 'Example',
      originalUrl: 'https://example.com/content/draft-note',
    }),
    savedText: textBlock({
      title: 'Taslak stüdyo notu',
      description: 'Henüz tamamlanmamış metin.',
      source: 'Example',
      originalUrl: 'https://example.com/content/draft-note',
    }),
    files: [
      { id: 'd1', name: 'metadata.json', type: 'JSON', sizeLabel: '2 KB', modifiedLabel: 'Dün', depth: 0 },
    ],
    mock: true,
  },
  {
    id: 'ws_handoff',
    title: 'NaHaber taslağına hazır',
    source: 'Example',
    originalUrl: 'https://example.com/content/handoff',
    importedLabel: '3 gün önce',
    sizeLabel: '96 MB',
    retention: { mode: 'temporary', label: '4 saat sonra otomatik silinecek' },
    status: 'COMPLETED',
    thumbHue: 330,
    video: {
      filename: 'video.mp4',
      resolution: '1280×720',
      duration: '01:12',
      format: 'MP4',
      sizeLabel: '90 MB',
    },
    images: images('hand', 2, 330),
    originalText: textBlock({
      title: 'NaHaber taslağına hazır',
      description: 'Editöre aktarılmayı bekleyen açıklama.',
      tags: 'yerel',
      source: 'Example',
      originalUrl: 'https://example.com/content/handoff',
    }),
    editedText: textBlock({
      title: 'NaHaber taslağına hazır',
      description: 'Editöre aktarılmayı bekleyen açıklama.',
      tags: 'yerel',
      source: 'Example',
      originalUrl: 'https://example.com/content/handoff',
    }),
    savedText: textBlock({
      title: 'NaHaber taslağına hazır',
      description: 'Editöre aktarılmayı bekleyen açıklama.',
      tags: 'yerel',
      source: 'Example',
      originalUrl: 'https://example.com/content/handoff',
    }),
    files: [
      { id: 'h1', name: 'video.mp4', type: 'Video', sizeLabel: '90 MB', modifiedLabel: '3 gün önce', depth: 0 },
      { id: 'h2', name: 'thumbnail.jpg', type: 'JPEG', sizeLabel: '140 KB', modifiedLabel: '3 gün önce', depth: 0 },
    ],
    mock: true,
  },
]

export const MOCK_LIBRARY: LibraryItem[] = [
  {
    id: 'lib_troya',
    workspaceId: 'ws_troya',
    title: 'Troya kıyısı',
    source: 'Example',
    mediaCount: 8,
    sizeBytes: 246_000_000,
    sizeLabel: '246 MB',
    createdLabel: 'Bugün 09:40',
    createdAt: 1_700_000_004,
    retentionLabel: '18 saat',
    status: 'COMPLETED',
    flags: ['today', 'video', 'images', 'expiring'],
    thumbHue: 168,
    mock: true,
  },
  {
    id: 'lib_pazar',
    workspaceId: 'ws_pazar',
    title: 'Pazar tezgâhları',
    source: 'Example Foto',
    mediaCount: 4,
    sizeBytes: 18_000_000,
    sizeLabel: '18 MB',
    createdLabel: 'Bugün 11:05',
    createdAt: 1_700_000_005,
    retentionLabel: '6 saat',
    status: 'COMPLETED',
    flags: ['today', 'images', 'expiring'],
    thumbHue: 28,
    mock: true,
  },
  {
    id: 'lib_draft',
    workspaceId: 'ws_draft',
    title: 'Taslak stüdyo notu',
    source: 'Example',
    mediaCount: 1,
    sizeBytes: 4_000_000,
    sizeLabel: '4 MB',
    createdLabel: 'Dün 18:12',
    createdAt: 1_700_000_002,
    retentionLabel: 'Saklanıyor',
    status: 'PARTIAL',
    flags: ['images', 'draft', 'saved'],
    thumbHue: 250,
    mock: true,
  },
  {
    id: 'lib_handoff',
    workspaceId: 'ws_handoff',
    title: 'NaHaber taslağına hazır',
    source: 'Example',
    mediaCount: 3,
    sizeBytes: 96_000_000,
    sizeLabel: '96 MB',
    createdLabel: '3 gün önce',
    createdAt: 1_700_000_001,
    retentionLabel: '4 saat',
    status: 'COMPLETED',
    flags: ['video', 'imported', 'expiring'],
    thumbHue: 330,
    mock: true,
  },
]

export const MOCK_SETTINGS: StudioSettingsPreview = {
  mock: true,
  concurrentDownloads: 3,
  defaultQuality: 'En uygun kalite',
  temporaryHours: 24,
  quota: { usedLabel: '3.4 GB', capLabel: '5 GB', usedRatio: 0.68 },
  includeVideo: true,
  includeImages: true,
  includeMetadata: true,
  autoRetry: true,
  zipRetentionHours: 1,
}

export const MOCK_QUOTA = MOCK_SETTINGS.quota

/** Human-review fixture: video + description + thumbnail + images. */
export const REVIEW_GALLERY_URL = 'https://example.com/content/video-gallery'

const BATCH_DONE = [
  'Troya kıyısı',
  'Pazar tezgâhları',
  'Liman akşamı',
  'Kale içi',
  'Feribot kalkışı',
  'Çarşı yürüyüşü',
  'Sahil kahvesi',
]

const BATCH_ACTIVE: StudioJob[] = [
  {
    id: 'batch_active_68',
    title: 'Sahil yürüyüşü ve akşam pazarı',
    source: 'Example',
    status: 'DOWNLOADING',
    createdLabel: 'şimdi',
    sizeLabel: '182 MB',
    thumbHue: 198,
    workspaceId: null,
    progress: {
      percent: 68,
      loadedLabel: '124 MB',
      totalLabel: '182 MB',
      speedLabel: '8.4 MB/s',
      etaLabel: '00:07 kaldı',
    },
    stageLabel: 'Video indiriliyor',
    mediaLabel: 'Video · MP4 · 1080p',
    mock: true,
  },
  {
    id: 'batch_active_44',
    title: 'Kısa liman kaydı',
    source: 'Example',
    status: 'DOWNLOADING',
    createdLabel: 'şimdi',
    sizeLabel: '64 MB',
    thumbHue: 262,
    workspaceId: null,
    progress: {
      percent: 44,
      loadedLabel: '28 MB',
      totalLabel: '64 MB',
      speedLabel: '3.1 MB/s',
      etaLabel: '00:12 kaldı',
    },
    stageLabel: 'Video indiriliyor',
    mediaLabel: 'Video · MP4 · 720p',
    mock: true,
  },
  {
    id: 'batch_active_18',
    title: 'Kale surları',
    source: 'Example',
    status: 'DOWNLOADING',
    createdLabel: 'şimdi',
    sizeLabel: '51 MB',
    thumbHue: 28,
    workspaceId: null,
    progress: {
      percent: 18,
      loadedLabel: '9 MB',
      totalLabel: '51 MB',
      speedLabel: '1.6 MB/s',
      etaLabel: '00:26 kaldı',
    },
    stageLabel: 'Video indiriliyor',
    mediaLabel: 'Video · MP4 · 1080p',
    mock: true,
  },
]

const BATCH_WAITING = [
  'Akşam vapuru',
  'Çarşı girişi',
  'Sahil yolu',
  'Müze avlusu',
  'Balık hali',
  'Kent suru',
  'İskele kalabalığı',
  'Tepe manzarası',
  'Pazar kapanışı',
  'Gece feribotu',
]

/** 7 tamamlandı, 3 aktif, 10 bekleyen. Genel ilerleme 7/20 = %35. Mock only. */
export function reviewBatchJobs(): StudioJob[] {
  const done: StudioJob[] = BATCH_DONE.map((title, index) => ({
    id: `batch_done_${index + 1}`,
    title,
    source: 'Example',
    status: 'COMPLETED',
    createdLabel: 'bugün',
    sizeLabel: '—',
    thumbHue: 140 + index * 18,
    workspaceId: 'ws_troya',
    progress: { percent: 100, loadedLabel: '', totalLabel: '', speedLabel: '', etaLabel: '' },
    resultLabel: index === 0 ? 'Video · 6 Görsel · Açıklama' : 'Video · Görseller',
    mock: true,
  }))
  const waiting: StudioJob[] = BATCH_WAITING.map((title, index) => ({
    id: `batch_wait_${index + 1}`,
    title,
    source: 'Example',
    status: 'QUEUED',
    createdLabel: 'şimdi',
    sizeLabel: '—',
    thumbHue: 200 + index * 8,
    workspaceId: null,
    progress: null,
    stageLabel: 'Sırada',
    mock: true,
  }))
  return [...BATCH_ACTIVE, done[0], ...waiting, ...done.slice(1)]
}
