// TODO: Implement in Phase 1
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(_date: string): string {
  // TODO: implement with date-fns
  return ''
}

export function truncate(_str: string, _maxLength: number): string {
  // TODO: implement
  return ''
}

export function slugify(_text: string): string {
  // TODO: implement
  return ''
}

export function generateLikeId(userId: string, targetId: string): string {
  return `${userId}_${targetId}`
}

export function generateFollowId(followerId: string, followingId: string): string {
  return `${followerId}_${followingId}`
}

export function generateSaveId(userId: string, postId: string): string {
  return `${userId}_${postId}`
}
