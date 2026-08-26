/**
 * P3 social graph repository tests — in-memory simulation (no live DB).
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { validateUsername, isReservedUsername } from '@/lib/social/username'

type FollowRow = { userId: string; publisherId: string }
type LikeRow = { userId: string; articleId: string }
type SaveRow = { userId: string; articleId: string }

class MemorySocialRepo {
  follows: FollowRow[] = []
  likes: LikeRow[] = []
  saves: SaveRow[] = []

  followPublisher(userId: string, publisherId: string): boolean {
    if (this.follows.some((f) => f.userId === userId && f.publisherId === publisherId)) return false
    this.follows.push({ userId, publisherId })
    return true
  }

  unfollowPublisher(userId: string, publisherId: string): boolean {
    const before = this.follows.length
    this.follows = this.follows.filter((f) => !(f.userId === userId && f.publisherId === publisherId))
    return this.follows.length < before
  }

  likeArticle(userId: string, articleId: string): boolean {
    if (this.likes.some((l) => l.userId === userId && l.articleId === articleId)) return false
    this.likes.push({ userId, articleId })
    return true
  }

  saveArticle(userId: string, articleId: string): boolean {
    if (this.saves.some((s) => s.userId === userId && s.articleId === articleId)) return false
    this.saves.push({ userId, articleId })
    return true
  }

  listSavedForUser(userId: string): string[] {
    return this.saves.filter((s) => s.userId === userId).map((s) => s.articleId)
  }
}

describe('P3 social graph idempotency', () => {
  let repo: MemorySocialRepo

  beforeEach(() => {
    repo = new MemorySocialRepo()
  })

  it('follow is idempotent', () => {
    expect(repo.followPublisher('u1', 'p1')).toBe(true)
    expect(repo.followPublisher('u1', 'p1')).toBe(false)
    expect(repo.follows).toHaveLength(1)
  })

  it('like duplicate blocked', () => {
    expect(repo.likeArticle('u1', 'a1')).toBe(true)
    expect(repo.likeArticle('u1', 'a1')).toBe(false)
  })

  it('save is private per user', () => {
    repo.saveArticle('u1', 'a1')
    repo.saveArticle('u2', 'a2')
    expect(repo.listSavedForUser('u1')).toEqual(['a1'])
    expect(repo.listSavedForUser('u2')).toEqual(['a2'])
  })

  it('unfollow removes relation', () => {
    repo.followPublisher('u1', 'p1')
    expect(repo.unfollowPublisher('u1', 'p1')).toBe(true)
    expect(repo.follows).toHaveLength(0)
  })
})

describe('P3 profile username validation', () => {
  it('rejects reserved and accepts valid', () => {
    expect(isReservedUsername('api')).toBe(true)
    const ok = validateUsername('demo_user_42')
    expect(ok.ok).toBe(true)
  })
})
