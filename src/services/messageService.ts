import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import {
  db,
  Collections,
  conversationsRef,
  messagesRef,
} from '@/lib/firebase/firestore'
import { generateConversationId } from '@/lib/utils'
import type { User } from '@/types/user'
import type {
  Conversation,
  ConversationParticipant,
  ConversationPreview,
  Message,
} from '@/types/message'

const MESSAGES_PAGE_SIZE = 50

function mapConversation(id: string, data: Record<string, unknown>): Conversation {
  return {
    id,
    participantIds: (data.participantIds as string[]) ?? [],
    participants: (data.participants as Conversation['participants']) ?? {},
    lastMessageText: (data.lastMessageText as string | null) ?? null,
    lastMessageAt: (data.lastMessageAt as string | null) ?? null,
    lastMessageSenderId: (data.lastMessageSenderId as string | null) ?? null,
    unreadCount: (data.unreadCount as Record<string, number>) ?? {},
    status: (data.status as Conversation['status']) ?? 'active',
    createdAt: (data.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (data.updatedAt as string) ?? new Date().toISOString(),
  }
}

function mapMessage(id: string, conversationId: string, data: Record<string, unknown>): Message {
  return {
    id,
    conversationId,
    senderId: (data.senderId as string) ?? '',
    text: (data.text as string) ?? '',
    type: (data.type as Message['type']) ?? 'text',
    mediaUrl: (data.mediaUrl as string | null) ?? null,
    createdAt: (data.createdAt as string) ?? new Date().toISOString(),
    isDeleted: Boolean(data.isDeleted),
  }
}

function toParticipant(user: User): ConversationParticipant {
  return {
    uid: user.uid,
    username: user.username,
    displayName: user.displayName,
    photoURL: user.photoURL,
  }
}

function getOtherParticipant(
  conversation: Conversation,
  currentUserId: string
): ConversationParticipant | null {
  const otherId = conversation.participantIds.find((id) => id !== currentUserId)
  if (!otherId) return null
  return conversation.participants[otherId] ?? null
}

export const messageService = {
  getConversationId(uidA: string, uidB: string): string {
    return generateConversationId(uidA, uidB)
  },

  toPreview(conversation: Conversation, currentUserId: string): ConversationPreview | null {
    const otherParticipant = getOtherParticipant(conversation, currentUserId)
    if (!otherParticipant) return null
    return { ...conversation, otherParticipant }
  },

  async getConversation(conversationId: string): Promise<Conversation | null> {
    const snap = await getDoc(doc(db, Collections.CONVERSATIONS, conversationId))
    if (!snap.exists()) return null
    return mapConversation(snap.id, snap.data() as Record<string, unknown>)
  },

  async getOrCreateConversation(
    currentUser: User,
    otherUser: User
  ): Promise<Conversation> {
    if (currentUser.uid === otherUser.uid) {
      throw new Error('Kendinize mesaj gönderemezsiniz')
    }

    const conversationId = generateConversationId(currentUser.uid, otherUser.uid)
    const ref = doc(db, Collections.CONVERSATIONS, conversationId)
    const existing = await getDoc(ref)

    if (existing.exists()) {
      return mapConversation(existing.id, existing.data() as Record<string, unknown>)
    }

    const now = new Date().toISOString()

    const conversation: Omit<Conversation, 'id'> = {
      participantIds: [currentUser.uid, otherUser.uid].sort(),
      participants: {
        [currentUser.uid]: toParticipant(currentUser),
        [otherUser.uid]: toParticipant(otherUser),
      },
      lastMessageText: null,
      lastMessageAt: now,
      lastMessageSenderId: null,
      unreadCount: {
        [currentUser.uid]: 0,
        [otherUser.uid]: 0,
      },
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }

    await setDoc(ref, conversation)
    return { id: conversationId, ...conversation }
  },

  subscribeConversations(
    userId: string,
    onUpdate: (conversations: ConversationPreview[]) => void,
    onError?: (error: Error) => void
  ): Unsubscribe {
    const q = query(
      conversationsRef(),
      where('participantIds', 'array-contains', userId),
      orderBy('lastMessageAt', 'desc'),
      limit(50)
    )

    return onSnapshot(
      q,
      (snap) => {
        const previews = snap.docs
          .map((d) => mapConversation(d.id, d.data() as Record<string, unknown>))
          .map((c) => messageService.toPreview(c, userId))
          .filter((c): c is ConversationPreview => c !== null)
        onUpdate(previews)
      },
      (err) => onError?.(err)
    )
  },

  subscribeMessages(
    conversationId: string,
    onUpdate: (messages: Message[]) => void,
    onError?: (error: Error) => void
  ): Unsubscribe {
    const q = query(
      messagesRef(conversationId),
      orderBy('createdAt', 'asc'),
      limit(MESSAGES_PAGE_SIZE)
    )

    return onSnapshot(
      q,
      (snap) => {
        const messages = snap.docs
          .map((d) =>
            mapMessage(d.id, conversationId, d.data() as Record<string, unknown>)
          )
          .filter((m) => !m.isDeleted)
        onUpdate(messages)
      },
      (err) => onError?.(err)
    )
  },

  async sendMessage(
    conversationId: string,
    sender: User,
    text: string
  ): Promise<string> {
    const trimmed = text.trim()
    if (!trimmed) throw new Error('Mesaj boş olamaz')

    const conversationRef = doc(db, Collections.CONVERSATIONS, conversationId)
    const conversationSnap = await getDoc(conversationRef)
    if (!conversationSnap.exists()) {
      throw new Error('Sohbet bulunamadı')
    }

    const conversation = mapConversation(
      conversationSnap.id,
      conversationSnap.data() as Record<string, unknown>
    )

    if (!conversation.participantIds.includes(sender.uid)) {
      throw new Error('Bu sohbete mesaj gönderemezsiniz')
    }

    const now = new Date().toISOString()
    const otherId = conversation.participantIds.find((id) => id !== sender.uid)
    if (!otherId) throw new Error('Alıcı bulunamadı')

    const messageRef = await addDoc(messagesRef(conversationId), {
      senderId: sender.uid,
      text: trimmed,
      type: 'text',
      mediaUrl: null,
      createdAt: now,
      isDeleted: false,
    })

    await updateDoc(conversationRef, {
      lastMessageText: trimmed,
      lastMessageAt: now,
      lastMessageSenderId: sender.uid,
      updatedAt: now,
      [`unreadCount.${otherId}`]: (conversation.unreadCount[otherId] ?? 0) + 1,
      status: 'active',
    })

    return messageRef.id
  },

  async markAsRead(conversationId: string, userId: string): Promise<void> {
    const conversationRef = doc(db, Collections.CONVERSATIONS, conversationId)
    const snap = await getDoc(conversationRef)
    if (!snap.exists()) return

    const conversation = mapConversation(snap.id, snap.data() as Record<string, unknown>)
    if (!conversation.participantIds.includes(userId)) return
    if ((conversation.unreadCount[userId] ?? 0) === 0) return

    await updateDoc(conversationRef, {
      [`unreadCount.${userId}`]: 0,
      updatedAt: new Date().toISOString(),
    })
  },

  async getUnreadTotal(userId: string): Promise<number> {
    const snap = await getDocs(
      query(conversationsRef(), where('participantIds', 'array-contains', userId))
    )
    return snap.docs.reduce((sum, d) => {
      const data = d.data() as Record<string, unknown>
      const unread = (data.unreadCount as Record<string, number>) ?? {}
      return sum + (unread[userId] ?? 0)
    }, 0)
  },
}
