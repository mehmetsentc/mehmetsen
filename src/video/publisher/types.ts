/**
 * Future: Library → NaHaber video post.
 * V1A does not publish.
 */
export type VideoLibraryPublishRequest = {
  libraryItemId: string
  createdBy: string
}

export type VideoLibraryPublishResult = {
  libraryItemId: string
  newsId: string
}

export function assertPublishingNotImplemented(): never {
  throw new Error('VIDEO_LIBRARY_PUBLISH_NOT_IMPLEMENTED')
}
