'use client'

import { useEffect, useState, useCallback } from 'react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { db } from '@/lib/firebase/firestore'
import { collection, query, orderBy, limit, getDocs, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '@/hooks/useAuth'
import { Key, Plus, Copy, Eye, EyeOff, Trash2, RefreshCw, AlertTriangle, CheckCircle2, Activity, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import toast from 'react-hot-toast'

interface ApiKey {
  id: string
  name: string
  key: string
  permissions: string[]
  createdAt: string
  lastUsedAt?: string
  usageCount: number
  isActive: boolean
  createdBy?: string
}

const PERMISSIONS = ['news:read', 'news:write', 'video:read', 'video:write', 'analytics:read', 'search:read']

function generateApiKey() {
  const prefix = 'nhbr'
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const rand = Array.from({ length: 48 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `${prefix}_${rand}`
}

function maskKey(key: string) {
  return key.slice(0, 8) + '••••••••••••••••••••••••' + key.slice(-6)
}

export default function ApiManagementPage() {
  const { user } = useAuth()
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPerms, setNewPerms] = useState<string[]>(['news:read'])
  const [creating, setCreating] = useState(false)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'apiKeys'), orderBy('createdAt', 'desc'), limit(50)))
      setKeys(snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          name: data.name as string,
          key: data.key as string,
          permissions: (data.permissions as string[]) ?? [],
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
          lastUsedAt: data.lastUsedAt?.toDate?.()?.toISOString?.(),
          usageCount: (data.usageCount as number) ?? 0,
          isActive: (data.isActive as boolean) ?? true,
          createdBy: data.createdBy as string | undefined,
        }
      }))
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!newName.trim() || !user) return
    setCreating(true)
    try {
      const newKey = generateApiKey()
      const docRef = await addDoc(collection(db, 'apiKeys'), {
        name: newName.trim(),
        key: newKey,
        permissions: newPerms,
        createdAt: serverTimestamp(),
        usageCount: 0,
        isActive: true,
        createdBy: user.email,
      })
      const created: ApiKey = {
        id: docRef.id,
        name: newName.trim(),
        key: newKey,
        permissions: newPerms,
        createdAt: new Date().toISOString(),
        usageCount: 0,
        isActive: true,
        createdBy: user.email ?? '',
      }
      setKeys(prev => [created, ...prev])
      setRevealedKey(docRef.id)
      setShowCreate(false)
      setNewName('')
      setNewPerms(['news:read'])
      toast.success('API anahtarı oluşturuldu. Kaydedin — bir daha gösterilmeyecek!')
    } catch { toast.error('Oluşturma başarısız') }
    finally { setCreating(false) }
  }

  const handleToggle = async (key: ApiKey) => {
    try {
      await updateDoc(doc(db, 'apiKeys', key.id), { isActive: !key.isActive })
      setKeys(prev => prev.map(k => k.id === key.id ? { ...k, isActive: !k.isActive } : k))
      toast.success(key.isActive ? 'Anahtar devre dışı bırakıldı' : 'Anahtar etkinleştirildi')
    } catch { toast.error('Güncelleme başarısız') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bu API anahtarını silmek istediğinize emin misiniz?')) return
    setDeleting(id)
    try {
      await deleteDoc(doc(db, 'apiKeys', id))
      setKeys(prev => prev.filter(k => k.id !== id))
      toast.success('Anahtar silindi')
    } catch { toast.error('Silme başarısız') }
    finally { setDeleting(null) }
  }

  const copyKey = async (key: string) => {
    await navigator.clipboard.writeText(key)
    toast.success('Kopyalandı!')
  }

  const togglePerm = (p: string) => {
    setNewPerms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  const stats = { total: keys.length, active: keys.filter(k => k.isActive).length, totalCalls: keys.reduce((a, k) => a + k.usageCount, 0) }

  return (
    <div className="flex flex-col">
      <CMSHeader
        title="API Yönetimi"
        subtitle="API anahtarları ve izin yönetimi"
        actions={
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" />Yeni Anahtar
          </button>
        }
      />
      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Toplam Anahtar', value: stats.total, color: 'text-[rgb(var(--color-text))]' },
            { label: 'Aktif', value: stats.active, color: 'text-emerald-600' },
            { label: 'Toplam API Çağrısı', value: stats.totalCalls.toLocaleString('tr-TR'), color: 'text-blue-600' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">{s.label}</p>
              <p className={cn('mt-1 text-2xl font-black tabular-nums', s.color)}>{loading ? '–' : s.value}</p>
            </div>
          ))}
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="rounded-2xl border border-blue-300 bg-blue-50 p-5 dark:border-blue-800 dark:bg-blue-950/30 space-y-4">
            <h3 className="text-sm font-bold text-[rgb(var(--color-text))]">Yeni API Anahtarı</h3>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Anahtar adı (örn: Mobil App v2)"
              className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div>
              <p className="mb-2 text-xs font-semibold text-[rgb(var(--color-muted))]">İzinler:</p>
              <div className="flex flex-wrap gap-2">
                {PERMISSIONS.map(p => (
                  <button
                    key={p}
                    onClick={() => togglePerm(p)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-semibold transition-all',
                      newPerms.includes(p)
                        ? 'bg-blue-600 text-white'
                        : 'border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-muted))]'
                    )}
                  >{p}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={creating || !newName.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
                Oluştur
              </button>
              <button onClick={() => setShowCreate(false)} className="rounded-lg border border-[rgb(var(--color-border))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]">İptal</button>
            </div>
          </div>
        )}

        {/* Keys table */}
        <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-5 py-3">
            <Key className="h-4 w-4 text-[rgb(var(--color-muted))]" />
            <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">API Anahtarları</h2>
            <button onClick={load} className="ml-auto"><RefreshCw className={cn('h-3.5 w-3.5 text-[rgb(var(--color-muted))]', loading && 'animate-spin')} /></button>
          </div>

          {loading ? (
            <div className="space-y-3 p-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-[rgb(var(--color-surface))]" />)}</div>
          ) : keys.length === 0 ? (
            <div className="py-16 text-center text-sm text-[rgb(var(--color-muted))]">Henüz API anahtarı yok. Yukarıdan oluşturun.</div>
          ) : (
            <div className="divide-y divide-[rgb(var(--color-border))]">
              {keys.map(k => (
                <div key={k.id} className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-[rgb(var(--color-surface))] sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-[rgb(var(--color-text))]">{k.name}</p>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold',
                        k.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800')}>
                        {k.isActive ? '● Aktif' : '● Pasif'}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <code className="rounded bg-[rgb(var(--color-surface))] px-2 py-0.5 text-[11px] font-mono text-[rgb(var(--color-muted))]">
                        {revealedKey === k.id ? k.key : maskKey(k.key)}
                      </code>
                      <button onClick={() => setRevealedKey(v => v === k.id ? null : k.id)} className="text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]">
                        {revealedKey === k.id ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                      <button onClick={() => copyKey(k.key)} className="text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]">
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {k.permissions.map(p => (
                        <span key={p} className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{p}</span>
                      ))}
                    </div>
                    <div className="mt-1.5 flex gap-3 text-[10px] text-[rgb(var(--color-muted))]">
                      <span className="flex items-center gap-1"><Activity className="h-2.5 w-2.5" />{k.usageCount} çağrı</span>
                      {k.lastUsedAt && <span>Son: {formatDistanceToNow(new Date(k.lastUsedAt), { locale: tr, addSuffix: true })}</span>}
                      {k.createdBy && <span>Oluşturan: {k.createdBy}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => handleToggle(k)} className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-xs font-bold text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]">
                      {k.isActive ? 'Devre Dışı' : 'Etkinleştir'}
                    </button>
                    <button onClick={() => handleDelete(k.id)} disabled={deleting === k.id}
                      className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50 dark:bg-red-900/20 dark:hover:bg-red-900/40">
                      {deleting === k.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}Sil
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
