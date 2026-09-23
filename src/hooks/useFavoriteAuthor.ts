'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { arrayRemove, arrayUnion, doc, getDoc, updateDoc } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import { db, Collections } from '@/lib/firebase/firestore'
import { ROUTES } from '@/constants/routes'

export function useFavoriteAuthor(authorUid: string) {
  const { user } = useAuth()
  const router = useRouter()
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user?.uid || !authorUid) {
      setSaved(false)
      return
    }
    let cancelled = false
    void getDoc(doc(db, Collections.USERS, user.uid))
      .then((snap) => {
        if (cancelled) return
        const ids = (snap.data()?.favoriteAuthorIds as string[] | undefined) ?? []
        setSaved(ids.includes(authorUid))
      })
      .catch(() => {
        if (!cancelled) setSaved(false)
      })
    return () => {
      cancelled = true
    }
  }, [user?.uid, authorUid])

  const toggle = useCallback(async () => {
    if (!user?.uid) {
      toast.error('Kaydetmek için giriş yapın')
      router.push(ROUTES.LOGIN)
      return
    }
    if (user.uid === authorUid) return
    setLoading(true)
    try {
      const next = !saved
      await updateDoc(doc(db, Collections.USERS, user.uid), {
        favoriteAuthorIds: next ? arrayUnion(authorUid) : arrayRemove(authorUid),
        updatedAt: new Date().toISOString(),
      })
      setSaved(next)
      toast.success(next ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'İşlem başarısız oldu')
    } finally {
      setLoading(false)
    }
  }, [user?.uid, authorUid, saved, router])

  return { saved, loading, toggle }
}
