import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
const schedule = vi.fn()
vi.mock('@/services/newsMirror/newsReadMirror', () => ({ scheduleNewsMirror: schedule }))

import { revalidatePublishedNews } from '@/lib/revalidateHome'

describe('FinOps Neon phase 1: publish/edit/unpublish hook', () => {
  afterEach(() => {
    delete process.env.NEWS_PG_MIRROR
    schedule.mockClear()
  })

  it('does nothing while NEWS_PG_MIRROR is off', async () => {
    revalidatePublishedNews('ankara-deprem')
    await new Promise((r) => setTimeout(r, 20))
    expect(schedule).not.toHaveBeenCalled()
  })

  it('mirrors the article when the flag is on', async () => {
    process.env.NEWS_PG_MIRROR = '1'
    revalidatePublishedNews(' ankara-deprem ')
    await vi.waitFor(() => expect(schedule).toHaveBeenCalledWith('ankara-deprem'))
  })

  it('skips an empty slug', async () => {
    process.env.NEWS_PG_MIRROR = '1'
    revalidatePublishedNews('')
    await new Promise((r) => setTimeout(r, 20))
    expect(schedule).not.toHaveBeenCalled()
  })
})
