'use client'

import { auth, ensureAuthReady } from '@/lib/firebase/auth'

async function socialFetch(
  path: string,
  init?: RequestInit,
  optionalAuth = false,
  /** When true with optionalAuth, still POST/GET without Bearer (e.g. share telemetry). */
  allowAnonymousRequest = false
) {
  await ensureAuthReady()
  const user = auth.currentUser
  if (!user) {
    if (optionalAuth && !allowAnonymousRequest) return {}
    if (!optionalAuth) throw new Error('AUTH_REQUIRED')
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  }
  if (user) {
    headers.Authorization = `Bearer ${await user.getIdToken()}`
  }
  const res = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : 'REQUEST_FAILED')
  }
  return body
}

export const socialApi = {
  followPublisher(publisherId: string) {
    return socialFetch('/api/social/publisher/follow', {
      method: 'POST',
      body: JSON.stringify({ publisherId }),
    })
  },
  unfollowPublisher(publisherId: string) {
    return socialFetch('/api/social/publisher/unfollow', {
      method: 'POST',
      body: JSON.stringify({ publisherId }),
    })
  },
  likeArticle(articleId: string, reaction: string = 'LIKE') {
    return socialFetch('/api/social/article/like', {
      method: 'POST',
      body: JSON.stringify({ articleId, reaction }),
    })
  },
  unlikeArticle(articleId: string) {
    return socialFetch('/api/social/article/unlike', {
      method: 'POST',
      body: JSON.stringify({ articleId }),
    })
  },
  saveArticle(articleId: string) {
    return socialFetch('/api/social/article/save', {
      method: 'POST',
      body: JSON.stringify({ articleId }),
    })
  },
  unsaveArticle(articleId: string) {
    return socialFetch('/api/social/article/unsave', {
      method: 'POST',
      body: JSON.stringify({ articleId }),
    })
  },
  recordShare(articleId: string) {
    return socialFetch(
      '/api/social/article/share',
      {
        method: 'POST',
        body: JSON.stringify({ articleId }),
      },
      true,
      true
    )
  },
  getArticleState(articleIds: string[]) {
    const q = encodeURIComponent(articleIds.join(','))
    return socialFetch(`/api/social/article/state?ids=${q}`, { method: 'GET' }, true)
  },
  getPublisherState(publisherIds: string[]) {
    const q = encodeURIComponent(publisherIds.join(','))
    return socialFetch(`/api/social/publisher/state?ids=${q}`, { method: 'GET' }, true)
  },
  createComment(articleId: string, content: string, parentId?: string | null) {
    return socialFetch('/api/social/comments', {
      method: 'POST',
      body: JSON.stringify({ articleId, content, parentId: parentId ?? null }),
    })
  },
  deleteComment(commentId: string) {
    return socialFetch(`/api/social/comments/${encodeURIComponent(commentId)}`, {
      method: 'DELETE',
    })
  },
}
