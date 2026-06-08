'use client'

import { useState, useCallback, useEffect } from 'react'
import toast from 'react-hot-toast'
import { saveService } from '@/services/saveService'
import { useAuth } from '@/hooks/useAuth'

interface UseSaveOptions {
  postId: string
  initialSaved?: boolean
  initialCount?: number
}

export function useSave({ postId, initialSaved = false, initialCount = 0 }: UseSaveOptions) {
  const { user } = useAuth()
  const [saved, setSaved] = useState(initialSaved)
  const [count, setCount] = useState(initialCount)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user?.uid || !postId) return
    let cancelled = false
    saveService.isSaved(user.uid, postId).then((isSaved) => {
      if (!cancelled) setSaved(isSaved)
    })
    return () => {
      cancelled = true
    }
  }, [user?.uid, postId])

  const toggle = useCallback(async () => {
    if (!user) {
      toast.error('Kaydetmek için giriş yapın')
      return
    }
    if (loading) return

    const prevSaved = saved
    const prevCount = count
    setSaved(!prevSaved)
    setCount(prevSaved ? prevCount - 1 : prevCount + 1)
    setLoading(true)

    try {
      const newSaved = await saveService.toggle(user.uid, postId, prevSaved)
      setSaved(newSaved)
      setCount(newSaved ? prevCount + 1 : prevCount - 1)
      toast.success(newSaved ? 'Kaydedildi' : 'Kayıttan kaldırıldı')
    } catch {
      setSaved(prevSaved)
      setCount(prevCount)
      toast.error('Kaydetme işlemi başarısız oldu')
    } finally {
      setLoading(false)
    }
  }, [user, postId, saved, count, loading])

  return { saved, count, toggle, loading, setSaved, setCount }
}
