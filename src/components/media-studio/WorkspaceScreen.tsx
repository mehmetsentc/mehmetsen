'use client'

import { useState } from 'react'
import type { WorkspaceTab } from '@/media-studio/types'
import { WORKSPACE_TABS } from '@/media-studio/types'
import { isWorkspaceDirty } from '@/media-studio/session'
import {
  clearWorkspaceImages,
  deleteSelectedImages,
  deleteWorkspaceImage,
  deleteWorkspaceFile,
  deleteWorkspaceVideo,
  findWorkspace,
  keepWorkspace,
  patchWorkspaceText,
  previewAction,
  renameWorkspaceFile,
  renameWorkspaceImage,
  renameWorkspaceVideo,
  saveWorkspaceText,
  setCoverImage,
  toggleWorkspaceImage,
  updateStudioSession,
} from '@/media-studio/session'
import { useStudio } from '@/media-studio/useStudio'
import { focusRing } from './styles'
import { MediaThumb } from './MediaThumb'
import { EmptyState } from './EmptyState'
import { FileManager } from './FileManager'
import { ImageManager } from './ImageManager'
import { MetadataEditor } from './MetadataEditor'
import { StudioSkeleton } from './StudioSkeleton'
import { useStudioReveal } from './useStudioReveal'
import { VideoPanel } from './VideoPanel'
import { WorkspaceHeader } from './WorkspaceHeader'

const PREVIEW = 'Önizleme: dosya henüz oluşturulmadı.'

