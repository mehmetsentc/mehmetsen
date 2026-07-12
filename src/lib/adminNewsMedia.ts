export interface EditorAdditionalImage {
  url: string
  caption?: string
}

export interface EditorMediaItem {
  type: 'image' | 'video'
  url: string
  thumbnailUrl: string | null
  caption: string | null
  alt?: string | null
  order: number
}

export function sanitizeAdditionalImages(
  images?: EditorAdditionalImage[]
): EditorAdditionalImage[] {
  if (!Array.isArray(images)) return []
  return images
    .filter((img) => img?.url?.trim())
    .map((img) => ({
      url: img.url.trim(),
      caption: img.caption?.trim() ?? '',
    }))
}

/** Admin editöründen gelen medyayı Firestore mediaItems şemasına çevirir. */
export function buildEditorMediaItems(input: {
  thumbnail?: string
  thumbnailCaption?: string
  videoUrl?: string
  additionalImages?: EditorAdditionalImage[]
}): EditorMediaItem[] {
  const items: EditorMediaItem[] = []
  const thumb = input.thumbnail?.trim() ?? ''
  const video = input.videoUrl?.trim() ?? ''
  const thumbCaption = input.thumbnailCaption?.trim() ?? ''
  let order = 0

  if (video) {
    items.push({
      type: 'video',
      url: video,
      thumbnailUrl: thumb || null,
      caption: null,
      order: order++,
    })
  }

  if (thumb) {
    items.push({
      type: 'image',
      url: thumb,
      thumbnailUrl: thumb,
      caption: thumbCaption || null,
      alt: thumbCaption || null,
      order: order++,
    })
  }

  for (const img of sanitizeAdditionalImages(input.additionalImages)) {
    if (img.url === thumb) continue
    const caption = img.caption || null
    items.push({
      type: 'image',
      url: img.url,
      thumbnailUrl: img.url,
      caption,
      alt: caption,
      order: order++,
    })
  }

  return items
}
