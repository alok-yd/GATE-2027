export interface MentorStoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface MentorConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: MentorStoredMessage[];
  summary?: string;
  summarizedMessageCount?: number;
}

const CONVERSATIONS_KEY = 'gate_ai_mentor_conversations_v1';
const ACTIVE_CONVERSATION_KEY = 'gate_ai_mentor_active_conversation_v1';
const MAX_CONVERSATIONS = 8;
const MAX_MESSAGES_PER_CONVERSATION = 60;
const MAX_MESSAGE_CHARS = 4000;

const makeId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `mentor_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const isStoredMessage = (value: unknown): value is MentorStoredMessage => {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    typeof message.timestamp === 'string'
  );
};

const sanitiseConversation = (value: unknown): MentorConversation | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.createdAt !== 'string' ||
    typeof candidate.updatedAt !== 'string' ||
    !Array.isArray(candidate.messages)
  ) {
    return null;
  }

  const messages = candidate.messages
    .filter(isStoredMessage)
    .slice(-MAX_MESSAGES_PER_CONVERSATION)
    .map((message) => ({
      ...message,
      content: message.content.slice(0, MAX_MESSAGE_CHARS),
    }));

  const firstUserMessage = messages.find((message) => message.role === 'user')?.content || '';
  const fallbackTitle = firstUserMessage.replace(/\s+/g, ' ').trim().slice(0, 52);
  return {
    id: candidate.id,
    title:
      typeof candidate.title === 'string' && candidate.title.trim()
        ? candidate.title.trim().slice(0, 60)
        : fallbackTitle || 'New conversation',
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    messages,
    summary: typeof candidate.summary === 'string' ? candidate.summary.slice(0, 3000) : '',
    summarizedMessageCount:
      typeof candidate.summarizedMessageCount === 'number'
        ? Math.max(0, Math.min(messages.length, Math.floor(candidate.summarizedMessageCount)))
        : 0,
  };
};

export const loadMentorConversations = (): MentorConversation[] => {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(CONVERSATIONS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitiseConversation)
      .filter((conversation): conversation is MentorConversation => Boolean(conversation))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_CONVERSATIONS);
  } catch {
    return [];
  }
};

export const saveMentorConversations = (conversations: MentorConversation[]): MentorConversation[] => {
  const bounded = conversations
    .map(sanitiseConversation)
    .filter((conversation): conversation is MentorConversation => Boolean(conversation))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_CONVERSATIONS);

  if (typeof window !== 'undefined') {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(bounded));
    window.dispatchEvent(new Event('gate-mentor-conversations-updated'));
  }
  return bounded;
};

export const getActiveMentorConversationId = (): string =>
  typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_CONVERSATION_KEY) || '' : '';

export const setActiveMentorConversationId = (id: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(ACTIVE_CONVERSATION_KEY, id);
  }
};

export const createMentorConversation = (messages: MentorStoredMessage[] = []): MentorConversation => {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    title: 'New conversation',
    createdAt: now,
    updatedAt: now,
    messages,
  };
};

export const upsertMentorConversation = (
  conversation: MentorConversation,
  messages: MentorStoredMessage[],
  summary?: string,
  summarizedMessageCount?: number
): MentorConversation => {
  const firstUserMessage = messages.find((message) => message.role === 'user')?.content || '';
  const title = firstUserMessage.replace(/\s+/g, ' ').trim().slice(0, 52) || 'New conversation';
  const updated = {
    ...conversation,
    title,
    updatedAt: new Date().toISOString(),
    messages: messages.slice(-MAX_MESSAGES_PER_CONVERSATION),
    summary: summary ?? conversation.summary ?? '',
    summarizedMessageCount: summarizedMessageCount ?? conversation.summarizedMessageCount ?? 0,
  };
  const conversations = loadMentorConversations().filter((item) => item.id !== conversation.id);
  saveMentorConversations([updated, ...conversations]);
  return updated;
};

export const removeMentorConversation = (conversationId: string): MentorConversation[] => {
  const next = loadMentorConversations().filter((conversation) => conversation.id !== conversationId);
  saveMentorConversations(next);
  if (getActiveMentorConversationId() === conversationId) {
    setActiveMentorConversationId(next[0]?.id || '');
  }
  return next;
};
