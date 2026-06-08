'use client'

import { useCallback, useRef, useState } from 'react'
import { useDropzone, type Accept, type FileRejection } from 'react-dropzone'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import { storageService } from '@/services/storageService'
import { postService } from '@/services/postService'

export interface MediaUploadState {
  uploading: boolean
  progress: number
  thumbnail: string
  videoUrl: string
  draftId: string | null
  error?: string
}

interface MediaUploaderProps {
  onFilesChange: (files: File[]) => void
  mode?: 'news' | 'video' | 'photo'
  maxFiles?: number
  userId?: string
  authorUsername?: string
  autoUploadDraft?: boolean
  draftId?: string | null
  onDraftId?: (id: string) => void
  onUploadStateChange?: (state: MediaUploadState) => void
}

const MAX_FILE_SIZE = 50 * 1024 * 1024

export function MediaUploader({
  onFilesChange,
  mode = 'news',
  maxFiles = 10,
  userId,
  authorUsername,
  autoUploadDraft = false,
  draftId,
  onDraftId,
  onUploadStateChange,
}: MediaUploaderProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploadState, setUploadState] = useState<MediaUploadState>({
    uploading: false,
    progress: 0,
    thumbnail: '',
    videoUrl: '',
    draftId: draftId ?? null,
  })
  const uploadingRef = useRef(false)

  const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  const allowedVideoTypes = ['video/mp4', 'video/webm']

  const accept: Accept =
    mode === 'video'
      ? { 'video/*': ['.mp4', '.webm'] }
      : mode === 'photo'
        ? { 'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp'] }
        : {
            'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp'],
            'video/*': ['.mp4', '.webm'],
          }

  const patchUploadState = useCallback(
    (patch: Partial<MediaUploadState>) => {
      setUploadState((prev) => {
        const next = { ...prev, ...patch }
        onUploadStateChange?.(next)
        return next
      })
    },
    [onUploadStateChange]
  )

  const uploadAsDraft = useCallback(
    async (files: File[]) => {
      if (!autoUploadDraft || !userId || !authorUsername || files.length === 0) return
      if (uploadingRef.current) return

      uploadingRef.current = true
      patchUploadState({ uploading: true, progress: 0, error: undefined })

      try {
        let currentDraftId = draftId ?? uploadState.draftId
        if (!currentDraftId) {
          currentDraftId = await postService.createDraftNews({
            author: authorUsername,
            authorId: userId,
            type: mode === 'video' ? 'video' : mode === 'photo' ? 'photo' : 'news',
          })
          onDraftId?.(currentDraftId)
          patchUploadState({ draftId: currentDraftId })
        }

        let thumbnail = uploadState.thumbnail
        let videoUrl = uploadState.videoUrl

        for (const file of files) {
          if (file.type.startsWith('video/')) {
            videoUrl = await storageService.uploadPostVideo(file, userId, currentDraftId, (percent) => {
              patchUploadState({ progress: percent })
            })
          } else if (file.type.startsWith('image/')) {
            const url = await storageService.uploadPostImage(file, userId, currentDraftId, (percent) => {
              patchUploadState({ progress: percent })
            })
            if (!thumbnail) thumbnail = url
          }
        }

        await postService.updateDraftNews(currentDraftId, { thumbnail, videoUrl })

        patchUploadState({
          uploading: false,
          progress: 100,
          thumbnail,
          videoUrl,
          draftId: currentDraftId,
        })
        toast.success('Medya yüklendi — taslak kaydedildi')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Yükleme başarısız'
        patchUploadState({ uploading: false, error: message })
        toast.error(message)
      } finally {
        uploadingRef.current = false
      }
    },
    [
      autoUploadDraft,
      userId,
      authorUsername,
      draftId,
      uploadState.draftId,
      uploadState.thumbnail,
      uploadState.videoUrl,
      mode,
      onDraftId,
      patchUploadState,
    ]
  )

  const updateFiles = useCallback(
    (files: File[]) => {
      setSelectedFiles(files)
      onFilesChange(files)
    },
    [onFilesChange]
  )

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (rejectedFiles.length > 0) {
        rejectedFiles.forEach((file) => {
          const errors = file.errors.map((e) => e.code).join(', ')
          toast.error(`${file.file.name}: ${errors}`)
        })
      }

      const validFiles = acceptedFiles.filter((file) => {
        const isImage = allowedImageTypes.includes(file.type)
        const isVideo = allowedVideoTypes.includes(file.type)

        if (mode === 'video' && !isVideo) {
          toast.error(`${file.name}: Yalnızca video dosyası yükleyebilirsiniz`)
          return false
        }
        if (mode === 'photo' && !isImage) {
          toast.error(`${file.name}: Yalnızca görsel dosyası yükleyebilirsiniz`)
          return false
        }
        if (!isImage && !isVideo) {
          toast.error(`${file.name}: Geçersiz dosya türü`)
          return false
        }
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`${file.name}: Dosya boyutu 50MB'ı aşıyor`)
          return false
        }
        return true
      })

      if (selectedFiles.length + validFiles.length > maxFiles) {
        toast.error(`Maksimum ${maxFiles} dosya seçebilirsiniz`)
        return
      }

      const next = [...selectedFiles, ...validFiles]
      updateFiles(next)

      if (validFiles.length > 0 && autoUploadDraft) {
        if (!userId || !authorUsername) {
          toast.error('Taslak yüklemek için giriş yapın')
          return
        }
        void uploadAsDraft(validFiles)
      }
    },
    [
      allowedImageTypes,
      allowedVideoTypes,
      autoUploadDraft,
      maxFiles,
      mode,
      selectedFiles,
      updateFiles,
      uploadAsDraft,
    ]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles,
    maxSize: MAX_FILE_SIZE,
    disabled: uploadState.uploading,
  })

  const removeFile = (index: number) => {
    updateFiles(selectedFiles.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          isDragActive
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
            : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] hover:border-[rgb(var(--color-muted))]'
        } ${uploadState.uploading ? 'pointer-events-none opacity-70' : ''}`}
      >
        <input {...getInputProps()} />
        {uploadState.uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600 dark:text-blue-400" />
            <p className="font-medium text-[rgb(var(--color-text))]">
              Taslak olarak yükleniyor… %{Math.round(uploadState.progress)}
            </p>
            <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-[rgb(var(--color-border))]">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${uploadState.progress}%` }}
              />
            </div>
          </div>
        ) : isDragActive ? (
          <p className="font-medium text-blue-600 dark:text-blue-400">Dosyaları buraya bırakın...</p>
        ) : (
          <>
            <p className="font-medium text-[rgb(var(--color-text))]">
              Dosyaları buraya sürükleyip bırakın veya seçmek için tıklayın
            </p>
            <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
              {mode === 'video'
                ? 'MP4, WebM • Seçince taslak olarak yüklenir'
                : mode === 'photo'
                  ? 'JPG, PNG, GIF, WebP • Seçince taslak olarak yüklenir'
                  : 'Görsel veya video • Maksimum 50MB'}
            </p>
          </>
        )}
      </div>

      {uploadState.draftId && !uploadState.uploading && (
        <p className="text-sm text-green-600 dark:text-green-400">
          Taslak kaydedildi — formu doldurup paylaşabilirsiniz
        </p>
      )}

      {uploadState.error && (
        <p className="text-sm text-red-600">{uploadState.error}</p>
      )}

      {selectedFiles.length > 0 && (
        <div>
          <p className="mb-2 font-medium text-[rgb(var(--color-text))]">
            Seçilen Dosyalar ({selectedFiles.length})
          </p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {selectedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="relative rounded-lg bg-[rgb(var(--color-surface))] p-2"
              >
                {file.type.startsWith('image') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="h-24 w-full rounded object-cover"
                  />
                ) : (
                  <div className="flex h-24 items-center justify-center rounded bg-[rgb(var(--color-border))]">
                    <span className="text-sm text-[rgb(var(--color-muted))]">Video</span>
                  </div>
                )}
                {!uploadState.uploading && (
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="absolute right-1 top-1 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                  >
                    ✕
                  </button>
                )}
                <p className="mt-1 truncate text-xs text-[rgb(var(--color-muted))]">{file.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
