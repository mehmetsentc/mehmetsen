import type { WorkspaceRetention } from '@/media-studio/types'

export function RetentionBadge({ retention }: { retention: WorkspaceRetention }) {
  const saved = retention.mode === 'saved'
  const token = saved ? '--admin-success' : '--admin-warning'
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{
        color: `rgb(var(${token}))`,
        backgroundColor: `color-mix(in srgb, rgb(var(${token})) 16%, transparent)`,
      }}
    >
      {retention.label}
    </span>
  )
}