export function WorkspaceScreen({ id, initialTab = 'general' }: { id: string; initialTab?: WorkspaceTab }) {
  const session = useStudio()
  const ready = useStudioReveal()
  const workspace = findWorkspace(session, id)
  const [tab, setTab] = useState<WorkspaceTab>(initialTab)
  const [pendingTab, setPendingTab] = useState<WorkspaceTab | null>(null)

  if (!ready) return <StudioSkeleton rows={2} />
  if (!workspace) {
    return (
      <EmptyState
        title="Çalışma alanı bulunamadı."
        body="Bu kayıt önizleme verisinde yok."
        actionHref="/admin/media-studio/library"
        actionLabel="Kütüphaneye dön"
      />
    )
  }

  const dirty = isWorkspaceDirty(workspace)
  const requestTab = (next: WorkspaceTab) => {
    if (tab === 'text' && dirty && next !== 'text') {
      setPendingTab(next)
      return
    }
    setTab(next)
  }

  return (
    <div className="space-y-5 pb-10">
      <WorkspaceHeader
        workspace={workspace}
        onEdit={() => requestTab('text')}
        onDownloadAll={() => updateStudioSession((current) => previewAction(current, PREVIEW))}
        onZip={() => updateStudioSession((current) => previewAction(current, 'Önizleme: ZIP henüz oluşturulmadı.'))}
        onHandoff={() =>
          updateStudioSession((current) =>
            previewAction(current, 'Önizleme: haber editörüne aktarım bir sonraki fazda açılacak. Yayın yok.')
          )
        }
        onDelete={() => updateStudioSession((current) => previewAction(current, 'Önizleme: çalışma alanı silinmedi.'))}
        onKeep={() => updateStudioSession((current) => keepWorkspace(current, workspace.id))}
      />
      <div className="flex gap-5 overflow-x-auto border-b border-[rgb(var(--color-border))]" role="tablist" aria-label="Çalışma alanı">
        {WORKSPACE_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`shrink-0 border-b-2 pb-2 text-sm font-medium ${focusRing} ${
              tab === item.id
                ? 'border-[rgb(var(--color-text))] text-[rgb(var(--color-text))]'
                : 'border-transparent text-[rgb(var(--color-muted))]'
            }`}
            onClick={() => requestTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {pendingTab ? (
        <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4 text-sm">
          <p className="font-medium text-[rgb(var(--color-text))]">Kaydedilmemiş değişiklikler var.</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-xl bg-[rgb(var(--color-brand))] px-3 py-2 font-semibold text-white"
              onClick={() => {
                updateStudioSession((current) => saveWorkspaceText(current, workspace.id))
                setTab(pendingTab)
                setPendingTab(null)
              }}
            >
              Kaydet
            </button>
            <button
              type="button"
              className="rounded-xl border border-[rgb(var(--color-border))] px-3 py-2"
              onClick={() => {
                setTab(pendingTab)
                setPendingTab(null)
              }}
            >
              Yine de geç
            </button>
          </div>
        </div>
      ) : null}
      {tab === 'general' ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,360px)]">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-[rgb(var(--color-text))]">Görseller</h3>
              <button type="button" className="text-sm font-medium text-[rgb(var(--color-text))]" onClick={() => requestTab('images')}>
                Tümü
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {workspace.images.slice(0, 6).map((image) => (
                <button key={image.id} type="button" className="block" onClick={() => requestTab('images')} aria-label={image.filename}>
                  <MediaThumb hue={image.hue} className="aspect-[4/3] w-full rounded-lg" label="" />
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm text-[rgb(var(--color-text))]/75">
              {workspace.video ? `${workspace.video.resolution} · ${workspace.video.format}` : 'Video yok'} · {workspace.images.length} görsel · {workspace.files.length} dosya
            </p>
          </section>
          <section className="rounded-2xl bg-[rgb(var(--color-surface))] p-4">
            <h3 className="text-sm font-semibold text-[rgb(var(--color-text))]">Metin</h3>
            <p className="mt-2 line-clamp-4 text-sm leading-6 text-[rgb(var(--color-text))]">{workspace.editedText.description}</p>
            <button type="button" className="mt-4 text-sm font-semibold text-[rgb(var(--color-text))]" onClick={() => requestTab('text')}>
              Metni aç
            </button>
          </section>
        </div>
      ) : null}
      {tab === 'video' ? (
        <VideoPanel
          video={workspace.video}
          hue={workspace.thumbHue}
          onDownload={() => updateStudioSession((current) => previewAction(current, PREVIEW))}
          onRename={(filename) => updateStudioSession((current) => renameWorkspaceVideo(current, workspace.id, filename))}
          onDelete={() => updateStudioSession((current) => deleteWorkspaceVideo(current, workspace.id))}
        />
      ) : null}
      {tab === 'images' ? (
        <ImageManager
          images={workspace.images}
          selectedIds={session.imageSelection[workspace.id] ?? []}
          onToggle={(imageId) => updateStudioSession((current) => toggleWorkspaceImage(current, workspace.id, imageId))}
          onClear={() => updateStudioSession((current) => clearWorkspaceImages(current, workspace.id))}
          onDeleteSelected={() => updateStudioSession((current) => deleteSelectedImages(current, workspace.id))}
          onDownloadSelected={() => updateStudioSession((current) => previewAction(current, PREVIEW))}
          onDownloadOne={() => updateStudioSession((current) => previewAction(current, PREVIEW))}
          onRename={(imageId, filename) =>
            updateStudioSession((current) => renameWorkspaceImage(current, workspace.id, imageId, filename))
          }
          onCover={(imageId) => updateStudioSession((current) => setCoverImage(current, workspace.id, imageId))}
          onDeleteOne={(imageId) => updateStudioSession((current) => deleteWorkspaceImage(current, workspace.id, imageId))}
        />
      ) : null}
      {tab === 'text' ? (
        <MetadataEditor
          original={workspace.originalText}
          edited={workspace.editedText}
          saved={workspace.savedText}
          onChange={(key, value) => updateStudioSession((current) => patchWorkspaceText(current, workspace.id, key, value))}
          onSave={() => updateStudioSession((current) => saveWorkspaceText(current, workspace.id))}
        />
      ) : null}
      {tab === 'files' ? (
        <FileManager
          files={workspace.files}
          onDownload={() => updateStudioSession((current) => previewAction(current, PREVIEW))}
          onRename={(fileId, name) => updateStudioSession((current) => renameWorkspaceFile(current, workspace.id, fileId, name))}
          onDelete={(fileId) => updateStudioSession((current) => deleteWorkspaceFile(current, workspace.id, fileId))}
        />
      ) : null}
    </div>
  )
}

