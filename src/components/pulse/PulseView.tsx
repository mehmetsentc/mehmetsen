'use client'

/**
 * Visual Pulse shell. No hardcoded source counts.
 * Enabled only when a real topic list is passed.
 */
export type PulseTopic = {
  id: string
  label: string
  count?: number
  href?: string
}

const POSITIONS = [
  { top: '32%', left: '38%', size: '7.6rem', color: '#f43f5e' },
  { top: '18%', left: '12%', size: '5.4rem', color: '#38bdf8' },
  { top: '16%', left: '64%', size: '5.1rem', color: '#fbbf24' },
  { top: '58%', left: '14%', size: '5.6rem', color: '#a78bfa' },
  { top: '60%', left: '62%', size: '5.2rem', color: '#34d399' },
]

export function PulseView({
  topics,
  enabled,
}: {
  topics: PulseTopic[]
  enabled: boolean
}) {
  if (!enabled) {
    return (
      <section className="px-4 py-6" data-testid="nahaber-pulse" data-pulse-enabled="0">
        <h2 className="text-2xl font-extrabold text-white">NaHaber Pulse</h2>
        <p className="mt-1 text-sm text-[rgb(var(--nah-text-muted))]">
          Şu anda ne konuşuluyor? Bu görünüm güvenilir küme verisi hazır olunca açılır.
        </p>
      </section>
    )
  }

  const visible = topics.filter((topic) => topic.label.trim()).slice(0, 5)

  return (
    <section className="px-4 py-4" data-testid="nahaber-pulse" data-pulse-enabled="1">
      <h2 className="text-2xl font-extrabold text-white">NaHaber Pulse</h2>
      <p className="mt-1 text-sm text-[rgb(var(--nah-text-muted))]">Şu anda ne konuşuluyor?</p>
      <div className="nah-pulse-board mt-4">
        {visible.map((topic, index) => {
          const pos = POSITIONS[index] ?? POSITIONS[0]!
          return (
            <div
              key={topic.id}
              className="nah-pulse-bubble"
              style={{
                top: pos.top,
                left: pos.left,
                width: pos.size,
                height: pos.size,
                color: pos.color,
              }}
            >
              <span className="px-2 text-[12px] font-extrabold leading-tight text-white">{topic.label}</span>
              {typeof topic.count === 'number' ? (
                <span className="mt-1 text-[10px] font-bold text-white/70">{topic.count} kaynak</span>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
