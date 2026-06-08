export type MessageType = 'text' | 'image'

export interface Message {
  id: string
  conversationId: string
  senderId: string
  text: string
  type: MessageType
  mediaUrl: string | null
  createdAt: string
  isDeleted: boolean
}

export interface ConversationParticipant {
  uid: string
  username: string
  displayName: string
  photoURL: string | null
}

export type ConversationStatus = 'active' | 'pending'

export interface Conversation {
  id: string
  participantIds: string[]
  participants: Record<string, ConversationParticipant>
  lastMessageText: string | null
  lastMessageAt: string | null
  lastMessageSenderId: string | null
  unreadCount: Record<string, number>
  status: ConversationStatus
  createdAt: string
  updatedAt: string
}

export interface ConversationPreview extends Conversation {
  otherParticipant: ConversationParticipant
}
