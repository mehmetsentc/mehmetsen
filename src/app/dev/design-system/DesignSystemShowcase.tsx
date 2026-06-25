'use client'

import { useState } from 'react'
import {
  ArrowRight,
  Bell,
  BookmarkPlus,
  Heart,
  MessageCircle,
  Mic,
  Moon,
  Newspaper,
  PlayCircle,
  Send,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { toast } from '@/components/ui/Toast'
import { useTheme } from '@/store/themeContext'
import type { ThemePreference } from '@/lib/theme'

const COLOR_TOKENS = [
  { name: 'brand-500', var: '--brand-500', hint: '#E50914 (Master brand)' },
  { name: 'brand-600', var: '--brand-600', hint: 'Hover state' },
  { name: 'support-500', var: '--support-500', hint: '#FF3B30 (iOS red)' },
  { name: 'success-500', var: '--success-500', hint: 'Emerald' },
  { name: 'warning-500', var: '--warning-500', hint: 'Amber' },
  { name: 'danger-500', var: '--danger-500', hint: 'Red' },
  { name: 'info-500', var: '--info-500', hint: 'Blue' },
]

const CATEGORY_TOKENS: { slug: string; var: string }[] = [
  { slug: 'gundem',     var: '--cat-gundem' },
  { slug: 'sondakika',  var: '--cat-sondakika' },
  { slug: 'siyaset',    var: '--cat-siyaset' },
  { slug: 'ekonomi',    var: '--cat-ekonomi' },
  { slug: 'spor',       var: '--cat-spor' },
  { slug: 'dunya',      var: '--cat-dunya' },
  { slug: 'teknoloji',  var: '--cat-teknoloji' },
  { slug: 'saglik',     var: '--cat-saglik' },
  { slug: 'kultur',     var: '--cat-kultur' },
  { slug: 'yerel',      var: '--cat-yerel' },
  { slug: 'yasam',      var: '--cat-yasam' },
  { slug: 'video',      var: '--cat-video' },
  { slug: 'egitim',     var: '--cat-egitim' },
  { slug: 'magazin',    var: '--cat-magazin' },
  { slug: 'hava',       var: '--cat-hava' },
]

const TYPE_SCALE = [
  { name: 'fs-6xl (60)', cls: 'text-6xl' },
  { name: 'fs-5xl (48)', cls: 'text-5xl' },
  { name: 'fs-4xl (36)', cls: 'text-4xl' },
  { name: 'fs-3xl (30)', cls: 'text-3xl' },
  { name: 'fs-2xl (24)', cls: 'text-2xl' },
  { name: 'fs-xl  (20)', cls: 'text-xl' },
  { name: 'fs-lg  (18)', cls: 'text-lg' },
  { name: 'fs-md  (16)', cls: 'text-base' },
  { name: 'fs-sm  (13)', cls: 'text-sm' },
  { name: 'fs-xs  (12)', cls: 'text-xs' },
]

export function DesignSystemShowcase() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [modalOpen, setModalOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <div className="min-h-dvh bg-bg-base px-4 py-8 text-text-primary sm:px-8">
      <header className="mx-auto max-w-5xl">
        <p className="text-2xs font-bold uppercase tracking-widest text-brand-500">
          F1 · Foundation
        </p>
        <h1 className="mt-1 text-4xl font-black tracking-tight">NaHaber 2026 — Tasarım Sistemi</h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-text-tertiary">
          Tokenlar, tipografi, renkler, kategori accent&apos;ları, premium component
          primitive&apos;leri. Bu sayfa sadece geliştirme ortamında görünür.
        </p>
      </header>

      {/* ── Tema seçici ─────────────────────────────────────────────── */}
      <section className="mx-auto mt-8 max-w-5xl">
        <SectionTitle label="Tema" />
        <Card surface="elevated" radius="2xl" className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <p className="mr-auto text-sm text-text-tertiary">
              Şu anki tema: <span className="font-bold text-text-primary">{theme}</span> · resolved:{' '}
              <span className="font-bold text-text-primary">{resolvedTheme}</span>
            </p>
            {(['light', 'dark', 'oled', 'system'] as ThemePreference[]).map((t) => (
              <Button
                key={t}
                size="sm"
                variant={theme === t ? 'solid' : 'outline'}
                leftIcon={
                  t === 'light' ? (
                    <Sun className="h-4 w-4" />
                  ) : t === 'system' ? (
                    <Sparkles className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )
                }
                onClick={() => setTheme(t)}
              >
                {t}
              </Button>
            ))}
          </div>
        </Card>
      </section>

      {/* ── Renkler ─────────────────────────────────────────────────── */}
      <section className="mx-auto mt-10 max-w-5xl">
        <SectionTitle label="Renk Tokenları (Semantic)" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {COLOR_TOKENS.map((c) => (
            <Card key={c.var} radius="xl" className="p-3">
              <div
                className="h-16 w-full rounded-lg"
                style={{ background: `rgb(var(${c.var}))` }}
              />
              <p className="mt-3 font-mono text-xs text-text-secondary">{c.var}</p>
              <p className="text-2xs text-text-muted">{c.hint}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Kategori Accentleri ─────────────────────────────────────── */}
      <section className="mx-auto mt-10 max-w-5xl">
        <SectionTitle label="Kategori Accentleri" />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {CATEGORY_TOKENS.map((c) => (
            <div key={c.slug} className="text-center">
              <div
                className="h-14 w-full rounded-xl shadow-sm"
                style={{ background: `rgb(var(${c.var}))` }}
              />
              <p className="mt-1.5 font-mono text-2xs text-text-tertiary">{c.slug}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Tipografi ───────────────────────────────────────────────── */}
      <section className="mx-auto mt-10 max-w-5xl">
        <SectionTitle label="Type Scale" />
        <Card radius="2xl" className="divide-y divide-border-subtle">
          {TYPE_SCALE.map((t) => (
            <div key={t.name} className="flex items-baseline gap-4 px-5 py-3">
              <span className="w-32 shrink-0 font-mono text-xs text-text-tertiary">
                {t.name}
              </span>
              <span className={`${t.cls} font-bold tracking-tight`}>
                NaHaber — haber yaşamak
              </span>
            </div>
          ))}
        </Card>
      </section>

      {/* ── Button variantları ──────────────────────────────────────── */}
      <section className="mx-auto mt-10 max-w-5xl">
        <SectionTitle label="Button — variant × size" />
        <Card radius="2xl" className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="solid">Solid</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="soft">Soft</Button>
            <Button variant="inverse">Inverse</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button variant="destructive" leftIcon={<Trash2 className="h-4 w-4" />}>Sil</Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button size="sm">sm</Button>
            <Button size="md">md</Button>
            <Button size="lg">lg</Button>
            <Button size="xl">xl</Button>
            <Button size="icon" aria-label="ikon"><Bell className="h-5 w-5" /></Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button loading>Kaydediliyor…</Button>
            <Button leftIcon={<Heart className="h-4 w-4" />}>Beğen</Button>
            <Button variant="outline" rightIcon={<ArrowRight className="h-4 w-4" />}>
              Devam et
            </Button>
            <Button variant="solid" leftIcon={<Mic className="h-4 w-4" />}>
              Dinle
            </Button>
          </div>
        </Card>
      </section>

      {/* ── Card variantları ────────────────────────────────────────── */}
      <section className="mx-auto mt-10 max-w-5xl">
        <SectionTitle label="Card — surface × hover" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(['plain', 'subtle', 'elevated', 'glass'] as const).map((surface) => (
            <Card key={surface} surface={surface} hover="lift" radius="2xl">
              <CardHeader>
                <CardTitle>{surface}</CardTitle>
                <CardDescription>Apple-tarzı yumuşak hover, lift animasyon.</CardDescription>
              </CardHeader>
              <CardBody>
                <p className="text-sm leading-relaxed text-text-secondary">
                  Token sisteminden beslenir; tema değişince otomatik renk
                  ayarlanır.
                </p>
              </CardBody>
              <CardFooter>
                <Badge variant="solid" size="sm">{surface}</Badge>
                <Button size="sm" variant="ghost" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  Daha fazla
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Badge variantları ───────────────────────────────────────── */}
      <section className="mx-auto mt-10 max-w-5xl">
        <SectionTitle label="Badge — variant × size" />
        <Card radius="2xl" className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="solid">Solid</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="success">Doğrulandı</Badge>
            <Badge variant="warning">Uyarı</Badge>
            <Badge variant="danger">Hata</Badge>
            <Badge variant="sondakika" uppercase pulse>Son Dakika</Badge>
            <Badge variant="breaking" uppercase>Breaking</Badge>
            <Badge variant="trending">Trend</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {CATEGORY_TOKENS.map((c) => (
              <Badge
                key={c.slug}
                variant={c.slug as 'siyaset' | 'ekonomi' | 'spor'}
              >
                {c.slug}
              </Badge>
            ))}
          </div>
        </Card>
      </section>

      {/* ── Modal + Sheet + Toast ───────────────────────────────────── */}
      <section className="mx-auto mt-10 max-w-5xl">
        <SectionTitle label="Modal / BottomSheet / Toast" />
        <Card radius="2xl" className="flex flex-wrap items-center gap-2 p-5">
          <Button leftIcon={<MessageCircle className="h-4 w-4" />} onClick={() => setModalOpen(true)}>
            Modal aç
          </Button>
          <Button variant="outline" leftIcon={<BookmarkPlus className="h-4 w-4" />} onClick={() => setSheetOpen(true)}>
            BottomSheet aç
          </Button>
          <Button
            variant="soft"
            leftIcon={<Send className="h-4 w-4" />}
            onClick={() => toast.success('Haber kaydedildi', { description: 'Profil → Kayıtlılar' })}
          >
            Success toast
          </Button>
          <Button
            variant="ghost"
            onClick={() => toast.error('Bağlantı kesildi', { description: 'Lütfen tekrar dene' })}
          >
            Error toast
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              toast.info('Yeni haber geldi', {
                action: { label: 'Aç', onClick: () => toast.success('Açılıyor') },
              })
            }
          >
            Action toast
          </Button>
        </Card>
      </section>

      {/* ── Örnek haber kartı (yeni tasarım dili) ───────────────────── */}
      <section className="mx-auto mt-10 max-w-5xl">
        <SectionTitle label="Örnek: Premium Haber Kartı (yeni stil)" />
        <Card surface="elevated" hover="lift" radius="2xl" className="overflow-hidden">
          <div className="relative h-48 w-full bg-gradient-to-br from-brand-700 via-brand-500 to-cat-spor">
            <Badge
              variant="sondakika"
              uppercase
              pulse
              size="sm"
              className="absolute left-4 top-4 shadow-lg"
            >
              Son Dakika
            </Badge>
            <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 text-2xs font-semibold text-white backdrop-blur-md">
              <PlayCircle className="h-3.5 w-3.5" />
              2:14
            </span>
            <h3 className="absolute bottom-4 left-4 right-4 text-2xl font-black leading-tight tracking-tight text-white drop-shadow-lg">
              İstanbul&apos;da yeni ulaşım projesi hayata geçiriliyor
            </h3>
          </div>
          <CardBody className="space-y-3">
            <p className="text-sm leading-relaxed text-text-secondary">
              AI Editörün özeti: İstanbul trafiğini rahatlatacak iki yeni
              metro hattı için imza atıldı; ilk faz 2027&apos;de açılıyor.
            </p>
            <div className="flex items-center gap-3 text-2xs text-text-tertiary">
              <span className="inline-flex items-center gap-1">
                <Newspaper className="h-3.5 w-3.5" /> 3 dk okuma
              </span>
              <span aria-hidden>·</span>
              <span>456 beğeni</span>
              <span aria-hidden>·</span>
              <span>23 yorum</span>
            </div>
          </CardBody>
          <CardFooter>
            <Button size="sm" variant="ghost" leftIcon={<Mic className="h-4 w-4" />}>
              Dinle
            </Button>
            <Button size="sm" variant="ghost" leftIcon={<Heart className="h-4 w-4" />}>
              Beğen
            </Button>
            <Button size="sm" variant="ghost" leftIcon={<BookmarkPlus className="h-4 w-4" />}>
              Kaydet
            </Button>
            <Button size="sm" variant="solid" className="ml-auto" rightIcon={<ArrowRight className="h-4 w-4" />}>
              Habere git
            </Button>
          </CardFooter>
        </Card>
      </section>

      {/* ── Modaller ────────────────────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Habere yorum yap"
        description="Topluluk kurallarına uygun olduğundan emin ol."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Vazgeç
            </Button>
            <Button
              variant="solid"
              onClick={() => {
                setModalOpen(false)
                toast.success('Yorumun gönderildi')
              }}
            >
              Gönder
            </Button>
          </>
        }
      >
        <textarea
          className="w-full rounded-xl border border-border bg-bg-subtle px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          rows={4}
          placeholder="Yorumunu yaz…"
        />
      </Modal>

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Bu haberi paylaş"
        size="md"
      >
        <div className="grid grid-cols-4 gap-3 px-2 py-3">
          {['WhatsApp', 'X', 'Instagram', 'Telegram', 'E-posta', 'Link kopyala', 'Mesaj', 'Daha fazla'].map(
            (s) => (
              <button
                key={s}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-bg-subtle p-3 text-xs font-medium text-text-primary transition-colors hover:bg-bg-muted"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/10 text-brand-500">
                  <Send className="h-5 w-5" />
                </span>
                {s}
              </button>
            )
          )}
        </div>
      </BottomSheet>

      <footer className="mx-auto mt-16 max-w-5xl border-t border-border-subtle pt-6 text-2xs text-text-muted">
        NaHaber 2026 — F1 Tasarım Sistemi Çekirdeği · /dev/design-system
      </footer>
    </div>
  )
}

function SectionTitle({ label }: { label: string }) {
  return (
    <h2 className="mb-3 text-2xs font-bold uppercase tracking-widest text-text-tertiary">
      {label}
    </h2>
  )
}
