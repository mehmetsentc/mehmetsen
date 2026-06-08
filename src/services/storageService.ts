import { ref, uploadBytes, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { storage, StoragePaths } from '@/lib/firebase/storage'

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function buildFileName(file: File): string {
  return `${Date.now()}_${sanitizeFileName(file.name)}`
}

async function uploadToPath(
  file: File,
  path: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  const storageRef = ref(storage, path)

  if (onProgress) {
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type })
    return new Promise((resolve, reject) => {
      task.on(
        'state_changed',
        (snapshot) => {
          const percent = (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          onProgress(percent)
        },
        reject,
        async () => resolve(getDownloadURL(task.snapshot.ref))
      )
    })
  }

  const snapshot = await uploadBytes(storageRef, file, { contentType: file.type })
  return getDownloadURL(snapshot.ref)
}

export const storageService = {
  async uploadPostImage(
    file: File,
    userId: string,
    postId: string,
    onProgress?: (percent: number) => void
  ): Promise<string> {
    const path = StoragePaths.POST_MEDIA(userId, postId, buildFileName(file))
    return uploadToPath(file, path, onProgress)
  },

  async uploadPostVideo(
    file: File,
    userId: string,
    postId: string,
    onProgress?: (percent: number) => void
  ): Promise<string> {
    const path = StoragePaths.POST_MEDIA(userId, postId, buildFileName(file))
    return uploadToPath(file, path, onProgress)
  },

  async uploadEventImage(
    file: File,
    eventId: string,
    onProgress?: (percent: number) => void
  ): Promise<string> {
    const path = StoragePaths.EVENT_IMAGE(eventId, buildFileName(file))
    return uploadToPath(file, path, onProgress)
  },

  /** @deprecated Use uploadPostImage — kept for call sites migrating to post-scoped paths. */
  async uploadNewsImage(
    file: File,
    userId: string,
    postId: string,
    onProgress?: (percent: number) => void
  ): Promise<string> {
    return this.uploadPostImage(file, userId, postId, onProgress)
  },

  /** @deprecated Use uploadPostVideo — kept for call sites migrating to post-scoped paths. */
  async uploadNewsVideo(
    file: File,
    userId: string,
    postId: string,
    onProgress?: (percent: number) => void
  ): Promise<string> {
    return this.uploadPostVideo(file, userId, postId, onProgress)
  },

  async uploadAvatar(
    file: File,
    userId: string,
    onProgress?: (percent: number) => void
  ): Promise<string> {
    const path = StoragePaths.AVATAR(userId, buildFileName(file))
    return uploadToPath(file, path, onProgress)
  },
}
