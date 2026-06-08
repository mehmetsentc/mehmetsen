import { MessageThread } from '@/components/messages/MessageThread'

interface ConversationPageProps {
  params: Promise<{ conversationId: string }>
}

export default async function ConversationPage({ params }: ConversationPageProps) {
  const { conversationId } = await params
  return <MessageThread conversationId={conversationId} />
}
