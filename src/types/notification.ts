export type NotificationType = 'like' | 'comment' | 'follow' | 'mention' | 'system'

export interface Notification {
  id: string
  /** Recipient user id — the person who SEES this notification. */
  userId: string
  type: NotificationType
  /** The user who triggered the notification (absent for system notifications). */
  actorId?: string
  actorUsername?: string
  actorDisplayName?: string
  actorPhotoURL?: string | null
  /** Related content, when applicable. */
  postId?: string
  commentId?: string
  /** Free-form text (comment snippet, system message, etc.). */
  text?: string
  read: boolean
  createdAt: string
}

export interface CreateNotificationInput {
  userId: string
  type: NotificationType
  actorId?: string
  actorUsername?: string
  actorDisplayName?: string
  actorPhotoURL?: string | null
  postId?: string
  commentId?: string
  text?: string
}
