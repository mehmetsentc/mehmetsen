import { MOCK_SETTINGS } from '@/media-studio/mockData'

export function SettingsScreen() {
  const settings = MOCK_SETTINGS
  return (
    <div className="grid gap-4 pb-10 lg:grid-cols-2">
      <div
        className="rounded-2xl border px-4 py-3 text-sm lg:col-span-2"
        style={{
          borderColor: 'rgb(var(--admin-warning))',
          backgroundColor: 'color-mix(in srgb, rgb(var(--admin-warning)) 12%, transparent)',
          color: 'rgb(var(--admin-text))',
        }}
      >
        Önizleme. Bu ayarlar henüz kaydedilmez ve indirilen dosyayı etkilemez.
      </div>
      <Section title="İndirmeler">
        <Row label="Eşzamanlı indirme" value={String(settings.concurrentDownloads)} />
        <Row label="Varsayılan kalite" value={settings.defaultQuality} />
      </Section>
      <Section title="Depolama">
        <Row label="Geçici saklama süresi" value={`${settings.temporaryHours} saat`} />
        <Row label="Kota" value={`${settings.quota.usedLabel} / ${settings.quota.capLabel}`} />
      </Section>
      <Section title="Dosyalar">
        <Row label="Video" value={settings.includeVideo ? 'Dahil' : 'Kapalı'} />
        <Row label="Görseller" value={settings.includeImages ? 'Dahil' : 'Kapalı'} />
        <Row label="Metadata" value={settings.includeMetadata ? 'Dahil' : 'Kapalı'} />
      </Section>
      <Section title="Gelişmiş">
        <Row label="Otomatik yeniden deneme" value={settings.autoRetry ? 'Açık' : 'Kapalı'} />
        <Row label="ZIP saklama" value={`${settings.zipRetentionHours} saat`} />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
      <h2 className="text-base font-semibold text-[rgb(var(--color-text))]">{title}</h2>
      <dl className="mt-3 divide-y divide-[rgb(var(--color-border))]">{children}</dl>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm">
      <dt className="text-[rgb(var(--color-muted))]">{label}</dt>
      <dd className="font-medium text-[rgb(var(--color-text))]">{value}</dd>
    </div>
  )
}
